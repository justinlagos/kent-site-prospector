import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { launchBrowser } from "@ksp/auditing";
import type { PrismaClient } from "@ksp/database";
import { type AgencyIdentity, type Logger } from "@ksp/shared";
import type { ResearchBrief } from "@ksp/research";
import { validateClaims } from "@ksp/content-generation";
import { assertRenderedAssetsPublishable } from "@ksp/asset-management";

/**
 * Pre-deployment QA. Every check runs; critical failures block deploy AND email.
 * Results are stored on the concept for the dashboard.
 */

export interface QaCheckResult {
  name: string;
  passed: boolean;
  critical: boolean;
  detail?: string;
}

export interface QaReport {
  passed: boolean;
  checks: QaCheckResult[];
  screenshotPaths: Record<string, string>;
}

const OFFENSIVE = /\b(damn|hell no|bloody awful|stupid|idiot|crap|terrible website|embarrassing)\b/i;
const SENSITIVE_PATTERNS: Array<[string, RegExp]> = [
  ["ni-number", /\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/],
  ["card-number", /\b(?:\d[ -]?){13,16}\b/],
  ["nhs-number", /\b\d{3}[ -]?\d{3}[ -]?\d{4}\b/],
];

export async function runQaPipeline(
  prisma: PrismaClient,
  logger: Logger,
  input: {
    businessId: string;
    files: Record<string, string | Buffer>;
    brief: ResearchBrief;
    agency: AgencyIdentity;
    screenshotDir: string;
    /** other businesses selected recently — leak check corpus */
    otherBusinessIds: string[];
  },
): Promise<QaReport> {
  const checks: QaCheckResult[] = [];
  const htmlRaw = input.files["index.html"] ?? "";
  const html = typeof htmlRaw === "string" ? htmlRaw : htmlRaw.toString("utf8");
  const add = (name: string, passed: boolean, critical: boolean, detail?: string) =>
    checks.push({ name, passed, critical, detail });

  // --- Structural ---
  add("build-output-present", html.length > 2000, true, `index.html ${html.length} bytes`);
  add("robots-txt-disallow", /User-agent: \*\s*\nDisallow: \/\s*/.test(String(input.files["robots.txt"] ?? "")), true);
  add("headers-noindex", String(input.files["_headers"] ?? "").includes("X-Robots-Tag: noindex"), true);
  add("meta-noindex", /<meta name="robots" content="noindex, nofollow/.test(html), true);
  add("html-lang", /<html lang="en-GB">/.test(html), false);
  add("viewport-meta", /<meta name="viewport"/.test(html), true);

  // --- Disclaimer ---
  const disclaimerOk =
    html.includes("Independent website concept prepared by") &&
    html.includes("This is not the official website of") &&
    html.includes(escapeForContains(input.brief.businessName)) &&
    html.includes(escapeForContains(input.agency.name));
  add("concept-disclaimer-visible", disclaimerOk, true);

  // --- Unresolved template variables ---
  const unresolved = /\{\{[^}]*\}\}|\[(?:BUSINESS|AGENCY|NAME|PHONE|TOWN|URL|ADDRESS)[ _A-Z]*\]|NOT CONFIGURED/.exec(html);
  add("no-unresolved-variables", !unresolved, true, unresolved?.[0]);

  // --- Claims firewall ---
  const violations = validateClaims(stripTags(html), input.brief);
  add(
    "no-invented-claims",
    violations.length === 0,
    true,
    violations.slice(0, 5).map((v) => `${v.rule}: "${v.match}"`).join("; ") || undefined,
  );

  // --- Asset rights ---
  try {
    await assertRenderedAssetsPublishable(prisma, input.businessId, html);
    add("assets-publishable", true, true);
  } catch (err) {
    add("assets-publishable", false, true, err instanceof Error ? err.message : "asset check failed");
  }

  // --- Contact details match source record ---
  const business = await prisma.business.findUniqueOrThrow({ where: { id: input.businessId } });
  if (business.phone) {
    const wanted = business.phone.replace(/\s+/g, "");
    const telLinks = [...html.matchAll(/href="tel:([^"]+)"/g)].map((m) => m[1]!.replace(/\s+/g, ""));
    add("phone-links-match-record", telLinks.length > 0 && telLinks.every((t) => t === wanted), true, telLinks.join(","));
  } else {
    add("phone-links-match-record", !/href="tel:/.test(html), true, "no phone on record");
  }
  if (business.primaryEmail) {
    const mailLinks = [...html.matchAll(/href="mailto:([^"]+)"/g)].map((m) => m[1]!.toLowerCase());
    add(
      "email-links-match-record",
      mailLinks.every((m) => m === business.primaryEmail!.toLowerCase()),
      true,
      mailLinks.join(","),
    );
  }

  // --- Forms must not submit to the prospect (or anywhere) ---
  const formActions = [...html.matchAll(/<form[^>]*action="([^"]*)"/g)].map((m) => m[1]);
  add("forms-do-not-submit", formActions.every((a) => !a || a === "#"), true, formActions.join(","));

  // --- Content safety ---
  const text = stripTags(html);
  add("no-offensive-content", !OFFENSIVE.test(text), true, OFFENSIVE.exec(text)?.[0]);
  for (const [name, re] of SENSITIVE_PATTERNS) {
    add(`no-sensitive-data-${name}`, !re.test(text), true);
  }

  // --- No analytics trackers without documented purpose ---
  const trackerSetting = await prisma.setting.findUnique({ where: { key: "openTrackingEnabled" } });
  const trackersFound = /gtag\(|googletagmanager|google-analytics|fbq\(|hotjar|clarity\.ms/i.test(html);
  add("no-undocumented-trackers", !trackersFound || trackerSetting?.value === true, true);

  // --- Cross-prospect leak check ---
  const others = await prisma.business.findMany({
    where: { id: { in: input.otherBusinessIds.filter((id) => id !== input.businessId) } },
    select: { name: true, phone: true, postcode: true, primaryEmail: true },
  });
  let leak: string | undefined;
  for (const other of others) {
    for (const value of [other.name, other.phone, other.primaryEmail].filter(Boolean) as string[]) {
      if (value.length > 4 && html.toLowerCase().includes(value.toLowerCase())) {
        leak = `${value}`;
        break;
      }
    }
    if (leak) break;
  }
  add("no-cross-prospect-leak", !leak, true, leak);

  // --- Relative (bundled) assets: must exist in the bundle AND be registered publishable ---
  const relativeRefs = [...html.matchAll(/src="((?!https?:|data:|#)[^"]+)"/g)].map((m) => m[1]!);
  const missingFromBundle = relativeRefs.filter((r) => !(r in input.files));
  add("bundled-assets-present", missingFromBundle.length === 0, true, missingFromBundle.join(","));
  if (relativeRefs.length > 0) {
    const registered = await prisma.asset.findMany({ where: { businessId: input.businessId } });
    const unregistered = relativeRefs.filter(
      (r) => !registered.some((a) => a.localPath === r &&
        ["BUSINESS_OWNED_AND_PERMISSION_CONFIRMED", "LICENSED_STOCK", "PROVIDED_BY_OPERATOR", "GENERATED", "PLACEHOLDER"].includes(a.rightsStatus)),
    );
    add("bundled-assets-registered", unregistered.length === 0, true, unregistered.join(","));
  }

  // --- Broken internal references ---
  const hrefs = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]!);
  const missingAnchors = hrefs.filter((h) => !html.includes(`id="${h}"`));
  add("no-broken-anchors", missingAnchors.length === 0, false, missingAnchors.join(","));

  // --- Accessibility basics + viewport rendering + screenshots ---
  const screenshotPaths: Record<string, string> = {};
  try {
    await mkdir(input.screenshotDir, { recursive: true });
    // Write the full bundle to a temp dir and load over file:// so relative assets resolve.
    const bundleDir = await mkdtemp(path.join(tmpdir(), "ksp-qa-"));
    for (const [name, content] of Object.entries(input.files)) {
      const target = path.join(bundleDir, name.replace(/^\/+/, ""));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    const browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(`file://${path.join(bundleDir, "index.html")}`, { waitUntil: "load" });
    await page.waitForTimeout(300);

    const a11y = await page.evaluate(() => {
      const issues: string[] = [];
      if (!document.querySelector("h1")) issues.push("missing h1");
      const imgs = Array.from(document.querySelectorAll("img"));
      if (imgs.some((i) => !i.getAttribute("alt"))) issues.push("image missing alt");
      const btns = Array.from(document.querySelectorAll("a.btn, button"));
      if (btns.some((b) => !(b.textContent ?? "").trim())) issues.push("empty interactive element");
      if (!document.querySelector("main")) issues.push("missing main landmark");
      return issues;
    });
    add("accessibility-basics", a11y.length === 0, true, a11y.join("; "));

    for (const vp of [
      { name: "mobile-390", width: 390, height: 844 },
      { name: "tablet-768", width: 768, height: 1024 },
      { name: "desktop-1440", width: 1440, height: 900 },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(250);
      if (vp.name === "mobile-390") {
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 5,
        );
        add("mobile-viewport-no-overflow", !overflow, true);
      }
      const file = path.join(input.screenshotDir, `${vp.name}.png`);
      await page.screenshot({ path: file, fullPage: vp.name === "desktop-1440" });
      screenshotPaths[vp.name] = file;
    }
    const brokenImages = await page.evaluate(() =>
      Array.from(document.querySelectorAll("img")).filter((i) => i.complete && i.naturalWidth === 0).length,
    );
    add("images-render", brokenImages === 0, true, brokenImages > 0 ? `${brokenImages} broken image(s)` : undefined);
    add("viewports-render", true, true);
    await browser.close();
    await rm(bundleDir, { recursive: true, force: true });
  } catch (err) {
    add("viewports-render", false, true, err instanceof Error ? err.message.slice(0, 200) : "render failed");
  }

  const passed = checks.every((c) => c.passed || !c.critical);
  logger.info("qa pipeline complete", {
    businessId: input.businessId,
    passed,
    failed: checks.filter((c) => !c.passed).map((c) => c.name),
  });
  return { passed, checks, screenshotPaths };
}

function stripTags(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

function escapeForContains(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
