import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { AuditReport, emptyFindings } from "./types.js";
import { computeScores } from "./scores.js";

/**
 * Deterministic offline audit for mock businesses (reserved example domains).
 * Quality is driven by the `mockquality` URL marker set by the mock directory:
 * weak | average | strong. Placeholder 1x1 PNG screenshots are written so downstream
 * artifact handling is exercised.
 */

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

export async function mockAudit(websiteUrl: string, screenshotDir: string): Promise<AuditReport> {
  const quality = /mockquality=(weak|average|strong)/.exec(websiteUrl)?.[1] ?? "weak";
  const f = emptyFindings();
  f.hasWebsite = true;
  f.reachable = true;
  f.robotsAllowed = true;
  f.statusCode = 200;
  f.title = "Home";
  f.notes.push(`mock audit (${quality})`);

  if (quality === "weak") {
    f.https = false;
    f.loadTimeMs = 6200;
    f.pageWeightBytes = 5_400_000;
    f.titleMissing = true;
    f.metaDescriptionMissing = true;
    f.viewportMetaPresent = false;
    f.h1Present = false;
    f.mobileHorizontalOverflow = true;
    f.brokenLinkCount = 3;
    f.checkedLinkCount = 8;
    f.brokenImageCount = 2;
    f.imagesMissingAltCount = 6;
    f.imageCount = 9;
    f.copyrightYear = 2019;
    f.copyrightOutdated = true;
    f.hasCallToAction = false;
    f.hasPhoneLink = false;
    f.contactInfoVisible = true;
    f.wordCount = 160;
    f.outdatedAnnouncement = true;
    f.navLinkCount = 3;
  } else if (quality === "average") {
    f.https = true;
    f.loadTimeMs = 3100;
    f.pageWeightBytes = 2_500_000;
    f.titleMissing = false;
    f.metaDescriptionMissing = true;
    f.viewportMetaPresent = true;
    f.h1Present = true;
    f.brokenLinkCount = 1;
    f.checkedLinkCount = 10;
    f.imagesMissingAltCount = 2;
    f.imageCount = 12;
    f.copyrightYear = new Date().getFullYear() - 1;
    f.hasCallToAction = true;
    f.hasPhoneLink = true;
    f.contactInfoVisible = true;
    f.hasForm = true;
    f.wordCount = 420;
    f.reviewsMentioned = true;
    f.socialProofPresent = true;
    f.navLinkCount = 8;
    f.localRelevanceSignals = ["kent"];
    f.hasPrivacyPage = true;
  } else {
    f.https = true;
    f.loadTimeMs = 1400;
    f.pageWeightBytes = 900_000;
    f.titleMissing = false;
    f.metaDescriptionMissing = false;
    f.viewportMetaPresent = true;
    f.h1Present = true;
    f.checkedLinkCount = 10;
    f.imageCount = 14;
    f.copyrightYear = new Date().getFullYear();
    f.hasCallToAction = true;
    f.hasPhoneLink = true;
    f.hasEmailLink = true;
    f.contactInfoVisible = true;
    f.hasBookingFunctionality = true;
    f.hasForm = true;
    f.wordCount = 800;
    f.trustSignals = ["regulator-or-accreditation"];
    f.reviewsMentioned = true;
    f.socialProofPresent = true;
    f.hasCookieBanner = true;
    f.hasPrivacyPage = true;
    f.hasTermsPage = true;
    f.navLinkCount = 10;
    f.localRelevanceSignals = ["kent", "maidstone"];
  }

  await mkdir(screenshotDir, { recursive: true });
  const screenshotPaths: Record<string, string> = {};
  for (const name of ["mobile-390", "tablet-768", "desktop-1440"]) {
    const file = path.join(screenshotDir, `${name}.png`);
    await writeFile(file, PNG_1x1);
    screenshotPaths[name] = file;
  }

  return {
    findings: f,
    scores: computeScores(f),
    evidence: { mock: true, quality, url: websiteUrl },
    screenshotPaths,
  };
}
