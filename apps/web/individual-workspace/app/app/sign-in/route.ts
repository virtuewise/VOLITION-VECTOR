import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

export async function GET() {
  const required = [
    "WORKOS_CLIENT_ID",
    "WORKOS_ISSUER",
    "WORKOS_COOKIE_PASSWORD",
    "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
  ] as const;
  const missing = required.filter((name) => !process.env[name]);
  const cookiePassword = process.env["WORKOS_COOKIE_PASSWORD"];
  const cookiePasswordValid = Boolean(
    cookiePassword && cookiePassword.length >= 32,
  );

  if (missing.length > 0 || !cookiePasswordValid) {
    return NextResponse.json(
      { error: "Authentication is not configured for this environment." },
      { status: 503 },
    );
  }

  return NextResponse.redirect(await getSignInUrl());
}
