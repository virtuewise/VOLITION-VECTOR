import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";

export async function GET() {
  const required = [
    "WORKOS_CLIENT_ID",
    "WORKOS_COOKIE_PASSWORD",
    "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
  ] as const;
  const missing = required.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Authentication is not configured for this environment." },
      { status: 503 },
    );
  }

  return NextResponse.redirect(await getSignInUrl());
}
