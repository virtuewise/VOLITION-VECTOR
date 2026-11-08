import { withAuth } from "@workos-inc/authkit-nextjs";
import { signOutAction } from "./sign-out/action";

export default async function HomePage() {
  // The Individual Workspace root is an authenticated workspace surface.
  // Public authentication endpoints live at /app/sign-in and /app/callback;
  // never render workspace content when the AuthKit session is absent.
  const { user } = await withAuth({ ensureSignedIn: true });

  return (
    <main className="shell">
      <p className="eyebrow">VOLITION VECTOR · INDIVIDUAL WORKSPACE</p>
      <h1>Discover your direction.</h1>
      <p>One ecosystem for capability, trusted connections and opportunity.</p>
      <p>Signed in as {user.email ?? "your WorkOS account"}.</p>
      <form action={signOutAction}>
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
