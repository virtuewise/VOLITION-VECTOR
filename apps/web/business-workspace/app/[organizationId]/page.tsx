import { withAuth } from "@workos-inc/authkit-nextjs";
import { notFound } from "next/navigation";
import { signOutAction } from "../sign-out/action";
import {
  getApiOrigin,
  loadOrganizationProfile,
  loadOrganizations,
} from "../workspace-api";

interface OrganizationPageProps {
  readonly params: Promise<{ readonly organizationId: string }>;
}

function formatDate(value: string | null): string {
  if (!value) return "Not updated yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
  }).format(date);
}

export default async function OrganizationPage({
  params,
}: OrganizationPageProps) {
  const { organizationId } = await params;
  const { user, accessToken } = await withAuth({ ensureSignedIn: true });
  if (!accessToken) {
    throw new Error("A verified AuthKit access token is required.");
  }

  const apiOrigin = getApiOrigin();
  const organizations = await loadOrganizations(apiOrigin, accessToken);
  if (organizations.status === "ready") {
    const organization = organizations.value.find(
      (entry) =>
        entry.organizationId.toLowerCase() === organizationId.toLowerCase(),
    );
    if (!organization) notFound();

    const profile = await loadOrganizationProfile(
      apiOrigin,
      accessToken,
      organization.organizationId,
    );

    return (
      <main className="workspace">
        <header className="topbar">
          <a className="wordmark" href="/business/">
            VOLITION <span>VECTOR</span>
          </a>
          <nav aria-label="Workspace navigation">
            <a href="/business/">All organizations</a>
            <a href="/app/">Individual Workspace</a>
            <form action={signOutAction}>
              <button className="sign-out" type="submit">
                Sign out
              </button>
            </form>
          </nav>
        </header>

        <section className="welcome compact-welcome">
          <p className="eyebrow">BUSINESS WORKSPACE</p>
          <h1>{organization.name}</h1>
          <p>
            Your active membership is verified for this organization. Tenant
            resources remain protected by the API on every request.
          </p>
          <div className="identity-line">
            <span className="avatar" aria-hidden="true">
              {(user.firstName?.[0] ?? user.email?.[0] ?? "V").toUpperCase()}
            </span>
            <span>
              <strong>{user.email ?? "Signed-in account"}</strong>
              <small>{organization.role} access · {organization.slug}</small>
            </span>
          </div>
        </section>

        <section className="profile-section" aria-labelledby="profile-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">ORGANIZATION FOUNDATION</p>
              <h2 id="profile-heading">Business profile</h2>
            </div>
            <a className="text-link" href="/business/">
              Change organization
            </a>
          </div>

          {profile.status === "ready" ? (
            <div className="profile-grid">
              <article className="profile-card profile-description">
                <p className="eyebrow">ABOUT THE ORGANIZATION</p>
                <p>
                  {profile.value.description ??
                    "No organization description has been added yet."}
                </p>
                {profile.value.websiteUrl ? (
                  <a
                    href={profile.value.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Visit organization website <span aria-hidden="true">↗</span>
                  </a>
                ) : null}
              </article>
              <article className="profile-card">
                <p className="eyebrow">ORGANIZATION DETAILS</p>
                <dl>
                  <div>
                    <dt>Country</dt>
                    <dd>{profile.value.countryCode ?? "Not set"}</dd>
                  </div>
                  <div>
                    <dt>Language</dt>
                    <dd>{profile.value.locale}</dd>
                  </div>
                  <div>
                    <dt>Time zone</dt>
                    <dd>{profile.value.timeZone}</dd>
                  </div>
                  <div>
                    <dt>Profile updated</dt>
                    <dd>{formatDate(profile.value.updatedAt)}</dd>
                  </div>
                </dl>
              </article>
            </div>
          ) : (
            <div className="state-panel" role="status">
              <h3>Business profile is not available yet.</h3>
              <p>
                Your organization membership is verified, but the private
                organization profile service is not available in this
                environment. No profile details are invented or inferred.
              </p>
            </div>
          )}
        </section>

        <section className="coming-next">
          <p className="eyebrow">WORKSPACE SERVICES</p>
          <h2>Your organization is connected.</h2>
          <p>
            Team administration, projects, service listings, opportunities,
            conversations and financial workflows will appear here as their
            tenant-scoped APIs complete their security and review gates.
          </p>
        </section>

        <footer className="footer">
          <span>VOLITION VECTOR</span>
          <span>Capability. Trust. Fair access. Measurable outcomes.</span>
        </footer>
      </main>
    );
  }

  return (
    <main className="workspace">
      <header className="topbar">
        <a className="wordmark" href="/business/">
          VOLITION <span>VECTOR</span>
        </a>
        <nav aria-label="Workspace navigation">
          <a href="/app/">Individual Workspace</a>
          <form action={signOutAction}>
            <button className="sign-out" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </header>
      <div className="state-panel standalone-state" role="status">
        <h1>Organization access is unavailable.</h1>
        <p>
          The account organization service could not be reached. No tenant has
          been selected. Please retry after the service is restored.
        </p>
        <a className="text-link" href="/business/">
          Return to organization selection
        </a>
      </div>
    </main>
  );
}
