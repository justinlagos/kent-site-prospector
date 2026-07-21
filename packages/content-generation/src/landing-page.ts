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

function placeholderSvg(label: string, colour: string, w = 640, h = 400): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${colour}" opacity="0.12"/><rect x="8" y="8" width="${w - 16}" height="${h - 16}" fill="none" stroke="${colour}" stroke-width="2" stroke-dasharray="8 6" opacity="0.5"/><text x="50%" y="50%" font-family="system-ui,sans-serif" font-size="17" fill="${colour}" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`,
  )}`;
}

function faviconDataUri(letter: string, colour: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="14" fill="${colour}"/><text x="50%" y="54%" font-family="system-ui,sans-serif" font-weight="700" font-size="34" fill="#fff" text-anchor="middle" dominant-baseline="middle">${letter}</text></svg>`,
  )}`;
}

export interface RenderInput {
  brief: ResearchBrief;
  copy: LandingCopy;
  strategy: IndustryStrategy;
  agency: AgencyIdentity;
  slug: string;
}

/**
 * Render the complete preview bundle. Original design per strategy palette/sections —
 * never a clone of the business's current site. Includes, non-negotiably:
 * noindex/nofollow meta, robots.txt disallow-all, X-Robots-Tag headers, and a permanently
 * visible independent-concept disclaimer.
 */
export function renderLandingPage(input: RenderInput): Record<string, string> {
  const { brief, copy, strategy, agency } = input;
  const p = strategy.palette;
  const name = esc(brief.businessName);
  const phone = brief.contact.phone ? esc(brief.contact.phone) : null;
  const email = brief.contact.email ? esc(brief.contact.email) : null;
  const disclaimerText = `Independent website concept prepared by ${esc(agency.name)}. This is not the official website of ${name}.`;

  const has = (s: string) => strategy.sections.includes(s as never);

  const reviewFact = brief.verifiedFacts.find((f) => /reviews averaging/.test(f.fact));

  const sections: string[] = [];

  sections.push(`
  <header class="hero">
    <nav class="nav" aria-label="Main navigation">
      <span class="brand">${name}</span>
      <a class="nav-cta" href="#contact">${esc(strategy.primaryCta)}</a>
    </nav>
    <div class="hero-inner">
      <h1>${esc(copy.heroHeadline)}</h1>
      <p class="sub">${esc(copy.heroSubheadline)}</p>
      <div class="hero-actions">
        <a class="btn primary" href="#contact">${esc(strategy.primaryCta)}</a>
        ${phone ? `<a class="btn ghost" href="tel:${phone.replace(/\s+/g, "")}">${esc(strategy.secondaryCta)}</a>` : ""}
      </div>
      ${reviewFact ? `<p class="hero-proof">${esc(reviewFact.fact)}</p>` : ""}
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
    const services = brief.primaryServices.length > 0 ? brief.primaryServices : ["Our services"];
    sections.push(`
  <section class="services" id="services">
    <h2>What we offer</h2>
    <p class="intro">${esc(copy.servicesIntro)}</p>
    <div class="grid3">
      ${services
        .slice(0, 6)
        .map(
          (s) =>
            `<article class="card service"><img src="${placeholderSvg(`Licensed image placeholder — ${esc(s)}`, p.primary)}" alt="Placeholder illustration for ${esc(s)} — to be replaced with owned or licensed photography" loading="lazy"/><h3>${esc(s)}</h3></article>`,
        )
        .join("\n      ")}
    </div>
    <p class="asset-note">Photography shown as placeholders — replaced with your own approved images in a full build.</p>
  </section>`);
  }

  if (has("why-choose")) {
    sections.push(`
  <section class="why">
    <h2>Why choose ${name}</h2>
    <p class="intro">${esc(copy.whyChooseIntro)}</p>
  </section>`);
  }

  if (has("reviews") && reviewFact) {
    sections.push(`
  <section class="reviews" aria-label="Reputation">
    <h2>What customers say</h2>
    <p class="review-stat">${esc(reviewFact.fact)}</p>
    <p class="asset-note">Individual review quotes appear here once you choose and sign them off.</p>
  </section>`);
  }

  if (has("process")) {
    sections.push(`
  <section class="process">
    <h2>How it works</h2>
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
    <h2>Frequently asked questions</h2>
    ${copy.faqItems.map((f) => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join("\n    ")}
  </section>`);
  }

  if (has("cta")) {
    sections.push(`
  <section class="cta-band">
    <h2>${esc(copy.ctaHeadline)}</h2>
    <p>${esc(copy.ctaBody)}</p>
    <a class="btn primary" href="#contact">${esc(strategy.primaryCta)}</a>
  </section>`);
  }

  const hoursRows = brief.openingHours
    ? Object.entries(brief.openingHours)
        .map(([d, h]) => `<tr><th scope="row">${esc(d)}</th><td>${esc(h)}</td></tr>`)
        .join("\n        ")
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
    <p>${name} — ${esc(brief.locationServed)}</p>
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
:root{--primary:${p.primary};--accent:${p.accent};--dark:${p.dark};--light:${p.light}}
*{box-sizing:border-box;margin:0}
html{scroll-behavior:smooth}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1a202c;line-height:1.6;background:#fff}
img{max-width:100%;height:auto;display:block;border-radius:10px}
h1{font-size:clamp(1.8rem,5vw,3rem);line-height:1.15}
h2{font-size:clamp(1.4rem,3.5vw,2rem);color:var(--dark);margin-bottom:.6rem}
h3{font-size:1.05rem;margin-bottom:.35rem}
section{max-width:1080px;margin:0 auto;padding:3rem 1.25rem}
.disclaimer-banner{position:sticky;top:0;z-index:1000;background:var(--dark);color:#fff;text-align:center;padding:.55rem .9rem;font-size:.85rem;line-height:1.4}
.hero{background:linear-gradient(160deg,var(--light),#fff 70%);border-bottom:1px solid #edf2f7}
.nav{display:flex;justify-content:space-between;align-items:center;max-width:1080px;margin:0 auto;padding:1rem 1.25rem}
.brand{font-weight:700;font-size:1.15rem;color:var(--dark)}
.nav-cta{color:var(--primary);font-weight:600;text-decoration:none}
.hero-inner{max-width:1080px;margin:0 auto;padding:3.5rem 1.25rem 4rem}
.sub{font-size:1.15rem;color:#4a5568;max-width:34rem;margin:.9rem 0 1.6rem}
.hero-actions{display:flex;gap:.8rem;flex-wrap:wrap}
.hero-proof{margin-top:1.2rem;font-weight:600;color:var(--primary)}
.btn{display:inline-block;padding:.8rem 1.5rem;border-radius:9px;font-weight:600;text-decoration:none;border:2px solid transparent;font-size:1rem;cursor:pointer}
.btn.primary{background:var(--primary);color:#fff}
.btn.primary:hover{background:var(--dark)}
.btn.ghost{border-color:var(--primary);color:var(--primary);background:transparent}
.btn:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.grid3{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.1rem;margin-top:1.2rem}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:1.3rem;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.card.service img{margin-bottom:.8rem;aspect-ratio:8/5;object-fit:cover}
.intro{color:#4a5568;max-width:44rem}
.asset-note{margin-top:1rem;font-size:.8rem;color:#718096;font-style:italic}
.review-stat{font-size:1.3rem;font-weight:700;color:var(--primary)}
.steps{list-style:none;counter-reset:step;display:grid;gap:1rem;margin-top:1rem}
.steps li{display:flex;gap:1rem;align-items:flex-start}
.step-n{flex:0 0 2.2rem;height:2.2rem;border-radius:50%;background:var(--primary);color:#fff;display:grid;place-items:center;font-weight:700}
.faq details{border:1px solid #e2e8f0;border-radius:10px;padding:.9rem 1.1rem;margin-top:.6rem;background:#fff}
.faq summary{font-weight:600;cursor:pointer}
.faq details p{margin-top:.5rem;color:#4a5568}
.cta-band{background:var(--dark);color:#fff;border-radius:16px;text-align:center;padding:3rem 1.5rem;margin:2rem auto}
.cta-band h2{color:#fff}
.cta-band p{margin:.6rem auto 1.4rem;max-width:32rem;color:#e2e8f0}
.contact-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:2rem;margin-top:1rem}
address{font-style:normal;color:#4a5568}
address a{color:var(--primary)}
.hours{margin-top:.6rem;border-collapse:collapse;font-size:.95rem}
.hours th{text-align:left;padding:.25rem 1rem .25rem 0;color:var(--dark)}
.hours td{padding:.25rem 0;color:#4a5568}
.enquiry{display:grid;gap:.9rem;background:var(--light);padding:1.4rem;border-radius:12px}
.enquiry label{display:grid;gap:.3rem;font-weight:600;font-size:.92rem;color:var(--dark)}
.enquiry input,.enquiry textarea{padding:.65rem .8rem;border:1px solid #cbd5e0;border-radius:8px;font:inherit;background:#fff}
.enquiry input:focus,.enquiry textarea:focus{outline:2px solid var(--primary);outline-offset:1px}
.form-note{font-size:.85rem;color:var(--dark);font-weight:600}
.footer{background:#f7fafc;border-top:1px solid #e2e8f0;text-align:center;padding:2rem 1.25rem;color:#4a5568;font-size:.92rem}
.concept-note{margin-top:.5rem;font-size:.82rem;color:#718096}
.concept-note a{color:var(--primary)}
@media (max-width:480px){section{padding:2.2rem 1rem}.hero-inner{padding:2.4rem 1rem 3rem}}
</style>
</head>
<body>
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
