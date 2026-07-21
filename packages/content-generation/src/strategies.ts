/**
 * Industry conversion-strategy modules. Each strategy defines the section plan, the
 * primary conversion action and sector-specific rules the generator must follow.
 * 23 sectors — every seeded category maps to one via Category.strategyKey.
 */

export type SectionKey =
  | "hero"
  | "value-proposition"
  | "services"
  | "why-choose"
  | "reviews"
  | "process"
  | "coverage"
  | "faq"
  | "cta"
  | "contact"
  | "hours"
  | "footer";

export interface IndustryStrategy {
  key: string;
  label: string;
  primaryCta: string;
  secondaryCta: string;
  sections: SectionKey[];
  emphasis: string[]; // conversion levers to stress in copy
  cautions: string[]; // sector-specific claim restrictions layered on the global rules
  palette: { primary: string; accent: string; dark: string; light: string };
}

const base = (s: Partial<IndustryStrategy> & Pick<IndustryStrategy, "key" | "label" | "primaryCta" | "palette">): IndustryStrategy => ({
  secondaryCta: "Call us",
  sections: ["hero", "value-proposition", "services", "why-choose", "reviews", "process", "faq", "cta", "contact", "hours", "footer"],
  emphasis: [],
  cautions: [],
  ...s,
});

