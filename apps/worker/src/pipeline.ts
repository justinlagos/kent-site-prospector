import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrismaClient, Prisma } from "@ksp/database";
import { withAdvisoryLock } from "@ksp/database";
import {
  Env,
  agencyIdentity,
  type GeneratedImage,
  isLondonWeekday,
  londonDateString,
  systemClock,
  type LondonClock,
  type Logger,
} from "@ksp/shared";
import { selectNextRotation, completeRotation, importDiscoveredBusinesses } from "@ksp/discovery";
import { classifyEmailType } from "@ksp/shared";
import { evaluateProspect } from "@ksp/compliance";
import { auditWebsite } from "@ksp/auditing";
import { scoreProspect, selectDailyPair } from "@ksp/scoring";
import { generateResearchBrief, type BriefSourceData, type ResearchBrief } from "@ksp/research";
import { getStrategy, generateLandingCopy, renderLandingPage } from "@ksp/content-generation";
import { generateConceptSlug, assertSlugNonDeceptive, runQaPipeline } from "@ksp/deployment";
import { buildConceptImagePlan, registerAsset } from "@ksp/asset-management";
import {
  generateOutreachEmail,
  auditEvidenceForEmail,
  queueOutreachEmail,
  processScheduledSends,
} from "@ksp/email";
import { buildDailyReport, renderDailyReportText } from "@ksp/analytics";
import type { Adapters } from "./adapters.js";

interface PipelineCtx {
  runId: string;
  runDate: string;
  scanId?: string;
  territoryId?: string;
  categoryId?: string;
  town?: string;
  outwardPostcode?: string;
  categoryLabel?: string;
  providerTypes?: string[];
  strategyKey?: string;
  importedIds?: string[];
  selectedIds?: string[];
  errors: string[];
}

/**
 * The weekday pipeline. Idempotent and resumable: one AutomationRun per (runDate, type);
 * each stage records completion + a detail payload, and a re-invocation skips completed
 * stages, rehydrating context from stored details. The whole run holds an advisory lock,
 * so concurrent invocations cannot double-process.
 */
