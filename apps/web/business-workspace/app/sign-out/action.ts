"use server";

import { signOut } from "@workos-inc/authkit-nextjs";
import { isBusinessSignedOutUri } from "../auth-config";

/**
 * AuthKit clears the encrypted session cookie and returns only to the
 * separately allowlisted public Business Workspace signed-out route.
 */
export async function signOutAction(): Promise<void> {
  const returnTo = process.env["WORKOS_SIGN_OUT_REDIRECT_URI"];
  if (!isBusinessSignedOutUri(returnTo)) {
    throw new Error(
      "WORKOS_SIGN_OUT_REDIRECT_URI must be an allowlisted public Business Workspace signed-out URL.",
    );
  }

  await signOut({ returnTo });
}
