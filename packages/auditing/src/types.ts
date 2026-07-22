export interface AuditFindings {
  hasWebsite: boolean;
  reachable: boolean;
  robotsAllowed: boolean;
  https: boolean;
  statusCode: number | null;
  loadTimeMs: number | null;
  pageWeightBytes: number | null;
  title: string | null;
  titleMissing: boolean;
  metaDescriptionMissing: boolean;
  viewportMetaPresent: boolean;
  h1Present: boolean;
  mobileHorizontalOverflow: boolean;
  brokenLinkCount: number;
  checkedLinkCount: number;
  brokenImageCount: number;
  imagesMissingAltCount: number;
  imageCount: number;
  copyrightYear: number | null;
  copyrightOutdated: boolean;
  hasCallToAction: boolean;
  hasPhoneLink: boolean;
  hasEmailLink: boolean;
  /** Generic/role emails published by the business on its own site (homepage + contact page). */
  foundEmails: string[];
  contactInfoVisible: boolean;
  hasBookingFunctionality: boolean;
  hasForm: boolean;
  trustSignals: string[];
  reviewsMentioned: boolean;
  hasCookieBanner: boolean;
  hasPrivacyPage: boolean;
  hasTermsPage: boolean;
  analyticsDetected: string[];
  intrusivePopupSuspected: boolean;
  navLinkCount: number;
  wordCount: number;
  readabilityFleschKincaid: number | null;
  localRelevanceSignals: string[];
  outdatedAnnouncement: boolean;
  socialProofPresent: boolean;
  accessibilityIssues: string[];
  notes: string[];
}

export interface AuditScores {
  technicalScore: number;
  designScore: number;
  conversionScore: number;
  contentScore: number;
  seoScore: number;
  trustScore: number;
  opportunityScore: number;
}

export interface AuditReport {
  findings: AuditFindings;
  scores: AuditScores;
  evidence: Record<string, unknown>;
  screenshotPaths: Record<string, string>;
}

export function emptyFindings(): AuditFindings {
  return {
    hasWebsite: false,
    reachable: false,
    robotsAllowed: true,
    https: false,
    statusCode: null,
    loadTimeMs: null,
    pageWeightBytes: null,
    title: null,
    titleMissing: true,
    metaDescriptionMissing: true,
    viewportMetaPresent: false,
    h1Present: false,
    mobileHorizontalOverflow: false,
    brokenLinkCount: 0,
    checkedLinkCount: 0,
    brokenImageCount: 0,
    imagesMissingAltCount: 0,
    imageCount: 0,
    copyrightYear: null,
    copyrightOutdated: false,
    hasCallToAction: false,
    hasPhoneLink: false,
    hasEmailLink: false,
    foundEmails: [],
    contactInfoVisible: false,
    hasBookingFunctionality: false,
    hasForm: false,
    trustSignals: [],
    reviewsMentioned: false,
    hasCookieBanner: false,
    hasPrivacyPage: false,
    hasTermsPage: false,
    analyticsDetected: [],
    intrusivePopupSuspected: false,
    navLinkCount: 0,
    wordCount: 0,
    readabilityFleschKincaid: null,
    localRelevanceSignals: [],
    outdatedAnnouncement: false,
    socialProofPresent: false,
    accessibilityIssues: [],
    notes: [],
  };
}
