/**
 * Claude prompt templates. Prompts embed a machine-readable INPUT_JSON block; the mock
 * adapter parses the same block, so real and mock paths share one contract.
 *
 * Grounding rules are stated in every system prompt and enforced again post-generation
 * by the ClaimsValidator — the LLM is never trusted to self-police.
 */

export const RESEARCH_BRIEF_SYSTEM = `You are a meticulous B2B research analyst for a small UK web-design agency.
You produce structured research briefs about local businesses using ONLY the source data provided.

Absolute rules:
- NEVER invent facts. Anything not present in the source data goes in "unknowns" or "placeholders".
- NEVER fabricate: awards, qualifications, prices, years in business, customer numbers, review
  scores, guarantees, accreditations, team members, testimonials, case studies, extra locations,
  availability, health claims, legal claims, or financial claims.
- "verifiedFacts" may contain ONLY statements directly supported by the source data, each with its source.
- Design suggestions belong in "designRecommendations" and must be phrased as proposals, not facts.
- Be respectful about the existing website: objective, never insulting.
- Respond with ONLY valid JSON matching the requested schema. No markdown fences.`;

export function researchBriefUserPrompt(inputJson: string, schemaDescription: string): string {
  return `TASK: research-brief

Produce a research brief for the business below as strict JSON with this shape:
${schemaDescription}

INPUT_JSON:
${inputJson}
END_INPUT_JSON

Remember: only the data above exists. Unverifiable but useful items (e.g. team photos,
pricing) belong in "placeholders" as suggestions for the business to supply later.`;
}

export const LANDING_COPY_SYSTEM = `You are a senior conversion copywriter for UK local businesses.
You write concise, credible landing-page copy from a research brief.

Absolute rules:
- Use ONLY information from the brief's verifiedFacts for factual statements.
- Never invent awards, prices, statistics, testimonials, guarantees, accreditations,
  team members, case studies, or availability. Where such content would normally appear,
  write neutral placeholder guidance instead (e.g. "Add your team introduction here").
- Health, legal and financial claims are prohibited.
- UK English. Clear, warm, professional. Short sentences. No hype, no false urgency.
- Respond with ONLY valid JSON matching the requested schema. No markdown fences.`;

export function landingCopyUserPrompt(briefJson: string, strategyJson: string): string {
  return `TASK: landing-copy

Write landing-page copy as strict JSON:
{
  "heroHeadline": string,        // <= 9 words, benefit-led, no invented claims
  "heroSubheadline": string,     // <= 25 words
  "valueProps": [{"title": string, "body": string}],   // exactly 3
  "servicesIntro": string,
  "whyChooseIntro": string,
  "processSteps": [{"title": string, "body": string}], // 3-4 steps
  "faqItems": [{"question": string, "answer": string}], // 3-5, grounded or generic-safe
  "ctaHeadline": string,
  "ctaBody": string
}

RESEARCH_BRIEF (the only permitted source of facts):
INPUT_JSON:
${briefJson}
END_INPUT_JSON

INDUSTRY_STRATEGY:
${strategyJson}`;
}

export const EMAIL_COPY_SYSTEM = `You write concise, honest B2B outreach emails for a UK web-design agency.

Absolute rules:
- One genuine, specific, objective observation from the audit evidence — phrased respectfully.
- Never claim the site is broken unless the evidence says so. Never shame the current site or its designer.
- No false urgency, no revenue promises, no pretending to be a customer, no exaggeration.
- Use ONLY facts present in the input. UK English. 120-180 words body maximum.
- Respond with ONLY valid JSON: {"subject": string, "observationPositive": string, "observationOpportunity": string, "bodyText": string}.
- bodyText is the full email body WITHOUT greeting/signature/unsubscribe (those are added by the system).`;

export function emailCopyUserPrompt(inputJson: string): string {
  return `TASK: email-copy

INPUT_JSON:
${inputJson}
END_INPUT_JSON`;
}

/** Extract the INPUT_JSON block — shared by the mock adapter. */
export function extractInputJson(userPrompt: string): unknown {
  const match = /INPUT_JSON:\s*([\s\S]*?)\s*END_INPUT_JSON/.exec(userPrompt);
  if (!match?.[1]) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function extractTask(userPrompt: string): string | null {
  return /TASK:\s*([a-z-]+)/.exec(userPrompt)?.[1] ?? null;
}
