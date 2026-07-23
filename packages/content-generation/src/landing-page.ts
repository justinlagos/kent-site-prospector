import { z } from "zod";
import { FatalError, LlmAdapter, type AgencyIdentity, type Logger } from "@ksp/shared";
import type { ResearchBrief } from "@ksp/research";
import { LANDING_COPY_SYSTEM, landingCopyUserPrompt } from "@ksp/research";
import { IndustryStrategy } from "./strategies.js";

export const landingCopySchema = z.object({
  heroHeadline: z.string().min(4).max(90),
  heroSubheadline: z.string().min(10).max(220),
  valueProps: z.array(z.object({ title: z.string(), body: z.string() })).length(3),
  servicesIntro: z.string(),
  whyChooseIntro: z.string(),
  processSteps: z.array(z.object({ title: z.string(), body: z.string() })).min(3).max(4),
  faqItems: z.array(z.object({ question: z.string(), answer: z.string() })).min(3).max(5),
  ctaHeadline: z.string(),
  ctaBody: z.string(),
});

export type LandingCopy = z.infer<typeof landingCopySchema>;

export async function generateLandingCopy(
  llm: LlmAdapter,
  logger: Logger,
  brief: ResearchBrief,
  strategy: IndustryStrategy,
): Promise<LandingCopy> {
  const raw = await llm.complete({
    system: LANDING_COPY_SYSTEM,
    user: landingCopyUserPrompt(JSON.stringify(brief, null, 2), JSON.stringify({
      key: strategy.key,
      primaryCta: strategy.primaryCta,
      secondaryCta: strategy.secondaryCta,
      emphasis: strategy.emphasis,
      cautions: strategy.cautions,
    })),
    jsonResponse: true,
    maxTokens: 3000,
    temperature: 0.5,
  });
  const parsed = landingCopySchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new FatalError("COPY_SCHEMA", `Landing copy failed validation: ${parsed.error.message.slice(0, 400)}`);
  }
  logger.debug("landing copy generated");
  return parsed.data;
}

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ---------------------------------------------------------------- colour utils
type Palette = { primary: string; accent: string; dark: string; light: string };

function clampHex(h: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(h.trim());
  return m ? `#${m[1]!.toLowerCase()}` : "#334155";
}
function hexToHsl(hex: string): [number, number, number] {
  const h = clampHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d !== 0) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, s, l];
}
function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let [r, g, b] = [0, 0, 0];
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
/** Rotate a whole palette's hue by `deg` — keeps a sector feel but makes each business distinct. */
function rotatePalette(p: Palette, deg: number): Palette {
  const rot = (hex: string) => {
    const [h, s, l] = hexToHsl(hex);
    return hslToHex(h + deg, s, l);
  };
  return { primary: rot(p.primary), accent: rot(p.accent), dark: rot(p.dark), light: rot(p.light) };
}

