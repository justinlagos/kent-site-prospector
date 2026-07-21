import { loadEnv, createLogger } from "@ksp/shared";
import { getPrisma, disconnectPrisma } from "@ksp/database";
import { buildAdapters } from "./adapters.js";
import { runDailyPipeline } from "./pipeline.js";
import { runHourlyEvents } from "./hourly.js";

/**
 * Worker CLI.
 *   node dist/main.js --job daily    # full weekday pipeline (idempotent, resumable)
 *   node dist/main.js --job hourly   # sends due emails, expiry, retention, weekly report
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL, { app: "worker" });
  const prisma = getPrisma(env.DATABASE_URL);
  const adapters = buildAdapters(env, logger);

  const jobIndex = process.argv.indexOf("--job");
  const job = jobIndex >= 0 ? process.argv[jobIndex + 1] : "daily";

  logger.info("worker starting", { job, appEnv: env.APP_ENV });

  try {
    if (job === "daily") {
      const result = await runDailyPipeline(prisma, env, adapters, logger);
      logger.info("daily pipeline finished", { ...result });
    } else if (job === "hourly") {
      await runHourlyEvents(prisma, env, adapters, logger);
      logger.info("hourly events finished");
    } else {
      throw new Error(`Unknown job: ${job}. Use --job daily | hourly`);
    }
  } finally {
    await disconnectPrisma();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
