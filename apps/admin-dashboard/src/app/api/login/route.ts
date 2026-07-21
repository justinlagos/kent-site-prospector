import { NextRequest, NextResponse } from "next/server";
import { attemptLogin, loginRateLimited, sessionCookieOptions, signSession } from "@/lib/session";
import { db } from "@/lib/db";
import { audit } from "@ksp/database";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").toLowerCase();
  const password = String(form.get("password") ?? "");
  const ip = req.headers.get("x-forwarded-for") ?? "local";

  if (loginRateLimited(`${ip}:${email}`)) {
    return NextResponse.redirect(new URL("/login?error=rate-limited", req.url), 303);
  }
  const session = await attemptLogin(email, password);
  if (!session) {
    return NextResponse.redirect(new URL("/login?error=invalid", req.url), 303);
  }
  await audit(db(), email, "auth.login", "AdminUser");
  const res = NextResponse.redirect(new URL("/", req.url), 303);
  const opts = sessionCookieOptions();
  res.cookies.set(opts.name, signSession(session), opts);
  return res;
}
