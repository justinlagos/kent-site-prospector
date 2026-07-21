import { FatalError, LlmAdapter, type Logger } from "@ksp/shared";
import {
  BriefSourceData,
  ResearchBrief,
  baselineVerifiedFacts,
  researchBriefSchema,
} from "./brief.js";
import { RESEARCH_BRIEF_SYSTEM, researchBriefUserPrompt } from "./prompts.js";

const SCHEMA_DESCRIPTION = `{
  businessName, businessSummary, targetCustomer, primaryServices[], apparentDifferentiators[],
  locationServed, existingBrandColours[], typographyStyle, toneOfVoice, keyCallsToAction[],
  trustIndicators[], openingHours|null, contact{phone|null,email|null,address,town},
  reviewThemes[], commonCustomerQuestions[], conversionOpportunities[], contentGaps[],
  designWeaknesses[], recommendedStructure[],
  verifiedFacts[{fact,source}], designRecommendations[], unknowns[], placeholders[]
}`;

/**
 * Generate a research brief. The LLM receives only structured source data; its output is
 * schema-validated, then verifiedFacts are HARD-REPLACED with the deterministic baseline
 * set plus any LLM facts that exactly re-state baseline material. The model cannot smuggle
 * a new "fact" into the verified section.
 */
export async function generateResearchBrief(
  llm: LlmAdapter,
  logger: Logger,
  src: BriefSourceData,
): Promise<ResearchBrief> {
  const baseline = baselineVerifiedFacts(src);
  const input = {
    business: src.business,
    auditFindings: src.auditFindings,
    auditScores: src.auditScores,
    baselineFacts: baseline,
  };

  const raw = await llm.complete({
    system: RESEARCH_BRIEF_SYSTEM,
    user: researchBriefUserPrompt(JSON.stringify(input, null, 2), SCHEMA_DESCRIPTION),
    jsonResponse: true,
    maxTokens: 4096,
    temperature: 0.3,
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new FatalError("BRIEF_PARSE", "Research brief was not valid JSON");
  }

  const result = researchBriefSchema.safeParse(parsed);
  if (!result.success) {
    throw new FatalError("BRIEF_SCHEMA", `Research brief failed validation: ${result.error.message.slice(0, 500)}`);
  }
  const brief = result.data;

  // Provenance enforcement: verified facts are the deterministic baseline, full stop.
  // LLM-added "facts" that aren't baseline-backed are demoted to unknowns for transparency.
  const baselineTexts = new Set(baseline.map((f) => f.fact.toLowerCase()));
  const demoted = brief.verifiedFacts
    .filter((f) => !baselineTexts.has(f.fact.toLowerCase()))
    .map((f) => `Unverified model assertion demoted: ${f.fact}`);
  brief.verifiedFacts = baseline;
  brief.unknowns = [...brief.unknowns, ...demoted];
  if (demoted.length > 0) {
    logger.warn("research brief: demoted unverified assertions", { count: demoted.length });
  }

  return brief;
}
