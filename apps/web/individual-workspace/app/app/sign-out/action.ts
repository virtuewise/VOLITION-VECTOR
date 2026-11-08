"use server";

import { signOut } from "@workos-inc/authkit-nextjs";

/**
 * AuthKit clears the encrypted session cookie and redirects to the WorkOS
 * application's configured sign-out URI. An explicit return target is used
 * only when the deployment has separately allowlisted it in WorkOS.
 */
export async function signOutAction(): Promise<void> {
  const returnTo = process.env["WORKOS_SIGN_OUT_REDIRECT_URI"];
  if (returnTo) {
    await signOut({ returnTo });
    return;
  }
  await signOut();
}
