import Link from "next/link";
import { withAuth } from "@workos-inc/authkit-nextjs";
import { signOutAction } from "./sign-out/action";

export default async function HomePage() {
  const authConfigured =
    Boolean(process.env["WORKOS_CLIENT_ID"]) &&
    Boolean(process.env["WORKOS_COOKIE_PASSWORD"]) &&
    Boolean(process.env["NEXT_PUBLIC_WORKOS_REDIRECT_URI"]);
  const { user } = authConfigured ? await withAuth() : { user: null };

  return (
    <main className="shell">
      <p className="eyebrow">VOLITION VECTOR · INDIVIDUAL WORKSPACE</p>
      <h1>Discover your direction.</h1>
      <p>One ecosystem for capability, trusted connections and opportunity.</p>
      {user ? (
        <>
          <p>Signed in as {user.email ?? "your WorkOS account"}.</p>
          <form action={signOutAction}>
            <button type="submit">Sign out</button>
          </form>
        </>
      ) : (
        <p>
          <Link href="/sign-in">Sign in securely</Link>
        </p>
      )}
    </main>
  );
}
