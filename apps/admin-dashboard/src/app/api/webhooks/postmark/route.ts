import { NextRequest, NextResponse } from "next/server";
import { processProviderEvent } from "@ksp/email";
import { createLogger } from "@ksp/shared";
import { db, env } from "@/lib/db";

/**
 * Postmark webhook receiver (bounces, complaints, deliveries, inbound replies).
 * Authenticated with a shared token supplied as ?token= (configure the same value in
 * Postmark's webhook URL). Rejects everything when the token is unset.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const expected = env().POSTMARK_WEBHOOK_TOKEN;
  const provided = req.nextUrl.searchParams.get("token");
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  const logger = createLogger("info", { app: "webhook" });
  const body = (await req.json()) as Record<string, unknown>;
  const recordType = String(body.RecordType ?? "");
  const at = new Date();

  try {
    if (recordType === "Delivery") {
      await processProviderEvent(db(), logger, {
        type: "delivery",
        providerMessageId: String(body.MessageID),
        at,
      });
    } else if (recordType === "Bounce") {
      await processProviderEvent(db(), logger, {
        type: "bounce",
        providerMessageId: String(body.MessageID),
        at,
        hard: String(body.Type ?? "") === "HardBounce",
        email: String(body.Email ?? body.Recipient ?? ""),
      });
    } else if (recordType === "SpamComplaint") {
      await processProviderEvent(db(), logger, {
        type: "complaint",
        providerMessageId: String(body.MessageID),
        at,
        email: String(body.Email ?? ""),
      });
    } else if (recordType === "Inbound" || body.FromFull) {
      const from = (body.FromFull as { Email?: string } | undefined)?.Email ?? String(body.From ?? "");
      await processProviderEvent(db(), logger, {
        type: "reply",
        fromEmail: from,
        at,
        textSnippet: String(body.TextBody ?? "").slice(0, 500),
      });
    }
  } catch (err) {
    logger.error("webhook processing failed", { error: err instanceof Error ? err.message : "unknown" });
    return NextResponse.json({ error: "processing-failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
