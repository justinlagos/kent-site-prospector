import type { AuditFindings, AuditScores } from "./types.js";

/**
 * Deterministic, objective scoring from findings. Each sub-score is 0–100 (higher = better
 * for the business's current site). The opportunity score is roughly the inverse — how much
 * a redesign could plausibly help — boosted when the business is clearly active (reviews)
 * but the site underperforms.
 */
export function computeScores(f: AuditFindings): AuditScores {
  if (!f.hasWebsite || !f.reachable) {
    return {
      technicalScore: 0,
      designScore: 0,
      conversionScore: 0,
      contentScore: 0,
      seoScore: 0,
      trustScore: 0,
      opportunityScore: f.hasWebsite ? 85 : 95,
    };
  }

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

  let technical = 100;
  if (!f.https) technical -= 30;
  if (f.loadTimeMs !== null && f.loadTimeMs > 4000) technical -= 20;
  else if (f.loadTimeMs !== null && f.loadTimeMs > 2500) technical -= 10;
  if (f.pageWeightBytes !== null && f.pageWeightBytes > 4_000_000) technical -= 15;
  if (f.checkedLinkCount > 0) technical -= Math.min(25, (f.brokenLinkCount / f.checkedLinkCount) * 100 * 0.5);
  if (f.brokenImageCount > 0) technical -= Math.min(15, f.brokenImageCount * 5);
  if (!f.viewportMetaPresent) technical -= 20;
  if (f.mobileHorizontalOverflow) technical -= 15;

  let design = 100;
  if (!f.viewportMetaPresent) design -= 25;
  if (f.mobileHorizontalOverflow) design -= 20;
  if (f.copyrightOutdated) design -= 15;
  if (f.intrusivePopupSuspected) design -= 15;
  if (f.imageCount === 0) design -= 10;
  if (f.brokenImageCount > 0) design -= 10;
  if (f.navLinkCount === 0) design -= 15;
  if (f.navLinkCount > 40) design -= 10;

  let conversion = 100;
  if (!f.hasCallToAction) conversion -= 30;
  if (!f.hasPhoneLink) conversion -= 15;
  if (!f.contactInfoVisible) conversion -= 20;
  if (!f.hasBookingFunctionality && !f.hasForm) conversion -= 20;
  if (f.intrusivePopupSuspected) conversion -= 10;

  let content = 100;
  if (f.wordCount < 120) content -= 30;
  else if (f.wordCount < 250) content -= 15;
  if (f.readabilityFleschKincaid !== null && f.readabilityFleschKincaid > 14) content -= 10;
  if (f.outdatedAnnouncement) content -= 20;
  if (!f.h1Present) content -= 10;
  if (f.localRelevanceSignals.length === 0) content -= 15;

  let seo = 100;
  if (f.titleMissing) seo -= 30;
  if (f.metaDescriptionMissing) seo -= 25;
  if (!f.h1Present) seo -= 15;
  if (!f.https) seo -= 10;
  if (!f.viewportMetaPresent) seo -= 10;
  if (f.imagesMissingAltCount > 3) seo -= 10;

  let trust = 100;
  if (f.trustSignals.length === 0) trust -= 25;
  if (!f.reviewsMentioned) trust -= 15;
  if (!f.hasPrivacyPage) trust -= 15;
  if (!f.https) trust -= 20;
  if (f.copyrightOutdated) trust -= 10;
  if (!f.socialProofPresent) trust -= 10;

  const scores = {
    technicalScore: clamp(technical),
    designScore: clamp(design),
    conversionScore: clamp(conversion),
    contentScore: clamp(content),
    seoScore: clamp(seo),
    trustScore: clamp(trust),
  };

  const mean =
    (scores.technicalScore +
      scores.designScore +
      scores.conversionScore * 1.5 +
      scores.contentScore +
      scores.seoScore +
      scores.trustScore) /
    6.5;
  const opportunityScore = clamp(100 - mean);

  return { ...scores, opportunityScore };
}

/** Flesch–Kincaid grade estimate for readability. */
export function fleschKincaidGrade(text: string): number | null {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (sentences === 0 || words.length < 30) return null;
  const syllables = words.reduce((acc, w) => acc + countSyllables(w), 0);
  return Math.round((0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59) * 10) / 10;
}

function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const matches = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, matches?.length ?? 1);
}
