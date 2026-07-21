import { NextRequest, NextResponse } from "next/server";
import { handleUnsubscribe } from "@ksp/email";
import { createLogger } from "@ksp/shared";
import { db, env } from "@/lib/db";

/**
 * One-click unsubscribe. GET renders a confirmation page and immediately honours the
 * opt-out (no extra clicks); POST supports RFC 8058 List-Unsubscribe=One-Click.
 * No authentication — the HMAC token IS the authorisation.
 */

async function process(token: string | null): Promise<NextResponse> {
  if (!token) return page("Invalid link", "This opt-out link is incomplete.", 400);
  const result = await handleUnsubscribe(db(), createLogger("info", { app: "unsubscribe" }), env().UNSUBSCRIBE_HMAC_SECRET, token);
  if (!result.ok) return page("Invalid link", "This opt-out link is invalid or has been tampered with.", 400);
  return page(
    "You're opted out",
    "Your address has been permanently removed from our outreach. You will not hear from us again. No further action is needed.",
    200,
  );
}

function page(title: string, body: string, status: number): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex, nofollow"/><title>${title}</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a}main{max-width:26rem;padding:2rem;text-align:center}</style></head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return process(req.nextUrl.searchParams.get("token"));
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return process(req.nextUrl.searchParams.get("token"));
}
