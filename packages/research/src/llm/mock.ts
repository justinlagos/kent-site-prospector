import { FatalError, LlmAdapter, LlmCompletionRequest } from "@ksp/shared";
import { extractInputJson, extractTask } from "../prompts.js";

/**
 * Deterministic mock LLM. Parses the INPUT_JSON block from the shared prompt contract and
 * produces grounded output using only that data — mirroring the rules the real model is
 * given, so QA and claims validation exercise identical paths.
 */
export class MockLlmAdapter implements LlmAdapter {
  readonly source = "mock-llm";

  async complete(req: LlmCompletionRequest): Promise<string> {
    const task = extractTask(req.user);
    const input = extractInputJson(req.user) as Record<string, unknown> | null;
    if (!task || !input) {
      throw new FatalError("MOCK_LLM_CONTRACT", "Mock LLM requires TASK and INPUT_JSON blocks");
    }
    switch (task) {
      case "research-brief":
        return JSON.stringify(this.researchBrief(input));
      case "landing-copy":
        return JSON.stringify(this.landingCopy(input));
      case "email-copy":
        return JSON.stringify(this.emailCopy(input));
      default:
        throw new FatalError("MOCK_LLM_TASK", `Unknown mock task ${task}`);
    }
  }

  private researchBrief(input: Record<string, unknown>): unknown {
    const b = input.business as Record<string, unknown>;
    const scores = (input.auditScores ?? {}) as Record<string, number>;
    const findings = (input.auditFindings ?? {}) as Record<string, unknown>;
    const facts = (input.baselineFacts ?? []) as Array<{ fact: string; source: string }>;
    const name = String(b.name);
    const town = String(b.town);
    const category = String(b.categoryLabel);

    const weaknesses: string[] = [];
    if (findings.viewportMetaPresent === false) weaknesses.push("No mobile viewport configuration");
    if (findings.titleMissing === true) weaknesses.push("Missing page title");
    if (findings.metaDescriptionMissing === true) weaknesses.push("Missing meta description");
    if (findings.hasCallToAction === false) weaknesses.push("No clear call to action above the fold");
    if (findings.https === false) weaknesses.push("Site served without HTTPS");
    if (findings.copyrightOutdated === true) weaknesses.push("Outdated copyright year");
    if (findings.hasWebsite === false) weaknesses.push("No website found");

    const opportunities = [
      weaknesses.length > 0
        ? `Address: ${weaknesses[0]?.toLowerCase()}`
        : "Sharpen the primary enquiry pathway",
      "Make the primary contact action one tap on mobile",
      "Surface existing review reputation prominently",
    ];

    return {
      businessName: name,
      businessSummary: `${name} is a ${category.toLowerCase()} business in ${town}, Kent.`,
      targetCustomer: `Local customers in ${town} and surrounding areas searching for ${category.toLowerCase()}`,
      primaryServices: [category],
      apparentDifferentiators: [],
      locationServed: `${town} and surrounding Kent areas`,
      existingBrandColours: [],
      typographyStyle: "Unknown — propose a clean contemporary sans-serif",
      toneOfVoice: "Professional, local, approachable",
      keyCallsToAction: ["Call now", "Send an enquiry"],
      trustIndicators: facts.filter((f) => f.fact.includes("reviews")).map((f) => f.fact),
      openingHours: (b.openingHours as Record<string, string>) ?? null,
      contact: {
        phone: (b.phone as string) ?? null,
        email: (b.primaryEmail as string) ?? null,
        address: String(b.address),
        town,
      },
      reviewThemes: [],
      commonCustomerQuestions: [
        `How do I book with ${name}?`,
        "What areas do you cover?",
        "How quickly can you help?",
      ],
      conversionOpportunities: opportunities,
      contentGaps: ["Service detail pages", "Frequently asked questions"],
      designWeaknesses: weaknesses,
      recommendedStructure: [
        "hero",
        "value-proposition",
        "services",
        "why-choose",
        "reviews",
        "process",
        "faq",
        "cta",
        "contact",
        "footer",
      ],
      verifiedFacts: facts,
      designRecommendations: [
        "Introduce a persistent mobile call bar",
        "Use high-contrast accessible colour pairings",
        "Restructure services into scannable cards",
      ],
      unknowns: [
        "Team size and staff names",
        "Pricing",
        "Years trading",
        "Qualifications and accreditations",
      ],
      placeholders: [
        "Owned photography of premises and work",
        "Written permission for any customer testimonials",
        "Confirmed service list from the owner",
      ],
      _auditOpportunityScore: scores.opportunityScore ?? null,
    };
  }

  private landingCopy(input: Record<string, unknown>): unknown {
    const name = String(input.businessName ?? "the business");
    const town = String((input.contact as Record<string, unknown>)?.town ?? "Kent");
    const services = (input.primaryServices as string[]) ?? ["services"];
    const service = services[0] ?? "services";
    const ctas = (input.keyCallsToAction as string[]) ?? ["Get in touch"];

    return {
      heroHeadline: `${service} in ${town}, made simple`,
      heroSubheadline: `${name} serves ${town} and the surrounding area. Get in touch today and we'll take it from there.`,
      valueProps: [
        { title: "Local to you", body: `Based in ${town}, serving the local community.` },
        { title: "Easy to reach", body: "Call or send an enquiry in under a minute — no forms with twenty fields." },
        { title: "Clear communication", body: "You'll always know what happens next and when." },
      ],
      servicesIntro: `Everything ${name} offers, explained clearly — so you can find what you need fast.`,
      whyChooseIntro: `Choosing local matters. Here's what to expect when you contact ${name}.`,
      processSteps: [
        { title: "Get in touch", body: "Call or use the enquiry form — whichever suits you." },
        { title: "Tell us what you need", body: "A quick conversation to understand your situation." },
        { title: "We take it from there", body: "Clear next steps, agreed together." },
      ],
      faqItems: [
        { question: "What areas do you cover?", answer: `${town} and the surrounding Kent area.` },
        { question: "How do I get in touch?", answer: "Use the phone number or enquiry button on this page." },
        { question: "How quickly will I hear back?", answer: "Enquiries are typically answered during normal opening hours." },
      ],
      ctaHeadline: `Ready to talk to ${name}?`,
      ctaBody: `${ctas[0] ?? "Get in touch"} — there's no obligation and no pressure.`,
    };
  }

  private emailCopy(input: Record<string, unknown>): unknown {
    const name = String(input.businessName ?? "your business");
    const town = String(input.town ?? "Kent");
    const category = String(input.categoryLabel ?? "local").toLowerCase();
    const positives = (input.positiveSignals as string[]) ?? [];
    const weaknesses = (input.objectiveWeaknesses as string[]) ?? [];
    const positive = positives[0] ?? `an established presence in ${town}`;
    const weakness = weaknesses[0] ?? "the enquiry journey could be made clearer for mobile visitors";

    return {
      subject: `A website concept for ${name}`,
      observationPositive: positive,
      observationOpportunity: weakness,
      bodyText:
        `I came across ${name} while reviewing ${category} businesses in ${town}. ` +
        `You already have ${positive.toLowerCase().replace(/\.$/, "")}. I also noticed that ${weakness.toLowerCase().replace(/\.$/, "")}.\n\n` +
        `I put together a short, independent landing-page concept showing how the customer journey could be made clearer, particularly around getting in touch. ` +
        `It's a private, unindexed demonstration — not connected to your official website — and there's no obligation of any kind.\n\n` +
        `If the direction looks useful, I'd be happy to explain what I changed and what a complete version would involve.`,
    };
  }
}
