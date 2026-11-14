import { getSignInUrl } from "@workos-inc/authkit-nextjs";
import { NextResponse } from "next/server";
import { isBusinessCallbackUri } from "../auth-config";

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
  const callbackUri = process.env["NEXT_PUBLIC_WORKOS_REDIRECT_URI"];

  if (
    missing.length > 0 ||
    !cookiePasswordValid ||
    !isBusinessCallbackUri(callbackUri)
  ) {
    return NextResponse.json(
      {
        error:
          "Business Workspace authentication is not configured for this environment.",
      },
      { status: 503 },
    );
  }

  return NextResponse.redirect(await getSignInUrl());
}
