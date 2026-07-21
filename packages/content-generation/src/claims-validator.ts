import type { ResearchBrief } from "@ksp/research";

/**
 * The claims firewall. Scans generated copy (page or email) for claim patterns that must
 * not appear unless explicitly present in the brief's verified facts. A violation is a
 * hard QA failure: no deploy, no email.
 */

export interface ClaimViolation {
  rule: string;
  match: string;
  context: string;
}

interface Rule {
  name: string;
  pattern: RegExp;
  /** if true, the match is allowed when the surrounding text appears in a verified fact */
  allowIfVerified: boolean;
}

const RULES: Rule[] = [
  { name: "award-claim", pattern: /\b(award[- ]?winning|winner of|awarded)\b/gi, allowIfVerified: true },
  { name: "years-in-business", pattern: /\b(?:over\s+)?\d{1,3}\+?\s+years(?:'|s)?\s+(?:of\s+)?(experience|trading|in business|serving)\b/gi, allowIfVerified: true },
  { name: "established-year", pattern: /\b(established|est\.?|founded|since)\s+(in\s+)?(19|20)\d{2}\b/gi, allowIfVerified: true },
  { name: "price-claim", pattern: /£\s?\d/g, allowIfVerified: true },
  { name: "percentage-claim", pattern: /\b\d{1,3}(\.\d+)?\s?%/g, allowIfVerified: true },
  { name: "customer-count", pattern: /\b\d[\d,]*\+?\s+(happy\s+)?(customers|clients|patients|projects|installations|moves)\b/gi, allowIfVerified: true },
  { name: "guarantee", pattern: /\b(guarantee[ds]?|money[- ]back|no win no fee)\b/gi, allowIfVerified: true },
  { name: "accreditation", pattern: /\b(accredited|certified|approved by|registered with|gas safe|niceic|checkatrade|trustpilot|cqc|ofsted|sra|fca)\b/gi, allowIfVerified: true },
  { name: "review-score", pattern: /\b[0-5](\.\d)?\s?(\/\s?5|stars?|out of (?:5|five))\b/gi, allowIfVerified: true },
  { name: "superlative-rank", pattern: /\b(the\s+)?(best|number one|no\.?\s?1|top[- ]rated|leading)\b/gi, allowIfVerified: false },
  { name: "health-outcome", pattern: /\b(cure[sd]?|heal[sed]*|pain[- ]free|clinically proven|guaranteed results)\b/gi, allowIfVerified: false },
  { name: "urgency-pressure", pattern: /\b(limited time|act now|don't miss out|only \d+ (left|remaining)|offer ends)\b/gi, allowIfVerified: false },
  { name: "testimonial-fabrication", pattern: /["“][^"”]{20,}["”]\s*[-–—]\s*[A-Z][a-z]+/g, allowIfVerified: true },
  { name: "unresolved-template-var", pattern: /\{\{[^}]*\}\}|\[(?:BUSINESS|AGENCY|NAME|PHONE|TOWN|URL)[ _A-Z]*\]/g, allowIfVerified: false },
];

export function validateClaims(text: string, brief: ResearchBrief): ClaimViolation[] {
  const verifiedBlob = brief.verifiedFacts.map((f) => f.fact.toLowerCase()).join("\n");
  const violations: ClaimViolation[] = [];

  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text)) !== null) {
      const match = m[0];
      if (rule.allowIfVerified) {
        const needle = match.toLowerCase().trim();
        if (verifiedBlob.includes(needle)) continue;
        // review-score special case: "N reviews averaging X/5" fact covers "X/5" style mentions
        if (rule.name === "review-score" && /averaging/.test(verifiedBlob) && verifiedBlob.includes(needle.replace(/\s/g, " "))) continue;
      }
      violations.push({
        rule: rule.name,
        match,
        context: text.slice(Math.max(0, m.index - 60), m.index + match.length + 60).replace(/\s+/g, " "),
      });
    }
  }
  return violations;
}
