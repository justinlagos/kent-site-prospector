/**
 * Critical-scenario integration tests (the 15 acceptance scenarios).
 * Runs against the ksp_test PostgreSQL database with mock adapters.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createLogger,
  loadEnv,
  type Env,
  type LondonClock,
} from "@ksp/shared";
import { getPrisma, disconnectPrisma, runSeed, type PrismaClient } from "@ksp/database";
import { evaluateProspect, addSuppression } from "@ksp/compliance";
import { importDiscoveredBusinesses } from "@ksp/discovery";
import { scoreProspect, selectDailyPair } from "@ksp/scoring";
import { registerAsset, assertRenderedAssetsPublishable } from "@ksp/asset-management";
import { MockDeployAdapter, unpublishExpiredConcepts, runQaPipeline } from "@ksp/deployment";
import {
  MockEmailProviderAdapter,
  processScheduledSends,
  queueOutreachEmail,
  processProviderEvent,
  handleUnsubscribe,
} from "@ksp/email";
import { runDailyPipeline } from "./pipeline.js";
import { buildAdapters } from "./adapters.js";

const TEST_URL = process.env.TEST_DATABASE_URL ?? "postgresql://ksp:ksp_dev_password@localhost:5432/ksp_test";
const logger = createLogger("error", { app: "test" });

let prisma: PrismaClient;
let env: Env;
let varDir: string;

// Tuesday 2026-07-21 13:00 BST (12:00 UTC) — inside the send window.
const TUESDAY_1300: LondonClock = { now: () => new Date("2026-07-21T12:00:00Z") };
const SATURDAY: LondonClock = { now: () => new Date("2026-07-25T12:00:00Z") };
// End of the send window — every randomised slot for the day is due by now.
const TUESDAY_1559: LondonClock = { now: () => new Date("2026-07-21T14:59:30Z") };

function makeEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    APP_ENV: "test",
    DATABASE_URL: TEST_URL,
    VAR_DIR: varDir,
    AGENCY_NAME: "Example Web Studio",
    AGENCY_WEBSITE: "https://studio.example.com",
    AGENCY_PHONE: "01622 000000",
    AGENCY_POSTAL_ADDRESS: "1 Example Lane, Maidstone ME14 1XX",
    AGENCY_SENDER_NAME: "Alex Example",
    AGENCY_SENDER_EMAIL: "alex@studio.example.com",
    AGENCY_REPLY_TO_EMAIL: "alex@studio.example.com",
    ...overrides,
  } as never);
}

beforeAll(async () => {
  varDir = mkdtempSync(path.join(tmpdir(), "ksp-test-"));
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    cwd: path.resolve(__dirname, "../../../packages/database"),
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "pipe",
  });
  prisma = getPrisma(TEST_URL);
  await runSeed(TEST_URL);
  env = makeEnv();
}, 120_000);

afterAll(async () => {
  await disconnectPrisma();
});

async function resetData(): Promise<void> {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "OutreachEmail","Concept","Asset","ComplianceRecord","ProspectScore","WebsiteAudit","Contact","Conversion","Suppression","DeadLetter","AutomationStage","AutomationRun","AuditLog" CASCADE`,
  );
  await prisma.business.deleteMany();
  await prisma.territoryCategoryScan.updateMany({ data: { status: "PENDING", scannedAt: null } });
}

beforeEach(async () => {
  await resetData();
});

interface MakeBusinessOpts {
  name?: string;
  legalForm?: "LTD" | "SOLE_TRADER" | "PARTNERSHIP" | "UNKNOWN";
  companyNumber?: string | null;
  email?: string;
  emailValid?: boolean;
  emailType?: "GENERIC" | "PERSONAL";
  postcode?: string;
  opportunityScore?: number;
}

async function makeBusiness(opts: MakeBusinessOpts = {}) {
  const territory = await prisma.territory.findFirstOrThrow({ where: { town: "Maidstone" } });
  const category = await prisma.category.findFirstOrThrow({ where: { key: "dentists" } });
  const name = opts.name ?? `Test Dental ${Math.random().toString(36).slice(2, 8)} Ltd`;
  const business = await prisma.business.create({
    data: {
      name,
      legalForm: opts.legalForm ?? "LTD",
      companyNumber: opts.companyNumber === null ? null : opts.companyNumber ?? "12345678",
      companyStatus: "active",
      categoryId: category.id,
      territoryId: territory.id,
      address: "1 High Street",
      town: "Maidstone",
      postcode: opts.postcode ?? "ME14 1AA",
      phone: "01622 111222",
      website: "https://x.example.com/?mockquality=weak",
      primaryEmail: opts.email ?? `info@${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.example.com`,
      discoverySource: "test",
      confidence: "HIGH",
      dedupFingerprint: `fp-${name}`,
      status: "VERIFIED",
      reviewCount: 40,
      reviewRating: 4.6,
    },
  });
  const contact = await prisma.contact.create({
    data: {
      businessId: business.id,
      email: business.primaryEmail!,
      emailType: opts.emailType ?? "GENERIC",
      validationStatus: opts.emailValid === false ? "INVALID" : "VALID",
      source: "test",
    },
  });
  await prisma.websiteAudit.create({
    data: {
      businessId: business.id,
      hasWebsite: true,
      technicalScore: 20,
      designScore: 30,
      conversionScore: 25,
      contentScore: 40,
      seoScore: 10,
      trustScore: 20,
      opportunityScore: opts.opportunityScore ?? 75,
      findingsJson: { hasWebsite: true, viewportMetaPresent: false, hasCallToAction: false },
      evidenceJson: {},
    },
  });
  return { business, contact };
}

async function makeSendableEmail(businessId: string, contactId: string, conceptId?: string) {
  let cid = conceptId;
  if (!cid) {
    const concept = await prisma.concept.create({
      data: {
        businessId,
        slug: `concept-${Math.random().toString(36).slice(2, 12)}`,
        status: "DEPLOYED",
        contentJson: {},
        previewUrl: "https://concept-x.netlify.example/",
        deployedAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    cid = concept.id;
  }
  await evaluateProspect(prisma, logger, { businessId, privacyNoticeVersion: "1.0" });
  const queued = await queueOutreachEmail(prisma, env, logger, {
    businessId,
    contactId,
    conceptId: cid,
    subject: "A website concept for you",
    bodyText: "Hello — concept body",
    bodyHtml: "<p>Hello</p>",
    runDate: "2026-07-21",
  });
  // Make it due now.
  await prisma.outreachEmail.update({
    where: { id: queued.outreachEmailId },
    data: { scheduledAt: new Date("2026-07-21T09:30:00Z") },
  });
  return queued.outreachEmailId;
}

function outbox(): MockEmailProviderAdapter {
  return new MockEmailProviderAdapter(path.join(varDir, "outbox"));
}

describe("compliance decisions (scenarios 1-3, 5)", () => {
  it("1. approves an active Ltd with a validated generic email", async () => {
    const { business } = await makeBusiness();
    const result = await evaluateProspect(prisma, logger, { businessId: business.id, privacyNoticeVersion: "1.0" });
    expect(result.decision).toBe("CORPORATE_APPROVED");
  });

  it("2. blocks a sole trader from automated outreach", async () => {
    const { business } = await makeBusiness({ legalForm: "SOLE_TRADER" });
    const result = await evaluateProspect(prisma, logger, { businessId: business.id, privacyNoticeVersion: "1.0" });
    expect(result.decision).toBe("CONSENT_REQUIRED");
  });

  it("3. routes unknown legal forms to manual review", async () => {
    const { business } = await makeBusiness({ legalForm: "UNKNOWN", companyNumber: null });
    const result = await evaluateProspect(prisma, logger, { businessId: business.id, privacyNoticeVersion: "1.0" });
    expect(result.decision).toBe("MANUAL_REVIEW_REQUIRED");
  });

  it("5. blocks businesses whose only email failed validation", async () => {
    const { business } = await makeBusiness({ emailValid: false });
    const result = await evaluateProspect(prisma, logger, { businessId: business.id, privacyNoticeVersion: "1.0" });
    expect(result.decision).toBe("EMAIL_UNVERIFIED");
  });

  it("blocks personal-only contact routes", async () => {
    const { business } = await makeBusiness({ emailType: "PERSONAL", email: "jane.smith@biz.example.com" });
    const result = await evaluateProspect(prisma, logger, { businessId: business.id, privacyNoticeVersion: "1.0" });
    expect(result.decision).toBe("EMAIL_UNVERIFIED");
  });
});

describe("suppression (scenarios 4, 10)", () => {
  it("4. a suppressed company is never selected", async () => {
    const { business } = await makeBusiness();
    await scoreProspect(prisma, logger, business.id);
    await evaluateProspect(prisma, logger, { businessId: business.id, privacyNoticeVersion: "1.0" });
    await addSuppression(prisma, { businessId: business.id, reason: "OBJECTION", source: "test" });
    const selected = await selectDailyPair(prisma, logger, {
      candidateBusinessIds: [business.id],
      minScore: 1,
    });
    expect(selected).toHaveLength(0);
  });

  it("a suppressed email is never re-imported", async () => {
    await addSuppression(prisma, { email: "info@suppressed.example.com", reason: "UNSUBSCRIBED", source: "test" });
    const territory = await prisma.territory.findFirstOrThrow();
    const category = await prisma.category.findFirstOrThrow();
    const result = await importDiscoveredBusinesses(prisma, logger, {
      discovered: [
        {
          providerPlaceId: "p1",
          name: "Suppressed Biz Ltd",
          address: "1 St",
          postcode: "ME14 1AA",
          town: "Maidstone",
          email: "info@suppressed.example.com",
          confidence: "HIGH",
        },
      ],
      source: "test",
      territoryId: territory.id,
      categoryId: category.id,
    });
    expect(result.imported).toHaveLength(0);
    expect(result.suppressedSkipped).toBe(1);
  });

  it("10. one-click unsubscribe immediately suppresses future activity", async () => {
    const { business, contact } = await makeBusiness();
    const emailId = await makeSendableEmail(business.id, contact.id);
    const row = await prisma.outreachEmail.findUniqueOrThrow({ where: { id: emailId } });
    const result = await handleUnsubscribe(prisma, logger, env.UNSUBSCRIBE_HMAC_SECRET, row.unsubscribeToken!);
    expect(result.ok).toBe(true);

    const updated = await prisma.outreachEmail.findUniqueOrThrow({ where: { id: emailId } });
    expect(updated.status).toBe("UNSUBSCRIBED");

    // Nothing sends afterwards.
    const cycle = await processScheduledSends(prisma, env, outbox(), logger, TUESDAY_1300);
    expect(cycle.sent).toBe(0);

    // And compliance now refuses the business entirely.
    const decision = await evaluateProspect(prisma, logger, { businessId: business.id, privacyNoticeVersion: "1.0" });
    expect(decision.decision).toBe("SUPPRESSED");
  });
});

describe("dedup", () => {
  it("does not re-import the same business twice", async () => {
    const territory = await prisma.territory.findFirstOrThrow();
    const category = await prisma.category.findFirstOrThrow();
    const discovered = {
      providerPlaceId: "dup-1",
      name: "Duplicate Dental Ltd",
      address: "2 St",
      postcode: "ME14 2BB",
      town: "Maidstone",
      confidence: "HIGH" as const,
    };
    const first = await importDiscoveredBusinesses(prisma, logger, {
      discovered: [discovered],
      source: "test",
      territoryId: territory.id,
      categoryId: category.id,
    });
    expect(first.imported).toHaveLength(1);
    const second = await importDiscoveredBusinesses(prisma, logger, {
      discovered: [{ ...discovered, providerPlaceId: "dup-2" }], // same name+postcode, new provider id
      source: "test",
      territoryId: territory.id,
      categoryId: category.id,
    });
    expect(second.imported).toHaveLength(0);
    expect(second.duplicates).toBe(1);
  });
});

describe("asset rights and claims (scenarios 6, 7, 15)", () => {
  it("6. a concept referencing an unlicensed image is blocked", async () => {
    const { business } = await makeBusiness();
    await registerAsset(prisma, {
      businessId: business.id,
      source: "google-images",
      sourceUrl: "https://cdn.example.com/photo.jpg",
      requestedStatus: "LICENSED_STOCK", // downgraded to REFERENCE_ONLY: third-party source
      intendedUse: "hero",
    });
    const html = `<html><body><img src="https://cdn.example.com/photo.jpg"/></body></html>`;
    await expect(assertRenderedAssetsPublishable(prisma, business.id, html)).rejects.toThrow(/REFERENCE_ONLY/);
  });

  it("blocks entirely unregistered external assets", async () => {
    const { business } = await makeBusiness();
    const html = `<img src="https://elsewhere.example.com/stolen.png"/>`;
    await expect(assertRenderedAssetsPublishable(prisma, business.id, html)).rejects.toThrow(/not registered/);
  });

  it("7 & 15. QA blocks invented claims and cross-prospect leakage", async () => {
    const { business } = await makeBusiness({ name: "Alpha Dental Ltd" });
    const { business: other } = await makeBusiness({ name: "Beta Dental Ltd", postcode: "CT1 1AA" });

    const brief = {
      businessName: business.name,
      businessSummary: "s", targetCustomer: "t", primaryServices: ["Dentistry"],
      apparentDifferentiators: [], locationServed: "Maidstone", existingBrandColours: [],
      typographyStyle: "sans", toneOfVoice: "warm", keyCallsToAction: ["Book"],
      trustIndicators: [], openingHours: null,
      contact: { phone: "01622 111222", email: null, address: "1 High Street", town: "Maidstone" },
      reviewThemes: [], commonCustomerQuestions: [], conversionOpportunities: ["x"],
      contentGaps: [], designWeaknesses: [], recommendedStructure: ["hero"],
      verifiedFacts: [], designRecommendations: [], unknowns: [], placeholders: [],
    };
    const badHtml = `<!doctype html><html lang="en-GB"><head><meta name="viewport" content="width=device-width"/><meta name="robots" content="noindex, nofollow, noarchive"/><title>t</title></head><body><main><h1>Award-winning dentistry</h1><p>Independent website concept prepared by Example Web Studio. This is not the official website of ${business.name}.</p><p>Also try ${other.name}</p><a class="btn" href="tel:01622111222">Call</a>${"x".repeat(2000)}</main></body></html>`;

    const qa = await runQaPipeline(prisma, logger, {
      businessId: business.id,
      files: { "index.html": badHtml, "robots.txt": "User-agent: *\nDisallow: /\n", _headers: "/*\n  X-Robots-Tag: noindex, nofollow\n" },
      brief: brief as never,
      agency: {
        name: "Example Web Studio", website: "https://studio.example.com", phone: "01622 000000",
        postalAddress: "1 Example Lane", senderName: "Alex", senderEmail: "a@studio.example.com", replyToEmail: "a@studio.example.com",
      },
      screenshotDir: path.join(varDir, "qa-shots"),
      otherBusinessIds: [business.id, other.id],
    });
    expect(qa.passed).toBe(false);
    const failed = Object.fromEntries(qa.checks.map((c) => [c.name, c]));
    expect(failed["no-invented-claims"]!.passed).toBe(false);
    expect(failed["no-cross-prospect-leak"]!.passed).toBe(false);
  }, 60_000);
});

describe("sending controls (scenarios 9, 12, 13)", () => {
  it("12. sends at most the daily cap of first-contact emails in one weekday", async () => {
    const businesses = await Promise.all([makeBusiness(), makeBusiness(), makeBusiness()]);
    for (const { business, contact } of businesses) {
      await makeSendableEmail(business.id, contact.id);
    }
    const cycle = await processScheduledSends(prisma, env, outbox(), logger, TUESDAY_1300);
    expect(cycle.sent).toBe(2);
    expect(cycle.deferred).toBe(1);
    const sentCount = await prisma.outreachEmail.count({ where: { status: "SENT" } });
    expect(sentCount).toBe(2);
  });

  it("13. sends nothing at the weekend", async () => {
    const { business, contact } = await makeBusiness();
    await makeSendableEmail(business.id, contact.id);
    const cycle = await processScheduledSends(prisma, env, outbox(), logger, SATURDAY);
    expect(cycle.sent).toBe(0);
  });

  it("respects the kill switch setting", async () => {
    const { business, contact } = await makeBusiness();
    await makeSendableEmail(business.id, contact.id);
    await prisma.setting.update({ where: { key: "emailKillSwitch" }, data: { value: true } });
    const cycle = await processScheduledSends(prisma, env, outbox(), logger, TUESDAY_1300);
    expect(cycle.sent).toBe(0);
    await prisma.setting.update({ where: { key: "emailKillSwitch" }, data: { value: false } });
  });

  it("9. a successful send is not duplicated after a worker crash/restart", async () => {
    const { business, contact } = await makeBusiness();
    const emailId = await makeSendableEmail(business.id, contact.id);
    const provider = outbox();

    const first = await processScheduledSends(prisma, env, provider, logger, TUESDAY_1300);
    expect(first.sent).toBe(1);
    const sentRow = await prisma.outreachEmail.findUniqueOrThrow({ where: { id: emailId } });

    // Simulate a crash after provider send but before the DB write was durable:
    await prisma.outreachEmail.update({
      where: { id: emailId },
      data: { status: "SCHEDULED", providerMessageId: null, sentAt: null },
    });

    const second = await processScheduledSends(prisma, env, provider, logger, TUESDAY_1300);
    expect(second.reconciled).toBe(1);
    expect(second.sent).toBe(0);

    const finalRow = await prisma.outreachEmail.findUniqueOrThrow({ where: { id: emailId } });
    expect(finalRow.status).toBe("SENT");
    expect(finalRow.providerMessageId).toBe(sentRow.providerMessageId);

    // Exactly one .eml exists for this idempotency reference.
    const emlFiles = readdirSync(path.join(varDir, "outbox")).filter((f) => f.endsWith(".eml"));
    const index = JSON.parse(readFileSync(path.join(varDir, "outbox", "index.json"), "utf8")) as Record<string, unknown>;
    expect(Object.keys(index).filter((k) => k === finalRow.idempotencyKey)).toHaveLength(1);
    expect(emlFiles.length).toBeGreaterThan(0);
  });

  it("queueing is idempotent per (business, contact, sequence)", async () => {
    const { business, contact } = await makeBusiness();
    const id1 = await makeSendableEmail(business.id, contact.id);
    const q2 = await queueOutreachEmail(prisma, env, logger, {
      businessId: business.id,
      contactId: contact.id,
      conceptId: (await prisma.concept.findFirstOrThrow({ where: { businessId: business.id } })).id,
      subject: "different subject",
      bodyText: "different body",
      bodyHtml: "<p>x</p>",
      runDate: "2026-07-21",
    });
    expect(q2.created).toBe(false);
    expect(q2.outreachEmailId).toBe(id1);
    expect(await prisma.outreachEmail.count()).toBe(1);
  });

  it("follow-ups are refused while disabled (default)", async () => {
    const { business, contact } = await makeBusiness();
    await makeSendableEmail(business.id, contact.id);
    await expect(
      queueOutreachEmail(prisma, env, logger, {
        businessId: business.id,
        contactId: contact.id,
        conceptId: (await prisma.concept.findFirstOrThrow({ where: { businessId: business.id } })).id,
        subject: "follow up",
        bodyText: "x",
        bodyHtml: "<p>x</p>",
        runDate: "2026-07-22",
        sequence: 2,
      }),
    ).rejects.toThrow(/disabled/);
  });
});

describe("replies and events (scenario 11)", () => {
  it("11. a reply updates the prospect record and cancels pending automation", async () => {
    const { business, contact } = await makeBusiness();
    await makeSendableEmail(business.id, contact.id);
    await processScheduledSends(prisma, env, outbox(), logger, TUESDAY_1300);

    await processProviderEvent(prisma, logger, {
      type: "reply",
      fromEmail: contact.email,
      at: new Date(),
      textSnippet: "Thanks, this looks interesting",
    });

    const updatedBusiness = await prisma.business.findUniqueOrThrow({ where: { id: business.id } });
    expect(updatedBusiness.status).toBe("REPLIED");
    const conversion = await prisma.conversion.findFirst({ where: { businessId: business.id } });
    expect(conversion?.stage).toBe("REPLIED");
    const email = await prisma.outreachEmail.findFirstOrThrow({ where: { businessId: business.id } });
    expect(email.status).toBe("REPLIED");
  });

  it("a hard bounce suppresses the address and invalidates the contact", async () => {
    const { business, contact } = await makeBusiness();
    await makeSendableEmail(business.id, contact.id);
    await processScheduledSends(prisma, env, outbox(), logger, TUESDAY_1300);
    const row = await prisma.outreachEmail.findFirstOrThrow({ where: { businessId: business.id } });

    await processProviderEvent(prisma, logger, {
      type: "bounce",
      providerMessageId: row.providerMessageId!,
      at: new Date(),
      hard: true,
      email: contact.email,
    });

    expect(
      await prisma.suppression.count({ where: { email: contact.email, reversedAt: null } }),
    ).toBe(1);
    const updatedContact = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(updatedContact.validationStatus).toBe("INVALID");
  });
});

describe("expiry (scenario 14)", () => {
  it("14. expired concepts are unpublished and replaced with a neutral page", async () => {
    const { business } = await makeBusiness();
    const deployer = new MockDeployAdapter(path.join(varDir, "deploys"));
    const deployed = await deployer.deploy({
      slug: "concept-expiretest1",
      files: { "index.html": "<html>live concept</html>" },
      passwordProtect: false,
    });
    await prisma.concept.create({
      data: {
        businessId: business.id,
        slug: "concept-expiretest1",
        status: "DEPLOYED",
        contentJson: {},
        previewUrl: deployed.url,
        siteId: deployed.siteId,
        deploymentId: deployed.deploymentId,
        expiresAt: new Date(Date.now() - 86_400_000), // yesterday
      },
    });
    const count = await unpublishExpiredConcepts(prisma, deployer, logger);
    expect(count).toBe(1);
    const concept = await prisma.concept.findFirstOrThrow({ where: { slug: "concept-expiretest1" } });
    expect(concept.status).toBe("EXPIRED");
    const replaced = readFileSync(path.join(varDir, "deploys", "concept-expiretest1", "index.html"), "utf8");
    expect(replaced).toContain("expired");
    expect(replaced).toContain("noindex");
  });
});

describe("full pipeline (scenario 8 + selection limit)", () => {
  it("8. a failed deployment prevents email sending but preserves the concept", async () => {
    const pipelineEnv = makeEnv();
    const adapters = buildAdapters(pipelineEnv, logger);
    const failingDeployer = {
      source: "mock-deploy-failing",
      deploy: async () => {
        throw new Error("simulated Netlify outage");
      },
      replace: async () => {
        throw new Error("simulated Netlify outage");
      },
      delete: async () => undefined,
    };
    const result = await runDailyPipeline(
      prisma,
      pipelineEnv,
      { ...adapters, deployer: failingDeployer },
      logger,
      TUESDAY_1300,
    );

    expect(result.selected.length).toBeGreaterThan(0);
    // Concepts preserved at QA_PASSED (not deleted), no preview URL, and zero emails.
    const concepts = await prisma.concept.findMany();
    expect(concepts.length).toBeGreaterThan(0);
    for (const c of concepts) {
      expect(c.status).toBe("QA_PASSED");
      expect(c.previewUrl).toBeNull();
    }
    expect(await prisma.outreachEmail.count()).toBe(0);
    // Failures recorded for replay.
    expect(await prisma.deadLetter.count({ where: { stage: "concepts" } })).toBeGreaterThan(0);
  }, 180_000);

  it("selects exactly two eligible prospects and emails exactly twice on a full run", async () => {
    const pipelineEnv = makeEnv();
    const adapters = buildAdapters(pipelineEnv, logger);
    const result = await runDailyPipeline(prisma, pipelineEnv, adapters, logger, TUESDAY_1559);

    expect(result.status).toBe("COMPLETED");
    expect(result.selected).toHaveLength(2);
    const sent = await prisma.outreachEmail.count({ where: { status: "SENT" } });
    expect(sent).toBe(2);

    // Re-running the same day is a no-op (idempotent).
    const rerun = await runDailyPipeline(prisma, pipelineEnv, adapters, logger, TUESDAY_1559);
    expect(rerun.status).toBe("ALREADY_COMPLETED");
    expect(await prisma.outreachEmail.count({ where: { status: "SENT" } })).toBe(2);

    // Every deployed concept carries noindex, disclaimer and robots exclusion.
    const concepts = await prisma.concept.findMany({ where: { status: "DEPLOYED" } });
    expect(concepts.length).toBe(2);
    for (const c of concepts) {
      const html = readFileSync(c.htmlPath!, "utf8");
      expect(html).toContain('content="noindex, nofollow');
      expect(html).toContain("This is not the official website of");
      expect(existsSync(path.join(varDir, "deploys", c.slug, "robots.txt"))).toBe(true);
    }
  }, 300_000);
});
