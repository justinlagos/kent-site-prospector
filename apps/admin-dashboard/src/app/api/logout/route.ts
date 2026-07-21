import { NextRequest, NextResponse } from "next/server";
import { sessionCookieOptions } from "@/lib/session";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const res = NextResponse.redirect(new URL("/login", req.url), 303);
  res.cookies.set(sessionCookieOptions().name, "", { maxAge: 0, path: "/" });
  return res;
}
