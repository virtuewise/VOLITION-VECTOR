import { withAuth } from "@workos-inc/authkit-nextjs";
import { signOutAction } from "./sign-out/action";
import {
  formatDate,
  humanize,
  isAccountProfile,
  isApplicationList,
  statusClass,
} from "./dashboard-data";

type LoadResult<T> =
  | { readonly status: "ready"; readonly value: T }
  | { readonly status: "unavailable" };

function getApiOrigin(): string | null {
  const configured =
    process.env["VOLITION_API_URL"] ?? process.env["WEB_ORIGIN"];
  if (!configured) return null;

  try {
    const url = new URL(configured);
    const secure = url.protocol === "https:";
    const local =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    return secure || local ? url.origin : null;
  } catch {
    return null;
  }
}

async function loadPrivateResource<T>(
  origin: string | null,
  path: string,
  accessToken: string,
  isValid: (value: unknown) => value is T,
): Promise<LoadResult<T>> {
  if (!origin) return { status: "unavailable" };

  try {
    const response = await fetch(origin + path, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        authorization: "Bearer " + accessToken,
      },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) return { status: "unavailable" };
    const value: unknown = await response.json();
    return isValid(value)
      ? { status: "ready", value }
      : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

export default async function HomePage() {
  const { user, accessToken } = await withAuth({ ensureSignedIn: true });
  if (!accessToken) {
    throw new Error("A verified AuthKit access token is required.");
  }

  const apiOrigin = getApiOrigin();
  const [profile, applications] = await Promise.all([
    loadPrivateResource(
      apiOrigin,
      "/v1/me/profile",
      accessToken,
      isAccountProfile,
    ),
    loadPrivateResource(
      apiOrigin,
      "/v1/me/opportunity-applications?limit=10&offset=0",
      accessToken,
      isApplicationList,
    ),
  ]);

  const displayName =
    profile.status === "ready" && profile.value.displayName
      ? profile.value.displayName
      : (user.firstName ?? "Your workspace");

  return (
    <main className="workspace">
      <header className="topbar">
        <a className="wordmark" href="/app/">
          VOLITION <span>VECTOR</span>
        </a>
        <nav aria-label="Workspace navigation">
          <a href="/marketplace/">Discover opportunities</a>
          <form action={signOutAction}>
            <button className="sign-out" type="submit">
              Sign out
            </button>
          </form>
        </nav>
      </header>

      <section className="welcome">
        <p className="eyebrow">YOUR INDIVIDUAL WORKSPACE</p>
        <h1>Welcome{displayName ? ", " + displayName : ""}.</h1>
        <p>
          Build your profile, follow your applications and discover the next
          opportunity that matches your capabilities.
        </p>
        <div className="identity-line">
          <span className="avatar" aria-hidden="true">
            {(user.firstName?.[0] ?? user.email?.[0] ?? "V").toUpperCase()}
          </span>
          <span>
            <strong>{user.email ?? "Signed-in account"}</strong>
            <small>Authenticated with WorkOS</small>
          </span>
        </div>
      </section>

      <section className="dashboard-grid" aria-label="Your workspace">
        <article className="panel profile-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">YOUR FOUNDATION</p>
              <h2>Personal profile</h2>
            </div>
            <span className="panel-icon" aria-hidden="true">
              01
            </span>
          </div>
          {profile.status === "ready" ? (
            <dl className="profile-fields">
              <div>
                <dt>Display name</dt>
                <dd>{profile.value.displayName ?? "Not set yet"}</dd>
              </div>
              <div>
                <dt>Language</dt>
                <dd>{profile.value.locale}</dd>
              </div>
              <div>
                <dt>Time zone</dt>
                <dd>{profile.value.timeZone}</dd>
              </div>
            </dl>
          ) : (
            <p className="panel-message">
              Your private profile service is not available in this environment
              yet. Your account remains signed in; no profile data is
              fabricated.
            </p>
          )}
          <p className="panel-footnote">
            Private account details are visible only to you and authorized
            application services.
          </p>
        </article>

        <article className="panel applications-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">YOUR PROGRESS</p>
              <h2>Opportunity applications</h2>
            </div>
            <span className="panel-icon" aria-hidden="true">
              02
            </span>
          </div>
          {applications.status === "ready" ? (
            applications.value.length ? (
              <ul className="application-list">
                {applications.value.map((application) => (
                  <li key={application.id}>
                    <div>
                      <strong>{application.opportunityTitle}</strong>
                      <span>
                        {humanize(application.opportunityType)} · Submitted{" "}
                        {formatDate(application.submittedAt)}
                      </span>
                    </div>
                    <span className={statusClass(application.status)}>
                      {humanize(application.status)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="panel-message">
                You have not submitted an application yet. Explore published
                opportunities to find your next step.
              </p>
            )
          ) : (
            <p className="panel-message">
              Your application history is not available in this environment yet.
              When the application service is connected, your private
              submissions will appear here.
            </p>
          )}
          <a className="text-link" href="/marketplace/">
            Explore opportunities <span aria-hidden="true">↗</span>
          </a>
        </article>

        <article className="panel discover-panel">
          <p className="eyebrow">OPEN THE ECOSYSTEM</p>
          <h2>Your next opportunity starts with discovery.</h2>
          <p>
            Explore published work, projects, partnerships and professional
            services from across the VOLITION VECTOR ecosystem.
          </p>
          <a className="primary-link" href="/marketplace/">
            Explore the marketplace
          </a>
        </article>
      </section>

      <footer className="footer">
        <span>VOLITION VECTOR</span>
        <span>Capability. Trust. Fair access. Measurable outcomes.</span>
      </footer>
    </main>
  );
}