function hashInt(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

/** A tasteful diagonal-gradient placeholder (data URI) so no image area is ever empty. */
function gradientPlaceholder(a: string, b: string, label: string, w = 800, h = 600): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="#000" opacity="0.06"/><text x="50%" y="50%" font-family="system-ui,sans-serif" font-size="20" fill="#ffffff" opacity="0.85" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function faviconDataUri(letter: string, colour: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="${colour}"/><text x="50%" y="54%" font-family="system-ui,sans-serif" font-weight="700" font-size="34" fill="#fff" text-anchor="middle" dominant-baseline="middle">${letter}</text></svg>`,
  )}`;
}

// ---------------------------------------------------------------- design variants
type Variant = {
  key: string;
  headingFont: string;
  bodyFont: string;
  heroLayout: "split" | "centered";
  radius: string;
  headingWeight: number;
  uppercaseKicker: boolean;
};
const VARIANTS: Record<string, Variant> = {
  editorial: {
    key: "editorial",
    headingFont: `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, "Times New Roman", serif`,
    bodyFont: `system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
    heroLayout: "split",
    radius: "6px",
    headingWeight: 600,
    uppercaseKicker: true,
  },
  impact: {
    key: "impact",
    headingFont: `"Helvetica Neue", Helvetica, Arial, system-ui, sans-serif`,
    bodyFont: `system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
    heroLayout: "split",
    radius: "18px",
    headingWeight: 800,
    uppercaseKicker: true,
  },
  clean: {
    key: "clean",
    headingFont: `system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
    bodyFont: `system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`,
    heroLayout: "centered",
    radius: "14px",
    headingWeight: 700,
    uppercaseKicker: false,
  },
};
const EDITORIAL = new Set(["restaurant", "cafe", "catering", "beauty", "weddings-events", "creative-services"]);
const IMPACT = new Set(["trades", "automotive", "removals", "cleaning", "landscaping", "fitness"]);
function pickVariant(strategyKey: string): Variant {
  if (EDITORIAL.has(strategyKey)) return VARIANTS.editorial!;
  if (IMPACT.has(strategyKey)) return VARIANTS.impact!;
  return VARIANTS.clean!;
}

export interface RenderInput {
  brief: ResearchBrief;
  copy: LandingCopy;
  strategy: IndustryStrategy;
  agency: AgencyIdentity;
  slug: string;
  /** Generated/real images: keys "hero", "gallery-0".."gallery-3", "service-0"..N ->
   * bundle-relative paths (e.g. "assets/hero.jpg"). Absent keys fall back to gradient art. */
  images?: Record<string, string>;
  /** Optional extracted brand signals from the business's own site (see auditor). When
   * colours are present they override the sector palette so the concept is truly on-brand. */
  brand?: { colours?: Partial<Palette>; headingFont?: string; bodyFont?: string; logoUrl?: string };
}

/**
 * Render the complete preview bundle. Original, per-business design: the palette is the
 * business's real brand colours when available (else a per-business hue-shifted sector
 * scheme so no two concepts match), the layout is chosen by sector, and imagery fills every
 * slot. Non-negotiable: noindex/nofollow meta, robots.txt disallow-all, X-Robots-Tag headers,
 * and a permanently visible independent-concept disclaimer.
 */
export function renderLandingPage(input: RenderInput): Record<string, string> {
  const { brief, copy, strategy, agency } = input;
  const images = input.images ?? {};
  const name = esc(brief.businessName);
  const phone = brief.contact.phone ? esc(brief.contact.phone) : null;
  const email = brief.contact.email ? esc(brief.contact.email) : null;
  const disclaimerText = `Independent website concept prepared by ${esc(agency.name)}. This is not the official website of ${name}.`;

  const has = (s: string) => strategy.sections.includes(s as never);
  const reviewFact = brief.verifiedFacts.find((f) => /reviews averaging/.test(f.fact));

  // Palette: real brand colours win; otherwise hue-shift the sector palette per business.
  const seed = hashInt(input.slug || brief.businessName);
  const rotated = rotatePalette(strategy.palette, ((seed % 11) - 5) * 5);
  const bc = input.brand?.colours ?? {};
  const p: Palette = {
    primary: bc.primary ? clampHex(bc.primary) : rotated.primary,
    accent: bc.accent ? clampHex(bc.accent) : rotated.accent,
    dark: bc.dark ? clampHex(bc.dark) : rotated.dark,
    light: bc.light ? clampHex(bc.light) : rotated.light,
  };
  const variant = pickVariant(strategy.key);
  const headingFont = input.brand?.headingFont ?? variant.headingFont;
  const bodyFont = input.brand?.bodyFont ?? variant.bodyFont;

  // image resolver: real/generated bundle image if present, else a branded gradient.
  const img = (key: string, label: string, w = 800, h = 600): string => {
    const src = images[key];
    if (src) return esc(src);
    const [h1, s1, l1] = hexToHsl(p.primary);
    return gradientPlaceholder(p.primary, hslToHex(h1 + 24, Math.min(1, s1 + 0.05), Math.min(0.6, l1 + 0.12)), label, w, h);
  };
  const isGenerated = (key: string) => Boolean(images[key]);
  const imgAlt = (key: string, subject: string) =>
    isGenerated(key)
      ? `Illustrative image for ${esc(subject)} — a design concept, not a photo of the business`
      : `Design placeholder for ${esc(subject)} — replaced with owned or licensed photography in a full build`;

  const kicker = brief.locationServed ? esc(brief.locationServed) : esc(brief.contact.town);

  // --------------------------------------------------------------- sections
  const sections: string[] = [];

  const heroImg = `<img class="hero-img" src="${img("hero", `${brief.businessName} concept hero`, 1200, 760)}" alt="${imgAlt("hero", brief.businessName + " concept")}" loading="eager"/>`;
  const heroText = `
      <p class="kicker">${kicker}</p>
      <h1>${esc(copy.heroHeadline)}</h1>
      <p class="sub">${esc(copy.heroSubheadline)}</p>
      <div class="hero-actions">
        <a class="btn primary" href="#contact">${esc(strategy.primaryCta)}</a>
        ${phone ? `<a class="btn ghost" href="tel:${phone.replace(/\s+/g, "")}">${esc(strategy.secondaryCta)}</a>` : ""}
      </div>
      ${reviewFact ? `<p class="hero-proof">★ ${esc(reviewFact.fact)}</p>` : ""}`;

  sections.push(`
  <header class="hero variant-${variant.key} hero-${variant.heroLayout}">
    <nav class="nav" aria-label="Main navigation">
      <span class="brand">${
        input.brand?.logoUrl
          ? `<img class="brand-logo" src="${esc(input.brand.logoUrl)}" alt="${name} logo" onerror="this.remove()"/>`
          : `<span class="brand-mark" aria-hidden="true">${esc(brief.businessName.charAt(0).toUpperCase())}</span>`
      }${name}</span>
      <a class="nav-cta" href="#contact">${esc(strategy.primaryCta)}</a>
    </nav>
    <div class="hero-inner">
      <div class="hero-copy">${heroText}
      </div>
      <div class="hero-media">${heroImg}</div>
    </div>
  </header>`);

  if (has("value-proposition")) {
    sections.push(`
  <section class="props" aria-label="Why this matters">
    <div class="grid3">
      ${copy.valueProps.map((v) => `<article class="card"><h3>${esc(v.title)}</h3><p>${esc(v.body)}</p></article>`).join("\n      ")}
    </div>
  </section>`);
  }

  if (has("services")) {
    const services = brief.primaryServices.length > 0 ? brief.primaryServices : ["Our offering"];
    sections.push(`
  <section class="services" id="services">
    <p class="eyebrow">What we offer</p>
    <h2>${esc(strategy.label ?? "Our services")}</h2>
    <p class="intro">${esc(copy.servicesIntro)}</p>
    <div class="grid3">
      ${services.slice(0, 6).map((s, i) => `<article class="card service"><div class="ph"><img src="${img(`service-${i}`, s, 640, 460)}" alt="${imgAlt(`service-${i}`, s)}" loading="lazy"/></div><div class="card-b"><h3>${esc(s)}</h3></div></article>`).join("\n      ")}
    </div>
  </section>`);
  }

  // gallery — always present, fills every tile (real/generated or branded gradient)
  sections.push(`
  <section class="gallery-wrap" aria-label="Gallery">
    <p class="eyebrow">A little atmosphere</p>
    <h2>The look &amp; feel</h2>
    <div class="gallery">
      ${[0, 1, 2, 3].map((i) => `<img src="${img(`gallery-${i}`, `${brief.businessName} ${i + 1}`, 600, 600)}" alt="${imgAlt(`gallery-${i}`, brief.businessName + " atmosphere")}" loading="lazy"/>`).join("\n      ")}
    </div>
    <p class="asset-note">Imagery is illustrative — swapped for your own approved photography in a full build.</p>
  </section>`);

  if (has("why-choose")) {
    sections.push(`
  <section class="why">
    <div class="why-inner">
      <p class="eyebrow">Why choose ${name}</p>
      <p class="why-lead">${esc(copy.whyChooseIntro)}</p>
    </div>
  </section>`);
  }

  if (has("reviews") && reviewFact) {
    const scoreMatch = /([0-5](?:\.\d)?)\s*\/\s*5/.exec(reviewFact.fact);
    sections.push(`
  <section class="reviews" aria-label="Reputation">
    ${scoreMatch ? `<div class="bigscore">${esc(scoreMatch[1]!)}</div><div class="stars" aria-hidden="true">★★★★★</div>` : ""}
    <p class="review-stat">${esc(reviewFact.fact)}</p>
    <p class="asset-note">Individual review quotes appear here once you choose and sign them off.</p>
  </section>`);
  }

  if (has("process")) {
    sections.push(`
  <section class="process">
    <p class="eyebrow">How it works</p>
    <h2>Simple from first contact</h2>
    <ol class="steps">
      ${copy.processSteps.map((s, i) => `<li><span class="step-n">${i + 1}</span><div><h3>${esc(s.title)}</h3><p>${esc(s.body)}</p></div></li>`).join("\n      ")}
    </ol>
  </section>`);
  }

  if (has("coverage")) {
    sections.push(`
  <section class="coverage">
    <h2>Areas we cover</h2>
    <p>${esc(brief.locationServed)}</p>
  </section>`);
  }

  if (has("faq")) {
    sections.push(`
  <section class="faq">
    <p class="eyebrow">Good to know</p>
    <h2>Frequently asked questions</h2>
    ${copy.faqItems.map((f) => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join("\n    ")}
  </section>`);
  }

  if (has("cta")) {
    sections.push(`
  <section class="cta-band">
    <h2>${esc(copy.ctaHeadline)}</h2>
    <p>${esc(copy.ctaBody)}</p>
    <a class="btn light" href="#contact">${esc(strategy.primaryCta)}</a>
  </section>`);
  }

  const hoursRows = brief.openingHours
    ? Object.entries(brief.openingHours).map(([d, h]) => `<tr><th scope="row">${esc(d)}</th><td>${esc(h)}</td></tr>`).join("\n        ")
    : null;

  sections.push(`
  <section class="contact" id="contact">
    <h2>Contact ${name}</h2>
    <div class="contact-grid">
      <div>
        <address>
          ${esc(brief.contact.address)}, ${esc(brief.contact.town)}<br/>
          ${phone ? `Phone: <a href="tel:${phone.replace(/\s+/g, "")}">${phone}</a><br/>` : ""}
          ${email ? `Email: <a href="mailto:${email}">${email}</a>` : ""}
        </address>
        ${has("hours") && hoursRows ? `<h3>Opening hours</h3><table class="hours"><tbody>${hoursRows}</tbody></table>` : ""}
      </div>
      <form class="enquiry" aria-label="Enquiry form (demonstration only)" onsubmit="event.preventDefault(); this.querySelector('.form-note').hidden = false;">
        <label>Your name <input type="text" name="name" autocomplete="name" required/></label>
        <label>Phone or email <input type="text" name="contact" required/></label>
        <label>How can we help? <textarea name="message" rows="4"></textarea></label>
        <button class="btn primary" type="submit">${esc(strategy.primaryCta)}</button>
        <p class="form-note" hidden>This is a design demonstration — the form does not send anywhere.</p>
      </form>
    </div>
  </section>`);

  sections.push(`
  <footer class="footer">
    <p class="footer-name">${name}</p>
    <p>${esc(brief.locationServed)}</p>
    <p class="concept-note">${disclaimerText}</p>
    <p class="concept-note">Concept preview by <a href="${esc(agency.website)}" rel="nofollow">${esc(agency.name)}</a> · ${esc(agency.phone)}</p>
  </footer>`);

  const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow, noarchive"/>
<title>Website concept for ${name} — independent design proposal</title>
<meta name="description" content="Private website design concept prepared by ${esc(agency.name)}. Not the official website of ${name}."/>
<meta property="og:title" content="Website concept for ${name}"/>
<meta property="og:description" content="Independent design proposal by ${esc(agency.name)} — not the official website."/>
<meta property="og:type" content="website"/>
<link rel="icon" href="${faviconDataUri(brief.businessName.charAt(0).toUpperCase(), p.primary)}"/>
<style>
:root{--primary:${p.primary};--accent:${p.accent};--dark:${p.dark};--light:${p.light};--radius:${variant.radius};--hfont:${headingFont};--bfont:${bodyFont};--hweight:${variant.headingWeight}}
*{box-sizing:border-box;margin:0}
html{scroll-behavior:smooth}
body{font-family:var(--bfont);color:#20242c;line-height:1.62;background:#fff;-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto;display:block}
h1,h2,h3{font-family:var(--hfont);color:var(--dark);line-height:1.12;font-weight:var(--hweight)}
h1{font-size:clamp(2.1rem,5.4vw,3.5rem);letter-spacing:-.01em}
h2{font-size:clamp(1.5rem,3.6vw,2.3rem);margin-bottom:.5rem}
h3{font-size:1.08rem;margin-bottom:.3rem}
section{max-width:1120px;margin:0 auto;padding:4.5rem 1.4rem}
.eyebrow{text-transform:uppercase;letter-spacing:.18em;font-size:.72rem;font-weight:700;color:var(--primary);margin-bottom:.5rem}
.disclaimer-banner{position:sticky;top:0;z-index:1000;background:var(--dark);color:#fff;text-align:center;padding:.55rem .9rem;font-size:.82rem;line-height:1.4}
.btn{display:inline-block;padding:.85rem 1.7rem;border-radius:calc(var(--radius) - 2px);font-weight:600;text-decoration:none;border:2px solid transparent;font-size:1rem;cursor:pointer;transition:transform .12s ease,background .18s ease}
.btn.primary{background:var(--primary);color:#fff}
.btn.primary:hover{background:var(--dark);transform:translateY(-1px)}
.btn.ghost{border-color:var(--primary);color:var(--primary);background:transparent}
.btn.ghost:hover{background:var(--primary);color:#fff}
.btn.light{background:#fff;color:var(--primary)}
.btn:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
/* NAV + HERO */
.nav{display:flex;justify-content:space-between;align-items:center;max-width:1120px;margin:0 auto;padding:1.1rem 1.4rem}
.brand{font-family:var(--hfont);font-weight:var(--hweight);font-size:1.2rem;color:var(--dark);display:flex;align-items:center;gap:.55rem}
.brand-mark{width:2rem;height:2rem;border-radius:8px;background:var(--primary);color:#fff;display:grid;place-items:center;font-size:1rem}
.brand-logo{height:2.1rem;width:auto;max-width:180px;object-fit:contain;border-radius:4px}
.nav-cta{color:var(--primary);font-weight:600;text-decoration:none}
.hero{background:linear-gradient(165deg,var(--light),#fff 72%);border-bottom:1px solid #eef1f5}
.hero-inner{max-width:1120px;margin:0 auto;padding:2.6rem 1.4rem 4.2rem;display:grid;gap:2.6rem;align-items:center}
.hero-split .hero-inner{grid-template-columns:1.05fr .95fr}
.hero-centered .hero-inner{grid-template-columns:1fr;text-align:center;justify-items:center}
.hero-centered .hero-actions{justify-content:center}
.hero-centered .hero-media{width:100%;max-width:900px}
.kicker{text-transform:${variant.uppercaseKicker ? "uppercase" : "none"};letter-spacing:.16em;font-size:.75rem;font-weight:700;color:var(--primary);margin-bottom:.9rem}
.sub{font-size:1.18rem;color:#4a5160;max-width:34rem;margin:1rem 0 1.7rem}
.hero-centered .sub{margin-left:auto;margin-right:auto}
.hero-actions{display:flex;gap:.8rem;flex-wrap:wrap}
.hero-proof{margin-top:1.3rem;font-weight:600;color:var(--primary)}
.hero-media{position:relative}
.hero-img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius);box-shadow:0 24px 60px rgba(20,24,34,.20)}
.hero-centered .hero-img{aspect-ratio:16/8}
/* CARDS / GRID */
.grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1.3rem;margin-top:1.4rem}
.card{background:#fff;border:1px solid #e8ecf1;border-radius:var(--radius);padding:1.5rem;box-shadow:0 1px 3px rgba(0,0,0,.04);transition:transform .16s ease,box-shadow .16s ease}
.card:hover{transform:translateY(-4px);box-shadow:0 16px 40px rgba(20,24,34,.10)}
.card.service{padding:0;overflow:hidden}
.card.service .ph{aspect-ratio:8/5;overflow:hidden}
.card.service .ph img{width:100%;height:100%;object-fit:cover;transition:transform .4s ease}
.card.service:hover .ph img{transform:scale(1.05)}
.card.service .card-b{padding:1.1rem 1.3rem}
.intro{color:#4a5160;max-width:44rem;margin-top:.3rem}
.asset-note{margin-top:1.1rem;font-size:.78rem;color:#8a93a1;font-style:italic}
/* GALLERY */
.gallery-wrap{padding-top:1rem}
.gallery{display:grid;grid-template-columns:repeat(4,1fr);gap:.9rem;margin-top:1.3rem}
.gallery img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:calc(var(--radius) - 2px)}
@media(max-width:640px){.gallery{grid-template-columns:repeat(2,1fr)}}
/* WHY */
.why{background:var(--dark);color:#fff}
.why-inner{max-width:820px}
.why .eyebrow{color:var(--accent)}
.why-lead{font-family:var(--hfont);font-size:clamp(1.35rem,3vw,2rem);line-height:1.35;font-weight:var(--hweight)}
/* REVIEWS */
.reviews{text-align:center;background:var(--light)}
.bigscore{font-family:var(--hfont);font-size:4.4rem;color:var(--primary);line-height:1}
.stars{color:var(--accent);font-size:1.5rem;letter-spacing:.2rem}
.review-stat{font-size:1.15rem;font-weight:600;color:var(--dark);margin-top:.4rem}
/* PROCESS */
.steps{list-style:none;display:grid;gap:1.1rem;margin-top:1.3rem;max-width:44rem}
.steps li{display:flex;gap:1rem;align-items:flex-start}
.step-n{flex:0 0 2.4rem;height:2.4rem;border-radius:50%;background:var(--primary);color:#fff;display:grid;place-items:center;font-weight:700;font-family:var(--hfont)}
/* FAQ */
.faq details{border:1px solid #e8ecf1;border-radius:calc(var(--radius) - 2px);padding:1rem 1.2rem;margin-top:.7rem;background:#fff}
.faq summary{font-weight:600;cursor:pointer;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:'+';float:right;color:var(--primary);font-weight:700}
.faq details[open] summary::after{content:'\\2013'}
.faq details p{margin-top:.6rem;color:#4a5160}
/* CTA */
.cta-band{background:var(--primary);color:#fff;border-radius:calc(var(--radius) + 6px);text-align:center;padding:3.4rem 1.6rem;margin:2rem auto;max-width:1120px}
.cta-band h2{color:#fff}
.cta-band p{margin:.7rem auto 1.5rem;max-width:34rem;color:rgba(255,255,255,.92)}
/* CONTACT */
.contact-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:2.2rem;margin-top:1.2rem}
address{font-style:normal;color:#4a5160;line-height:2}
address a{color:var(--primary)}
.hours{margin-top:.7rem;border-collapse:collapse;font-size:.95rem;width:100%;max-width:22rem}
.hours th{text-align:left;padding:.35rem 1rem .35rem 0;color:var(--dark)}
.hours td{padding:.35rem 0;color:#4a5160;text-align:right}
.enquiry{display:grid;gap:.9rem;background:var(--light);padding:1.6rem;border-radius:var(--radius)}
.enquiry label{display:grid;gap:.3rem;font-weight:600;font-size:.9rem;color:var(--dark)}
.enquiry input,.enquiry textarea{padding:.7rem .85rem;border:1px solid #cbd2dc;border-radius:8px;font:inherit;background:#fff}
.enquiry input:focus,.enquiry textarea:focus{outline:2px solid var(--primary);outline-offset:1px}
.form-note{font-size:.85rem;color:var(--dark);font-weight:600}
/* FOOTER */
.footer{background:#f6f8fa;border-top:1px solid #e8ecf1;text-align:center;padding:2.4rem 1.4rem;color:#4a5160;font-size:.92rem}
.footer-name{font-family:var(--hfont);font-weight:var(--hweight);font-size:1.2rem;color:var(--dark)}
.concept-note{margin-top:.5rem;font-size:.8rem;color:#8a93a1}
.concept-note a{color:var(--primary)}
@media(max-width:760px){.hero-split .hero-inner{grid-template-columns:1fr}section{padding:3.2rem 1.1rem}.hero-inner{padding:2rem 1.1rem 3rem}}
</style>
</head>
<body class="variant-${variant.key}">
<div class="disclaimer-banner" role="note">${disclaimerText}</div>
<main>
${sections.join("\n")}
</main>
</body>
</html>
`;

  const robots = "User-agent: *\nDisallow: /\n";
  const headers = `/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`;

  return { "index.html": html, "robots.txt": robots, _headers: headers };
}
