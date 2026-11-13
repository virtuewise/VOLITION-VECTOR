"use server";

import { signOut } from "@workos-inc/authkit-nextjs";

/**
 * AuthKit clears the encrypted session cookie and redirects to the WorkOS
 * application's configured sign-out URI.
 */
export async function signOutAction(): Promise<void> {
  const returnTo = process.env["WORKOS_SIGN_OUT_REDIRECT_URI"];
  if (returnTo) {
    await signOut({ returnTo });
    return;
  }
  await signOut();
}