export const INDUSTRY_STRATEGIES: Record<string, IndustryStrategy> = {
  "dental-clinic": base({
    key: "dental-clinic",
    label: "Dental practices",
    primaryCta: "Request an appointment",
    secondaryCta: "Call the practice",
    emphasis: ["prominent appointment CTA", "treatment categories", "urgent appointment route", "new-patient registration information", "location and opening hours"],
    cautions: ["No clinical outcome claims", "No before/after imagery without documented consent", "Credentials only from verified facts"],
    palette: { primary: "#0e7490", accent: "#22d3ee", dark: "#164e63", light: "#f0fdff" },
  }),
  "medical-clinic": base({
    key: "medical-clinic",
    label: "Clinics & practitioners",
    primaryCta: "Book a consultation",
    emphasis: ["clear treatment categories", "what to expect at a first visit", "registration and referral guidance"],
    cautions: ["No health outcome claims", "No regulator claims unless verified", "Neutral, reassuring tone"],
    palette: { primary: "#0f766e", accent: "#2dd4bf", dark: "#134e4a", light: "#f0fdfa" },
  }),
  beauty: base({
    key: "beauty",
    label: "Beauty, hair & barbering",
    primaryCta: "Book a treatment",
    emphasis: ["treatment categories", "pricing link or placeholder", "practitioner introduction placeholder", "easy booking"],
    cautions: ["Before/after section only where authorised — placeholder otherwise", "No outcome guarantees"],
    palette: { primary: "#9d174d", accent: "#f472b6", dark: "#500724", light: "#fdf2f8" },
  }),
  restaurant: base({
    key: "restaurant",
    label: "Restaurants",
    primaryCta: "Book a table",
    secondaryCta: "View sample menu",
    sections: ["hero", "value-proposition", "services", "reviews", "coverage", "faq", "cta", "contact", "hours", "footer"],
    emphasis: ["menu visibility", "booking action", "opening hours", "dietary information placeholder", "food-gallery structure with licensed placeholders"],
    cautions: ["No dietary/allergen claims — placeholder pointing to the business's own information"],
    palette: { primary: "#b45309", accent: "#f59e0b", dark: "#451a03", light: "#fffbeb" },
  }),
  cafe: base({
    key: "cafe",
    label: "Cafés & coffee shops",
    primaryCta: "Find us",
    secondaryCta: "See opening hours",
    sections: ["hero", "value-proposition", "services", "reviews", "faq", "cta", "contact", "hours", "footer"],
    emphasis: ["location and hours first", "atmosphere", "menu highlights structure"],
    cautions: [],
    palette: { primary: "#78350f", accent: "#d97706", dark: "#3f2005", light: "#fef3c7" },
  }),
  catering: base({
    key: "catering",
    label: "Caterers",
    primaryCta: "Request a quote",
    emphasis: ["event types served", "enquiry-first journey", "sample menu structure"],
    cautions: ["No dietary claims without verification"],
    palette: { primary: "#365314", accent: "#84cc16", dark: "#1a2e05", light: "#f7fee7" },
  }),
  "estate-agency": base({
    key: "estate-agency",
    label: "Estate agents",
    primaryCta: "Book a valuation",
    secondaryCta: "Talk to the branch",
    emphasis: ["valuation CTA", "seller and landlord routes", "local-area expertise", "branch contact details"],
    cautions: ["No market-performance statistics", "No fee promises"],
    palette: { primary: "#1d4ed8", accent: "#60a5fa", dark: "#1e3a8a", light: "#eff6ff" },
  }),
  "financial-services": base({
    key: "financial-services",
    label: "Mortgage & financial",
    primaryCta: "Request a callback",
    emphasis: ["clarity of process", "what a first conversation covers", "contact simplicity"],
    cautions: ["NO financial promises or rate claims", "No regulatory status claims unless verified", "Neutral informational tone"],
    palette: { primary: "#065f46", accent: "#34d399", dark: "#022c22", light: "#ecfdf5" },
  }),
  "professional-services": base({
    key: "professional-services",
    label: "Accountants & advisers",
    primaryCta: "Book an introductory call",
    emphasis: ["services by client type", "switching-made-easy framing", "clear response expectations"],
    cautions: ["No savings or outcome promises", "No qualification claims unless verified"],
    palette: { primary: "#3730a3", accent: "#818cf8", dark: "#1e1b4b", light: "#eef2ff" },
  }),
  "legal-services": base({
    key: "legal-services",
    label: "Solicitors",
    primaryCta: "Request a consultation",
    emphasis: ["practice areas", "what to bring to a first meeting", "clear contact routes"],
    cautions: ["NO legal outcome claims", "No 'no win no fee' or fee claims", "SRA references only if verified"],
    palette: { primary: "#1f2937", accent: "#9ca3af", dark: "#030712", light: "#f9fafb" },
  }),
  "driving-school": base({
    key: "driving-school",
    label: "Driving schools",
    primaryCta: "Check availability",
    emphasis: ["areas covered", "learner journey steps", "simple enquiry"],
    cautions: ["No pass-rate claims"],
    palette: { primary: "#b91c1c", accent: "#f87171", dark: "#450a0a", light: "#fef2f2" },
  }),
  trades: base({
    key: "trades",
    label: "Trades (builders, electricians, plumbers, roofers)",
    primaryCta: "Request a quote",
    secondaryCta: "Call now",
    sections: ["hero", "value-proposition", "services", "coverage", "why-choose", "reviews", "process", "faq", "cta", "contact", "footer"],
    emphasis: ["quote CTA + call-now pairing", "service areas", "project-gallery placeholders", "response expectations"],
    cautions: ["Emergency availability ONLY if verified", "Qualifications (Gas Safe, NICEIC) ONLY if verified"],
    palette: { primary: "#c2410c", accent: "#fb923c", dark: "#431407", light: "#fff7ed" },
  }),
  landscaping: base({
    key: "landscaping",
    label: "Landscapers & gardeners",
    primaryCta: "Request a quote",
    emphasis: ["seasonal services structure", "project placeholders", "coverage area"],
    cautions: [],
    palette: { primary: "#15803d", accent: "#4ade80", dark: "#052e16", light: "#f0fdf4" },
  }),
  cleaning: base({
    key: "cleaning",
    label: "Cleaning companies",
    primaryCta: "Get a quote",
    emphasis: ["domestic vs commercial routes", "simple pricing enquiry", "reliability messaging"],
    cautions: ["No DBS/insurance claims unless verified"],
    palette: { primary: "#0369a1", accent: "#38bdf8", dark: "#082f49", light: "#f0f9ff" },
  }),
  automotive: base({
    key: "automotive",
    label: "Garages, tyres & detailing",
    primaryCta: "Book your vehicle in",
    secondaryCta: "Call the workshop",
    emphasis: ["service categories", "MOT/booking action", "location and hours", "honest plain-English framing"],
    cautions: ["No price promises"],
    palette: { primary: "#334155", accent: "#f59e0b", dark: "#0f172a", light: "#f8fafc" },
  }),
  childcare: base({
    key: "childcare",
    label: "Nurseries & childcare",
    primaryCta: "Book a visit",
    emphasis: ["visit booking", "day-in-the-life structure", "parent FAQ", "warm reassuring tone"],
    cautions: ["No Ofsted rating claims unless verified", "No photos of children ever — illustrative placeholders only"],
    palette: { primary: "#7c3aed", accent: "#c4b5fd", dark: "#2e1065", light: "#f5f3ff" },
  }),
  education: base({
    key: "education",
    label: "Tutors & training",
    primaryCta: "Enquire about places",
    emphasis: ["course/subject structure", "how sessions work", "clear enquiry route"],
    cautions: ["No results/grades claims"],
    palette: { primary: "#0e7490", accent: "#67e8f9", dark: "#083344", light: "#ecfeff" },
  }),
  "weddings-events": base({
    key: "weddings-events",
    label: "Wedding suppliers & venues",
    primaryCta: "Check your date",
    emphasis: ["date-availability enquiry", "gallery placeholders", "planning process steps"],
    cautions: ["Gallery uses licensed/placeholder imagery only"],
    palette: { primary: "#831843", accent: "#f9a8d4", dark: "#4c0519", light: "#fdf2f8" },
  }),
  "creative-services": base({
    key: "creative-services",
    label: "Photographers & creatives",
    primaryCta: "Check availability",
    emphasis: ["portfolio structure with placeholders", "packages structure", "booking journey"],
    cautions: ["Portfolio placeholders until owned images supplied"],
    palette: { primary: "#111827", accent: "#a78bfa", dark: "#030712", light: "#f9fafb" },
  }),
  fitness: base({
    key: "fitness",
    label: "Gyms & personal trainers",
    primaryCta: "Book a first session",
    emphasis: ["low-pressure first-visit framing", "class/service structure", "location and hours"],
    cautions: ["No body-transformation claims or imagery", "No health outcome claims"],
    palette: { primary: "#166534", accent: "#86efac", dark: "#052e16", light: "#f0fdf4" },
  }),
  "care-services": base({
    key: "care-services",
    label: "Care providers",
    primaryCta: "Talk to our team",
    emphasis: ["family-decision support", "what care looks like", "gentle clear next steps"],
    cautions: ["No CQC rating claims unless verified", "Especially careful, dignified tone"],
    palette: { primary: "#0f766e", accent: "#5eead4", dark: "#134e4a", light: "#f0fdfa" },
  }),
  removals: base({
    key: "removals",
    label: "Removal companies",
    primaryCta: "Get a moving quote",
    emphasis: ["quote-first journey", "coverage", "moving-day process steps"],
    cautions: ["No insurance claims unless verified"],
    palette: { primary: "#1e40af", accent: "#93c5fd", dark: "#172554", light: "#eff6ff" },
  }),
  retail: base({
    key: "retail",
    label: "Independent retailers",
    primaryCta: "Visit us",
    secondaryCta: "See opening hours",
    sections: ["hero", "value-proposition", "services", "reviews", "faq", "cta", "contact", "hours", "footer"],
    emphasis: ["location and hours", "what makes the shop distinct", "range structure"],
    cautions: [],
    palette: { primary: "#7c2d12", accent: "#fdba74", dark: "#431407", light: "#fff7ed" },
  }),
};

export function getStrategy(key: string): IndustryStrategy {
  return INDUSTRY_STRATEGIES[key] ?? INDUSTRY_STRATEGIES["professional-services"]!;
}