export async function runDailyPipeline(
  prisma: PrismaClient,
  env: Env,
  adapters: Adapters,
  logger: Logger,
  clock: LondonClock = systemClock,
): Promise<{ status: string; selected: string[] }> {
  const now = clock.now();
  if (!isLondonWeekday(now)) {
    logger.info("daily pipeline skipped: weekend");
    return { status: "SKIPPED_WEEKEND", selected: [] };
  }
  const runDate = londonDateString(now);

  return withAdvisoryLock(
    prisma,
    `daily-run:${runDate}`,
    async () => {
    const run = await prisma.automationRun.upsert({
      where: { runDate_runType: { runDate, runType: "daily-pipeline" } },
      update: {},
      create: { runDate, runType: "daily-pipeline" },
      include: { stages: true },
    });
    if (run.status === "COMPLETED") {
      logger.info("daily pipeline already completed for date", { runDate });
      return { status: "ALREADY_COMPLETED", selected: (run.selectedBusinesses as string[]) ?? [] };
    }

    const ctx: PipelineCtx = { runId: run.id, runDate, errors: [] };

    // Rehydrate from completed stages (resume path).
    for (const s of run.stages.filter((s) => s.status === "COMPLETED")) {
      Object.assign(ctx, (s.detail as Record<string, unknown>) ?? {});
    }

    const stage = async <T extends Partial<PipelineCtx>>(
      name: string,
      fn: () => Promise<T>,
    ): Promise<boolean> => {
      const existing = await prisma.automationStage.findUnique({
        where: { runId_name: { runId: run.id, name } },
      });
      if (existing?.status === "COMPLETED") return true;
      const row = existing
        ? await prisma.automationStage.update({
            where: { id: existing.id },
            data: { status: "RUNNING", error: null, startedAt: new Date() },
          })
        : await prisma.automationStage.create({ data: { runId: run.id, name } });
      try {
        const detail = await fn();
        Object.assign(ctx, detail);
        await prisma.automationStage.update({
          where: { id: row.id },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            detail: JSON.parse(JSON.stringify(detail)) as Prisma.InputJsonValue,
          },
        });
        logger.info(`stage completed: ${name}`);
        return true;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        ctx.errors.push(`${name}: ${message}`);
        await prisma.automationStage.update({
          where: { id: row.id },
          data: { status: "FAILED", completedAt: new Date(), error: message.slice(0, 1000) },
        });
        await prisma.deadLetter.create({
          data: { runId: run.id, stage: name, payload: { runDate } as Prisma.InputJsonValue, error: message.slice(0, 2000) },
        });
        logger.error(`stage failed: ${name}`, { error: message });
        return false;
      }
    };

    // ------------------------------------------------------------------ stages
    const ok1 = await stage("select-territory", async () => {
      const sel = await selectNextRotation(prisma);
      if (!sel) throw new Error("Rotation queue is exhausted — add territories/categories");
      return {
        scanId: sel.scanId,
        territoryId: sel.territoryId,
        categoryId: sel.categoryId,
        town: sel.town,
        outwardPostcode: sel.outwardPostcode,
        categoryLabel: sel.categoryLabel,
        providerTypes: sel.providerTypes,
        strategyKey: sel.strategyKey,
      };
    });

    if (ok1) {
      await stage("discover", async () => {
        const discovered = await adapters.directory.search({
          town: ctx.town!,
          outwardPostcode: ctx.outwardPostcode!,
          categoryLabel: ctx.categoryLabel!,
          providerTypes: ctx.providerTypes!,
          maxResults: 20,
        });
        const imported = await importDiscoveredBusinesses(prisma, logger, {
          discovered,
          source: adapters.directory.source,
          territoryId: ctx.territoryId!,
          categoryId: ctx.categoryId!,
        });
        return { importedIds: imported.imported };
      });

      await stage("verify", async () => {
        for (const id of ctx.importedIds ?? []) {
          const business = await prisma.business.findUniqueOrThrow({
            where: { id },
            include: { contacts: true },
          });
          const match = await adapters.registry.findCompany(business.name, business.postcode);
          await prisma.business.update({
            where: { id },
            data: match
              ? {
                  legalName: match.legalName,
                  companyNumber: match.companyNumber,
                  legalForm: match.legalForm,
                  companyStatus: match.companyStatus,
                  confidence: match.matchConfidence,
                  status: "VERIFIED",
                  lastVerifiedAt: new Date(),
                }
              : { legalForm: "UNKNOWN", status: "VERIFIED", lastVerifiedAt: new Date() },
          });
          for (const contact of business.contacts) {
            const verdict = await adapters.emailValidation.validate(contact.email);
            await prisma.contact.update({
              where: { id: contact.id },
              data: {
                validationStatus:
                  verdict.verdict === "VALID" ? "VALID" : verdict.verdict === "INVALID" ? "INVALID" : "RISKY",
                validationDetail: verdict.detail ?? null,
                lastVerifiedAt: new Date(),
              },
            });
          }
        }
        return {};
      });

      await stage("audit", async () => {
        const varDir = path.resolve(env.VAR_DIR);
        for (const id of ctx.importedIds ?? []) {
          const existing = await prisma.websiteAudit.findFirst({ where: { businessId: id } });
          if (existing) continue; // idempotent resume
          const business = await prisma.business.findUniqueOrThrow({ where: { id } });
          const report = await auditWebsite(business.website, {
            logger: logger.child({ businessId: id }),
            screenshotDir: path.join(varDir, "screenshots", id, "current-site"),
          });
          await prisma.websiteAudit.create({
            data: {
              businessId: id,
              hasWebsite: report.findings.hasWebsite,
              robotsAllowed: report.findings.robotsAllowed,
              technicalScore: report.scores.technicalScore,
              designScore: report.scores.designScore,
              conversionScore: report.scores.conversionScore,
              contentScore: report.scores.contentScore,
              seoScore: report.scores.seoScore,
              trustScore: report.scores.trustScore,
              opportunityScore: report.scores.opportunityScore,
              findingsJson: JSON.parse(JSON.stringify(report.findings)) as Prisma.InputJsonValue,
              evidenceJson: JSON.parse(JSON.stringify(report.evidence)) as Prisma.InputJsonValue,
              screenshotPaths: report.screenshotPaths as Prisma.InputJsonValue,
            },
          });
          await prisma.business.update({ where: { id }, data: { status: "AUDITED" } });

          // Google Places does not supply email addresses. If the business publishes a
          // generic/role contact email on its OWN website, adopt it (source recorded as
          // business-website — already listed in the data-source register). Personal-name
          // addresses are never adopted for automated outreach, per policy.
          for (const email of report.findings.foundEmails.slice(0, 3)) {
            const type = classifyEmailType(email);
            if (type === "PERSONAL") continue;
            const existingContact = await prisma.contact.findUnique({
              where: { businessId_email: { businessId: id, email } },
            });
            if (existingContact) continue;
            const verdict = await adapters.emailValidation.validate(email);
            await prisma.contact.create({
              data: {
                businessId: id,
                email,
                emailType: type,
                validationStatus:
                  verdict.verdict === "VALID" ? "VALID" : verdict.verdict === "INVALID" ? "INVALID" : "RISKY",
                validationDetail: verdict.detail ?? null,
                source: "business-website",
                lastVerifiedAt: new Date(),
              },
            });
            if (!business.primaryEmail) {
              await prisma.business.update({ where: { id }, data: { primaryEmail: email } });
            }
            logger.info("adopted published business email", { businessId: id, type });
          }
        }
        return {};
      });

      await stage("score", async () => {
        for (const id of ctx.importedIds ?? []) {
          await scoreProspect(prisma, logger, id);
        }
        return {};
      });

      await stage("compliance-select", async () => {
        const notice = await prisma.policyDocument.findFirst({
          where: { key: "privacy-notice" },
          orderBy: { createdAt: "desc" },
        });
        for (const id of ctx.importedIds ?? []) {
          const latest = await prisma.prospectScore.findFirst({
            where: { businessId: id },
            orderBy: { calculatedAt: "desc" },
          });
          if (latest?.disqualified) continue;
          await evaluateProspect(prisma, logger, {
            businessId: id,
            privacyNoticeVersion: notice?.version ?? "unversioned",
          });
        }
        const minScoreSetting = await prisma.setting.findUnique({ where: { key: "minProspectScore" } });
        const minScore = typeof minScoreSetting?.value === "number" ? minScoreSetting.value : 60;
        const selectedIds = await selectDailyPair(prisma, logger, {
          candidateBusinessIds: ctx.importedIds ?? [],
          minScore,
        });
        await prisma.automationRun.update({
          where: { id: run.id },
          data: { selectedBusinesses: selectedIds },
        });
        return { selectedIds };
      });

      await stage("concepts", async () => {
        const agency = agencyIdentity(env);
        const varDir = path.resolve(env.VAR_DIR);
        const expirySetting = await prisma.setting.findUnique({ where: { key: "previewExpiryDays" } });
        const expiryDays = typeof expirySetting?.value === "number" ? expirySetting.value : env.PREVIEW_EXPIRY_DAYS;

        for (const businessId of ctx.selectedIds ?? []) {
          const existingConcept = await prisma.concept.findFirst({
            where: { businessId, status: { in: ["QA_PASSED", "DEPLOYED"] } },
          });
          if (existingConcept) continue; // resume

          try {
            const business = await prisma.business.findUniqueOrThrow({
              where: { id: businessId },
              include: { category: true, audits: { orderBy: { auditDate: "desc" }, take: 1 } },
            });
            const audit = business.audits[0];
            if (!audit) throw new Error("no audit for selected business");

            const src: BriefSourceData = {
              business: {
                id: business.id,
                name: business.name,
                town: business.town,
                address: business.address,
                postcode: business.postcode,
                phone: business.phone,
                primaryEmail: business.primaryEmail,
                website: business.website,
                reviewCount: business.reviewCount,
                reviewRating: business.reviewRating,
                openingHours: (business.openingHours as Record<string, string>) ?? null,
                categoryLabel: business.category.label,
                strategyKey: business.category.strategyKey,
                sourceUrl: business.sourceUrl,
              },
              auditFindings: audit.findingsJson as Record<string, unknown>,
              auditScores: {
                technicalScore: audit.technicalScore,
                designScore: audit.designScore,
                conversionScore: audit.conversionScore,
                contentScore: audit.contentScore,
                seoScore: audit.seoScore,
                trustScore: audit.trustScore,
                opportunityScore: audit.opportunityScore,
              },
            };

            const brief = await generateResearchBrief(adapters.llm, logger, src);
            const strategy = getStrategy(business.category.strategyKey);
            const copy = await generateLandingCopy(adapters.llm, logger, brief, strategy);

            const slug = generateConceptSlug();
            assertSlugNonDeceptive(slug, business.name);

            // Tailored illustrative imagery (never depicts the actual business).
            // Failure here degrades gracefully to placeholders — it never blocks the day.
            const imageFiles: Record<string, Buffer> = {};
            const images: Record<string, string> = {};
            if (adapters.imageGen) {
              const plan = buildConceptImagePlan(
                business.category.strategyKey,
                business.id,
                Math.min(brief.primaryServices.length || 1, 3),
              );
              for (const item of plan) {
                try {
                  const img: GeneratedImage = await adapters.imageGen.generate({
                    prompt: item.prompt,
                    width: item.width,
                    height: item.height,
                    seed: item.seed,
                  });
                  const rel = `assets/${item.key}.${img.ext}`;
                  imageFiles[rel] = img.data;
                  images[item.key] = rel;
                  await registerAsset(prisma, {
                    businessId: business.id,
                    source: `image-gen:${img.provider}`,
                    requestedStatus: "GENERATED",
                    intendedUse: `concept ${item.key} image`,
                    localPath: rel,
                  });
                } catch (imgErr) {
                  logger.warn("image generation failed; using placeholder", {
                    key: item.key,
                    error: imgErr instanceof Error ? imgErr.message.slice(0, 150) : "unknown",
                  });
                }
              }
            }

            const files: Record<string, string | Buffer> = {
              ...renderLandingPage({ brief, copy, strategy, agency, slug, images }),
              ...imageFiles,
            };

            const htmlDir = path.join(varDir, "concepts", businessId);
            await mkdir(htmlDir, { recursive: true });
            const htmlPath = path.join(htmlDir, "index.html");
            await writeFile(htmlPath, files["index.html"]! as string);

            const qa = await runQaPipeline(prisma, logger, {
              businessId,
              files,
              brief,
              agency,
              screenshotDir: path.join(varDir, "screenshots", businessId, "concept"),
              otherBusinessIds: ctx.selectedIds ?? [],
            });

            const concept = await prisma.concept.create({
              data: {
                businessId,
                slug,
                status: qa.passed ? "QA_PASSED" : "QA_FAILED",
                contentJson: JSON.parse(JSON.stringify({ brief, copy, strategyKey: strategy.key })) as Prisma.InputJsonValue,
                htmlPath,
                screenshots: qa.screenshotPaths as Prisma.InputJsonValue,
                qaResults: JSON.parse(JSON.stringify(qa.checks)) as Prisma.InputJsonValue,
                expiresAt: new Date(Date.now() + expiryDays * 86_400_000),
              },
            });

            if (!qa.passed) {
              ctx.errors.push(`QA failed for ${business.name}: ${qa.checks.filter((c) => !c.passed).map((c) => c.name).join(", ")}`);
              continue; // no deploy, no email — by design
            }

            const deployed = await adapters.deployer.deploy({
              slug,
              files,
              passwordProtect: true,
            });
            await prisma.concept.update({
              where: { id: concept.id },
              data: {
                status: "DEPLOYED",
                previewUrl: deployed.url,
                deploymentId: deployed.deploymentId,
                siteId: deployed.siteId,
                buildLogs: deployed.logs.slice(0, 5000),
                deployedAt: new Date(),
              },
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            ctx.errors.push(`concept for ${businessId}: ${message}`);
            await prisma.deadLetter.create({
              data: {
                runId: run.id,
                stage: "concepts",
                payload: { businessId } as Prisma.InputJsonValue,
                error: message.slice(0, 2000),
              },
            });
          }
        }
        return {};
      });

      await stage("queue-emails", async () => {
        for (const businessId of ctx.selectedIds ?? []) {
          const concept = await prisma.concept.findFirst({
            where: { businessId, status: "DEPLOYED" },
            orderBy: { createdAt: "desc" },
          });
          if (!concept?.previewUrl) continue; // deployment failed => no email, concept preserved

          const business = await prisma.business.findUniqueOrThrow({
            where: { id: businessId },
            include: {
              category: true,
              contacts: true,
              audits: { orderBy: { auditDate: "desc" }, take: 1 },
            },
          });
          const contact = business.contacts.find(
            (c) => c.validationStatus === "VALID" && c.emailType === "GENERIC",
          ) ?? business.contacts.find((c) => c.validationStatus === "VALID" && c.emailType === "ROLE");
          if (!contact) continue;

          const content = concept.contentJson as { brief: ResearchBrief };
          const evidence = auditEvidenceForEmail(
            (business.audits[0]?.findingsJson as Record<string, unknown>) ?? {},
            { reviewCount: business.reviewCount, reviewRating: business.reviewRating },
          );
          const agency = agencyIdentity(env);
          const unsubscribePlaceholder = `${env.DASHBOARD_BASE_URL}/api/unsubscribe?token=__TOKEN__`;

          const generated = await generateOutreachEmail(adapters.llm, logger, {
            brief: content.brief,
            businessName: business.name,
            town: business.town,
            categoryLabel: business.category.label,
            previewUrl: concept.previewUrl,
            unsubscribeUrl: unsubscribePlaceholder,
            agency,
            positiveSignals: evidence.positiveSignals,
            objectiveWeaknesses: evidence.objectiveWeaknesses,
          });

          const queued = await queueOutreachEmail(prisma, env, logger, {
            businessId,
            contactId: contact.id,
            conceptId: concept.id,
            subject: generated.subject,
            bodyText: generated.bodyText,
            bodyHtml: generated.bodyHtml,
            runDate: ctx.runDate,
          });

          // Substitute the real signed token now the row (and its token) exists.
          const row = await prisma.outreachEmail.findUniqueOrThrow({ where: { id: queued.outreachEmailId } });
          if (row.unsubscribeToken && row.bodyText.includes("__TOKEN__")) {
            await prisma.outreachEmail.update({
              where: { id: row.id },
              data: {
                bodyText: row.bodyText.replaceAll("__TOKEN__", encodeURIComponent(row.unsubscribeToken)),
                bodyHtml: row.bodyHtml?.replaceAll("__TOKEN__", encodeURIComponent(row.unsubscribeToken)) ?? null,
              },
            });
          }
        }
        return {};
      });

      await stage("send-cycle", async () => {
        await processScheduledSends(prisma, env, adapters.emailProvider, logger, clock);
        return {};
      });

      await stage("finish-rotation", async () => {
        if (ctx.scanId) {
          await completeRotation(prisma, ctx.scanId, {
            discovered: ctx.importedIds?.length ?? 0,
            qualified: ctx.selectedIds?.length ?? 0,
            contacted: 0,
          });
        }
        return {};
      });
    }

    await stage("report", async () => {
      const report = await buildDailyReport(prisma, runDate);
      const varDir = path.resolve(env.VAR_DIR);
      await mkdir(path.join(varDir, "reports"), { recursive: true });
      await writeFile(
        path.join(varDir, "reports", `daily-${runDate}.json`),
        JSON.stringify(report, null, 2),
      );
      await writeFile(path.join(varDir, "reports", `daily-${runDate}.txt`), renderDailyReportText(report));
      return {};
    });

    const stages = await prisma.automationStage.findMany({ where: { runId: run.id } });
    const anyFailed = stages.some((s) => s.status === "FAILED");
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status: anyFailed ? "PARTIAL" : "COMPLETED",
        completedAt: new Date(),
        errors: ctx.errors as Prisma.InputJsonValue,
      },
    });

    return { status: anyFailed ? "PARTIAL" : "COMPLETED", selected: ctx.selectedIds ?? [] };
    },
    { timeoutMs: 4 * 3600_000 }, // real runs include ~20 Playwright audits
  );
}
