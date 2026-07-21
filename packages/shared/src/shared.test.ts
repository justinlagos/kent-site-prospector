import { describe, expect, it } from "vitest";
import {
  classifyEmailType,
  dedupFingerprint,
  normaliseName,
  outreachIdempotencyKey,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./util.js";
import { isLondonWeekday, isWithinLondonHours, londonDateString, pickSendTime } from "./time.js";
import { RetryableError, FatalError, withRetry } from "./errors.js";
import { loadEnv, sendingAllowed, ConfigError } from "./config.js";

const BASE_ENV = {
  DATABASE_URL: "postgresql://x:y@localhost:5432/db",
};

describe("util", () => {
  it("normalises names for dedup", () => {
    expect(normaliseName("The Oakwood Dental Co. Ltd")).toBe("oakwood dental");
    expect(dedupFingerprint("Oakwood Dental Ltd", "ME14 5AB")).toBe(
      dedupFingerprint("OAKWOOD DENTAL LIMITED", "me14 9zz"),
    );
    expect(dedupFingerprint("Oakwood Dental", "ME14 5AB")).not.toBe(
      dedupFingerprint("Riverside Dental", "ME14 5AB"),
    );
  });

  it("classifies email types conservatively", () => {
    expect(classifyEmailType("info@biz.co.uk")).toBe("GENERIC");
    expect(classifyEmailType("bookings@biz.co.uk")).toBe("GENERIC");
    expect(classifyEmailType("jane.smith@biz.co.uk")).toBe("PERSONAL");
    expect(classifyEmailType("sarah@biz.co.uk")).toBe("PERSONAL");
    expect(classifyEmailType("accounts@biz.co.uk")).toBe("ROLE");
  });

  it("signs and verifies unsubscribe tokens; rejects tampering", () => {
    const secret = "0123456789012345678901234567890123456789";
    const token = signUnsubscribeToken(secret, "info@biz.co.uk", "biz_1");
    expect(verifyUnsubscribeToken(secret, token)).toEqual({ email: "info@biz.co.uk", businessId: "biz_1" });
    expect(verifyUnsubscribeToken(secret, token.slice(0, -2) + "xx")).toBeNull();
    expect(verifyUnsubscribeToken("different-secret-0123456789012345678", token)).toBeNull();
    expect(verifyUnsubscribeToken(secret, "garbage")).toBeNull();
  });

  it("produces deterministic idempotency keys", () => {
    expect(outreachIdempotencyKey("b1", "c1", 1)).toBe(outreachIdempotencyKey("b1", "c1", 1));
    expect(outreachIdempotencyKey("b1", "c1", 1)).not.toBe(outreachIdempotencyKey("b1", "c1", 2));
  });
});

describe("london time", () => {
  it("detects weekends in Europe/London", () => {
    expect(isLondonWeekday(new Date("2026-07-21T12:00:00Z"))).toBe(true); // Tuesday
    expect(isLondonWeekday(new Date("2026-07-25T12:00:00Z"))).toBe(false); // Saturday
    expect(isLondonWeekday(new Date("2026-07-26T12:00:00Z"))).toBe(false); // Sunday
  });

  it("evaluates business-hours windows in London wall clock (BST)", () => {
    // 09:30 UTC = 10:30 BST
    expect(isWithinLondonHours(new Date("2026-07-21T09:30:00Z"), 10, 15)).toBe(true);
    // 08:30 UTC = 09:30 BST — before window
    expect(isWithinLondonHours(new Date("2026-07-21T08:30:00Z"), 10, 15)).toBe(false);
    // 15:30 UTC = 16:30 BST — after inclusive end hour 15
    expect(isWithinLondonHours(new Date("2026-07-21T15:30:00Z"), 10, 15)).toBe(false);
  });

  it("computes the London run date across midnight", () => {
    // 23:30 UTC on the 21st is 00:30 on the 22nd in BST
    expect(londonDateString(new Date("2026-07-21T23:30:00Z"))).toBe("2026-07-22");
  });

  it("picks deterministic send times inside the window", () => {
    const a = pickSendTime("2026-07-21", 10, 15, "seed-a");
    const b = pickSendTime("2026-07-21", 10, 15, "seed-a");
    expect(a).toEqual(b);
    expect(a.hour).toBeGreaterThanOrEqual(10);
    expect(a.hour).toBeLessThanOrEqual(15);
  });
});

describe("withRetry", () => {
  it("retries retryable errors then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls += 1;
        if (calls < 3) throw new RetryableError("X", "transient");
        return "ok";
      },
      { sleep: async () => undefined },
    );
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("never retries fatal errors", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls += 1;
          throw new FatalError("X", "permanent");
        },
        { sleep: async () => undefined },
      ),
    ).rejects.toThrow("permanent");
    expect(calls).toBe(1);
  });
});

describe("config safety locks", () => {
  it("refuses production with mock adapters", () => {
    expect(() => loadEnv({ ...BASE_ENV, APP_ENV: "production" } as never)).toThrow(ConfigError);
  });

  it("requires credentials when an adapter is real", () => {
    expect(() => loadEnv({ ...BASE_ENV, EMAIL_PROVIDER_ADAPTER: "real" } as never)).toThrow(
      /POSTMARK_SERVER_TOKEN/,
    );
  });

  it("blocks sending by default (dry run) and via kill switch", () => {
    const env = loadEnv(BASE_ENV as never);
    expect(sendingAllowed(env).allowed).toBe(false);
    const withKill = loadEnv({ ...BASE_ENV, EMAIL_KILL_SWITCH: "true", EMAIL_DRY_RUN: "false" } as never);
    expect(sendingAllowed(withKill).reason).toContain("KILL_SWITCH");
  });

  it("blocks sending without domain authentication or agency identity", () => {
    const env = loadEnv({
      ...BASE_ENV,
      EMAIL_DRY_RUN: "false",
      EMAIL_PROVIDER_ADAPTER: "real",
      POSTMARK_SERVER_TOKEN: "token",
    } as never);
    expect(sendingAllowed(env).allowed).toBe(false);
    expect(sendingAllowed(env).reason).toContain("agency identity");
  });
});
