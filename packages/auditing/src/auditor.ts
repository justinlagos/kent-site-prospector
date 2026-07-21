import { mkdir } from "node:fs/promises";
import path from "node:path";
import { type Browser, type Page } from "playwright";
import { launchBrowser } from "./browser.js";
import { type Logger } from "@ksp/shared";
import { AuditFindings, AuditReport, emptyFindings } from "./types.js";
import { computeScores, fleschKincaidGrade } from "./scores.js";
import { mockAudit } from "./mock-audit.js";

const USER_AGENT =
  "KentSiteProspectorAuditBot/1.0 (single-page website review; contact: see sending domain)";

const VIEWPORTS = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1440", width: 1440, height: 900 },
] as const;

/**
 * Audit a business's public homepage.
 *
 * Boundaries, by design:
 *  - robots.txt is fetched first; if the homepage is disallowed for `*` or for our UA,
 *    we do NOT load the page (audit records robotsAllowed=false, minimal external data).
 *  - Only the homepage is loaded. Broken-link checking issues HEAD requests to at most
 *    10 same-origin links. No crawling, no auth, no CAPTCHA interaction, no paywall bypass.
 *  - Honest user agent.
 */
export async function auditWebsite(
  websiteUrl: string | null,
  opts: {
    logger: Logger;
    screenshotDir: string; // absolute or repo-relative dir for this business
    fetchImpl?: typeof fetch;
  },
): Promise<AuditReport> {
  const fetchImpl = opts.fetchImpl ?? fetch;

  if (!websiteUrl) {
    const findings = emptyFindings();
    findings.notes.push("No website on record");
    return { findings, scores: computeScores(findings), evidence: {}, screenshotPaths: {} };
  }

  // Mock-mode short-circuit: reserved example domains never touch the network.
  if (/\.example\.(com|org|net)/.test(websiteUrl) || websiteUrl.includes("mockquality=")) {
    return mockAudit(websiteUrl, opts.screenshotDir);
  }

  let url: URL;
  try {
    url = new URL(websiteUrl);
  } catch {
    const findings = emptyFindings();
    findings.hasWebsite = true;
    findings.notes.push("Website URL is malformed");
    return { findings, scores: computeScores(findings), evidence: { websiteUrl }, screenshotPaths: {} };
  }

  const findings = emptyFindings();
  findings.hasWebsite = true;
  const evidence: Record<string, unknown> = { url: url.href };

  // 1. robots.txt
  const allowed = await robotsAllows(url, fetchImpl, opts.logger);
  findings.robotsAllowed = allowed;
  if (!allowed) {
    findings.notes.push("robots.txt disallows automated access to the homepage; page not loaded");
    return { findings, scores: computeScores(findings), evidence, screenshotPaths: {} };
  }

  let browser: Browser | null = null;
  const screenshotPaths: Record<string, string> = {};
  try {
    browser = await launchBrowser();
    const context = await browser.newContext({ userAgent: USER_AGENT, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    let totalBytes = 0;
    page.on("response", (r) => {
      const len = r.headers()["content-length"];
      if (len) totalBytes += Number(len) || 0;
    });

    const started = Date.now();
    const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(1500);
    findings.loadTimeMs = Date.now() - started;
    findings.statusCode = response?.status() ?? null;
    findings.reachable = Boolean(response && response.status() < 400);
    findings.https = page.url().startsWith("https://");
    findings.pageWeightBytes = totalBytes || null;
    evidence.finalUrl = page.url();

    if (findings.reachable) {
      await collectPageFindings(page, findings, evidence, fetchImpl);

      // Mobile overflow check + screenshots at three viewports.
      await mkdir(opts.screenshotDir, { recursive: true });
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(400);
        if (vp.name === "mobile-390") {
          findings.mobileHorizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth + 5,
          );
        }
        const file = path.join(opts.screenshotDir, `${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: false });
        screenshotPaths[vp.name] = file;
      }
    }
  } catch (err) {
    findings.reachable = false;
    findings.notes.push(`Load failed: ${err instanceof Error ? err.message.slice(0, 200) : "unknown"}`);
  } finally {
    await browser?.close();
  }

  return { findings, scores: computeScores(findings), evidence, screenshotPaths };
}

async function robotsAllows(url: URL, fetchImpl: typeof fetch, logger: Logger): Promise<boolean> {
  try {
    const res = await fetchImpl(`${url.origin}/robots.txt`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return true; // no robots.txt => allowed
    const text = await res.text();
    return robotsTxtAllowsPath(text, url.pathname || "/");
  } catch {
    logger.debug("robots.txt fetch failed; treating as allowed");
    return true;
  }
}

/** Minimal robots.txt evaluation for User-agent: * (and our bot token), longest-match rule. */
export function robotsTxtAllowsPath(robotsTxt: string, pathName: string): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());
  let applies = false;
  const rules: Array<{ allow: boolean; prefix: string }> = [];
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      applies = value === "*" || value.toLowerCase().includes("kentsiteprospector");
    } else if (applies && (key === "disallow" || key === "allow")) {
      if (value === "" && key === "disallow") continue; // empty disallow = allow all
      rules.push({ allow: key === "allow", prefix: value });
    }
  }
  let best: { allow: boolean; prefix: string } | null = null;
  for (const rule of rules) {
    if (pathName.startsWith(rule.prefix)) {
      if (!best || rule.prefix.length > best.prefix.length) best = rule;
    }
  }
  return best ? best.allow : true;
}

async function collectPageFindings(
  page: Page,
  findings: AuditFindings,
  evidence: Record<string, unknown>,
  fetchImpl: typeof fetch,
): Promise<void> {
  const currentYear = new Date().getFullYear();

  const raw = await page.evaluate(() => {
    const text = document.body?.innerText ?? "";
    const html = document.documentElement.outerHTML;
    const anchors = Array.from(document.querySelectorAll("a[href]")).map((a) => ({
      href: (a as HTMLAnchorElement).href,
      text: (a.textContent ?? "").trim().slice(0, 80),
    }));
    const images = Array.from(document.querySelectorAll("img"));
    const fixedEls = Array.from(document.querySelectorAll("*")).filter((el) => {
      const s = window.getComputedStyle(el);
      return (
        (s.position === "fixed" || s.position === "sticky") &&
        Number(s.zIndex) > 100 &&
        el.clientHeight > 150 &&
        el.clientWidth > 250
      );
    }).length;
    return {
      text,
      htmlLength: html.length,
      title: document.title || null,
      metaDescription:
        document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null,
      viewportMeta: Boolean(document.querySelector('meta[name="viewport"]')),
      h1: Boolean(document.querySelector("h1")),
      anchors,
      imageCount: images.length,
      brokenImages: images.filter((i) => i.complete && i.naturalWidth === 0).length,
      imagesMissingAlt: images.filter((i) => !i.getAttribute("alt")).length,
      forms: document.querySelectorAll("form").length,
      navLinks: document.querySelectorAll("nav a, header a").length,
      fixedOverlays: fixedEls,
      scriptsSrc: Array.from(document.querySelectorAll("script[src]")).map(
        (s) => (s as HTMLScriptElement).src,
      ),
      inlineScriptText: Array.from(document.querySelectorAll("script:not([src])"))
        .map((s) => s.textContent?.slice(0, 500) ?? "")
        .join("\n")
        .slice(0, 5000),
      buttonsText: Array.from(document.querySelectorAll("button, a.btn, a[class*='button'], input[type='submit']"))
        .map((b) => (b.textContent ?? (b as HTMLInputElement).value ?? "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 50),
    };
  });

  findings.title = raw.title;
  findings.titleMissing = !raw.title || raw.title.trim().length < 4;
  findings.metaDescriptionMissing = !raw.metaDescription || raw.metaDescription.trim().length < 20;
  findings.viewportMetaPresent = raw.viewportMeta;
  findings.h1Present = raw.h1;
  findings.imageCount = raw.imageCount;
  findings.brokenImageCount = raw.brokenImages;
  findings.imagesMissingAltCount = raw.imagesMissingAlt;
  findings.hasForm = raw.forms > 0;
  findings.navLinkCount = raw.navLinks;
  findings.intrusivePopupSuspected = raw.fixedOverlays > 1;

  const text = raw.text;
  findings.wordCount = text.split(/\s+/).filter(Boolean).length;
  findings.readabilityFleschKincaid = fleschKincaidGrade(text);

  const anchors = raw.anchors;
  findings.hasPhoneLink = anchors.some((a) => a.href.startsWith("tel:"));
  findings.hasEmailLink = anchors.some((a) => a.href.startsWith("mailto:"));
  const phoneInText = /\b0\d{2,4}[\s-]?\d{5,8}\b/.test(text);
  const emailInText = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,}/.test(text);
  findings.contactInfoVisible = findings.hasPhoneLink || findings.hasEmailLink || phoneInText || emailInText;

  const ctaWords = ["book", "quote", "enquire", "enquiry", "contact", "call", "appointment", "order", "reserve", "get started"];
  findings.hasCallToAction = raw.buttonsText.some((b) => ctaWords.some((w) => b.includes(w))) ||
    anchors.some((a) => ctaWords.some((w) => a.text.toLowerCase().includes(w)));
  findings.hasBookingFunctionality =
    /book (online|now|an appointment)|online booking/i.test(text) ||
    raw.scriptsSrc.some((s) => /calendly|acuity|fresha|treatwell|resdiary|opentable|setmore|cliniko/i.test(s));

  const yearMatches = [...text.matchAll(/(?:©|copyright)\s*(\d{4})/gi)].map((m) => Number(m[1]));
  if (yearMatches.length > 0) {
    findings.copyrightYear = Math.max(...yearMatches);
    findings.copyrightOutdated = currentYear - findings.copyrightYear >= 2;
  }
  findings.outdatedAnnouncement = /covid[- ]?19|coronavirus|lockdown/i.test(text);

  const trust: string[] = [];
  if (/checkatrade|trustpilot|which\? trusted|trading standards/i.test(text)) trust.push("third-party-scheme");
  if (/gas safe|niceic|federation of master builders|cqc|gdc|gmc|hcpc|sra regulated/i.test(text)) trust.push("regulator-or-accreditation");
  if (/insured|insurance backed|guarantee/i.test(text)) trust.push("assurance-language");
  findings.trustSignals = trust;
  findings.reviewsMentioned = /review|testimonial|rated us|stars/i.test(text);
  findings.socialProofPresent = findings.reviewsMentioned || trust.length > 0;

  findings.hasCookieBanner = /cookie/i.test(text.slice(0, 2000)) || /cookieconsent|cookiebot|onetrust/i.test(raw.scriptsSrc.join(" "));
  findings.hasPrivacyPage = anchors.some((a) => /privacy/i.test(a.href) || /privacy/i.test(a.text));
  findings.hasTermsPage = anchors.some((a) => /terms|conditions/i.test(a.href + a.text));

  const analytics: string[] = [];
  const scriptBlob = raw.scriptsSrc.join(" ") + " " + raw.inlineScriptText;
  if (/googletagmanager|gtag\(|google-analytics/i.test(scriptBlob)) analytics.push("google-analytics");
  if (/fbq\(|facebook\.net\/.*fbevents/i.test(scriptBlob)) analytics.push("meta-pixel");
  if (/hotjar/i.test(scriptBlob)) analytics.push("hotjar");
  findings.analyticsDetected = analytics;

  const local: string[] = [];
  for (const kw of ["kent", "maidstone", "canterbury", "medway", "ashford", "tunbridge", "dartford", "thanet", "folkestone", "dover", "gravesend", "sevenoaks", "tonbridge", "sittingbourne", "faversham", "margate", "ramsgate", "whitstable"]) {
    if (text.toLowerCase().includes(kw)) local.push(kw);
  }
  findings.localRelevanceSignals = local.slice(0, 8);

  if (raw.imagesMissingAlt > 3) findings.accessibilityIssues.push("multiple images missing alt text");
  if (!raw.h1) findings.accessibilityIssues.push("no h1 heading");

  // Broken links: HEAD-check up to 10 same-origin links.
  const origin = new URL(page.url()).origin;
  const sameOrigin = [...new Set(anchors.map((a) => a.href))]
    .filter((h) => h.startsWith(origin) && !h.includes("#"))
    .slice(0, 10);
  findings.checkedLinkCount = sameOrigin.length;
  for (const link of sameOrigin) {
    try {
      const res = await fetchImpl(link, {
        method: "HEAD",
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(8000),
        redirect: "follow",
      });
      if (res.status >= 400) findings.brokenLinkCount += 1;
    } catch {
      findings.brokenLinkCount += 1;
    }
  }

  evidence.titleText = raw.title;
  evidence.metaDescription = raw.metaDescription;
  evidence.sampledLinks = sameOrigin;
  evidence.buttonsSample = raw.buttonsText.slice(0, 15);
  evidence.textSample = text.slice(0, 1500);
}
