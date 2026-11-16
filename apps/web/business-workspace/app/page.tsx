import { withAuth } from "@workos-inc/authkit-nextjs";
import Link from "next/link";
import { signOutAction } from "./sign-out/action";
import { getApiOrigin, loadOrganizations } from "./workspace-api";

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default async function HomePage() {
  const { user, accessToken } = await withAuth({ ensureSignedIn: true });
  if (!accessToken) {
    throw new Error("A verified AuthKit access token is required.");
  }

  const organizations = await loadOrganizations(getApiOrigin(), accessToken);
  const firstName = user.firstName?.trim();

  return (
    <main className="workspace">
      <header className="topbar">
        <Link
          className="wordmark"
          href="/"
          aria-label="Volition Vector Business Workspace"
        >
          VOLITION <span>VECTOR</span>
        </Link>
        <nav aria-label="Workspace navigation">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/app/">Individual Workspace</a>
          <form action={signOutAction}>
            <button className="sign-out" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <section className="welcome">
        <p className="eyebrow">YOUR BUSINESS WORKSPACE</p>
        <h1>Welcome{firstName ? ", " + firstName : ""}.</h1>
        <p>
          Select an organization where you hold active membership. Access is
          resolved from your verified VOLITION VECTOR account, not from a
          browser-supplied tenant claim.
        </p>
        <div className="identity-line">
          <span className="avatar" aria-hidden="true">
            {(firstName?.[0] ?? user.email?.[0] ?? "V").toUpperCase()}
          </span>
          <span>
            <strong>{user.email ?? "Signed-in account"}</strong>
            <small>Authenticated with WorkOS</small>
          </span>
        </div>
      </section>

      <section
        className="organization-section"
        aria-labelledby="organizations-heading"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">YOUR ORGANIZATIONS</p>
            <h2 id="organizations-heading">Choose a workspace</h2>
          </div>
          {organizations.status === "ready" ? (
            <span className="count">
              {organizations.value.length} active{" "}
              {organizations.value.length === 1
                ? "organization"
                : "organizations"}
            </span>
          ) : null}
        </div>

        {organizations.status === "unavailable" ? (
          <div className="state-panel" role="status">
            <h3>Organization access is not available yet.</h3>
            <p>
              The organization discovery service could not be reached or did not
              return a valid response. Your sign-in is intact. No tenant has
              been selected and no organization data has been fabricated.
            </p>
            <Link className="text-link" href="/">
              Try again
            </Link>
          </div>
        ) : organizations.value.length === 0 ? (
          <div className="state-panel">
            <h3>No active business workspace memberships.</h3>
            <p>
              This account is not currently associated with an active
              organization. An organization owner or administrator must
              establish membership before business data can be accessed.
            </p>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a className="text-link" href="/app/">
              Return to your Individual Workspace
            </a>
          </div>
        ) : (
          <div className="organization-grid">
            {organizations.value.map((organization) => (
              <article
                className="organization-card"
                key={organization.organizationId}
              >
                <div className="card-mark" aria-hidden="true">
                  {organization.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="organization-copy">
                  <p className="eyebrow">ACTIVE MEMBERSHIP</p>
                  <h3>{organization.name}</h3>
                  <p className="slug">{organization.slug}</p>
                  <span className="role">{roleLabel(organization.role)}</span>
                </div>
                <Link
                  className="open-link"
                  href={"/" + encodeURIComponent(organization.organizationId)}
                  aria-label={"Open " + organization.name + " workspace"}
                >
                  Open workspace <span aria-hidden="true">↗</span>
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="footer">
        <span>VOLITION VECTOR</span>
        <span>Capability. Trust. Fair access. Measurable outcomes.</span>
      </footer>
    </main>
  );
}
