import Link from "next/link";
import { formatMoney } from "./format-money";

type SearchParams = Promise<{
  q?: string | string[];
  view?: string | string[];
}>;

interface PublicOpportunity {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly opportunityType: string;
  readonly locationLabel: string | null;
  readonly isRemote: boolean;
  readonly compensationMin: string | null;
  readonly compensationMax: string | null;
  readonly compensationCurrency: string | null;
  readonly publishedAt: string;
  readonly expiresAt: string | null;
}

interface PublicService {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: string;
  readonly deliveryMode: "remote" | "onsite" | "hybrid";
  readonly pricingModel: "fixed" | "hourly" | "starting_at" | "quote";
  readonly priceAmount: string | null;
  readonly priceCurrency: string | null;
  readonly locationLabel: string | null;
  readonly publishedAt: string;
  readonly expiresAt: string | null;
}

interface Collection<T> {
  readonly items: readonly T[] | null;
}

function getApiOrigin(): string | null {
  const configured = process.env["VOLITION_API_URL"];
  if (!configured) return null;

  try {
    const url = new URL(configured);
    const isSecure = url.protocol === "https:";
    const isLocal =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    return isSecure || isLocal ? url.origin : null;
  } catch {
    return null;
  }
}

async function loadCollection<T>(
  apiOrigin: string,
  resource: string,
  query: string,
): Promise<Collection<T>> {
  try {
    const response = await fetch(apiOrigin + "/v1/" + resource + "?" + query, {
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) return { items: null };

    const payload: unknown = await response.json();
    return Array.isArray(payload) ? { items: payload as T[] } : { items: null };
  } catch {
    return { items: null };
  }
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCompensation(item: PublicOpportunity): string | null {
  const minimum = formatMoney(item.compensationMin, item.compensationCurrency);
  const maximum = formatMoney(item.compensationMax, item.compensationCurrency);

  if (minimum && maximum) return minimum + " – " + maximum;
  if (minimum) return "From " + minimum;
  if (maximum) return "Up to " + maximum;
  return null;
}

function formatServicePrice(item: PublicService): string {
  if (item.pricingModel === "quote") return "Request a quote";

  const amount = formatMoney(item.priceAmount, item.priceCurrency);
  if (!amount) return "Pricing available on request";
  if (item.pricingModel === "hourly") return amount + " / hour";
  if (item.pricingModel === "starting_at") return "From " + amount;
  return amount;
}

function formatDate(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
  }).format(date);
}

export default async function MarketplaceHome({
  searchParams,
}: {
  readonly searchParams: SearchParams;
}) {
  const params = await searchParams;
  const query =
    typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const requestedView = typeof params.view === "string" ? params.view : "all";
  const view =
    requestedView === "opportunities" || requestedView === "services"
      ? requestedView
      : "all";
  const apiOrigin = getApiOrigin();
  const search = new URLSearchParams({ limit: "20" });

  if (query) search.set("q", query);

  let opportunities: Collection<PublicOpportunity> = { items: null };
  let services: Collection<PublicService> = { items: null };

  if (apiOrigin) {
    const results = await Promise.all([
      view === "services"
        ? Promise.resolve<Collection<PublicOpportunity>>({ items: [] })
        : loadCollection<PublicOpportunity>(
            apiOrigin,
            "opportunities",
            search.toString(),
          ),
      view === "opportunities"
        ? Promise.resolve<Collection<PublicService>>({ items: [] })
        : loadCollection<PublicService>(
            apiOrigin,
            "services",
            search.toString(),
          ),
    ]);

    opportunities = results[0];
    services = results[1];
  }

  const opportunitiesUnavailable =
    view !== "services" && opportunities.items === null;
  const servicesUnavailable =
    view !== "opportunities" && services.items === null;

  return (
    <main className="marketplace">
      <header className="topbar">
        <Link className="wordmark" href="/">
          VOLITION <span>VECTOR</span>
        </Link>
        <nav aria-label="Main navigation">
          {view !== "services" ? (
            <a href="#opportunities">Opportunities</a>
          ) : null}
          {view !== "opportunities" ? <a href="#services">Services</a> : null}
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">THE GLOBAL OPPORTUNITY ECOSYSTEM</p>
        <h1>Find the opportunity that moves you forward.</h1>
        <p className="hero-copy">
          Discover meaningful work, trusted services and new ways to build
          together. Your next step starts with what you can do.
        </p>
        <form className="search" method="get">
          <label className="visually-hidden" htmlFor="marketplace-search">
            Search opportunities and services
          </label>
          <input
            id="marketplace-search"
            type="search"
            name="q"
            maxLength={200}
            defaultValue={query}
            placeholder="What are you looking for?"
          />
          <label className="visually-hidden" htmlFor="marketplace-view">
            Choose what to discover
          </label>
          <select id="marketplace-view" name="view" defaultValue={view}>
            <option value="all">Everything</option>
            <option value="opportunities">Opportunities</option>
            <option value="services">Services</option>
          </select>
          <button type="submit">Explore</button>
        </form>
        <div className="hero-note">
          <span>Capability first</span>
          <span>Trust by evidence</span>
          <span>Opportunity for all</span>
        </div>
      </section>

      {!apiOrigin ? (
        <div className="connection-notice" role="status">
          <strong>Live discovery is not connected yet.</strong>
          <span>
            Configure VOLITION_API_URL with the API origin to display published
            opportunities and services. No sample listings are shown as real
            data.
          </span>
        </div>
      ) : null}

      {view !== "services" ? (
        <section className="catalog-section" id="opportunities">
          <div className="section-heading">
            <div>
              <p className="eyebrow">MAKE YOUR NEXT MOVE</p>
              <h2>Opportunities</h2>
            </div>
            <span className="section-caption">
              Work · Projects · Tenders · Partnerships
            </span>
          </div>
          {opportunitiesUnavailable ? (
            <p className="empty-state">
              Opportunity listings are temporarily unavailable. Please try again
              later.
            </p>
          ) : opportunities.items?.length ? (
            <div className="listing-grid">
              {opportunities.items.map((item) => (
                <article className="listing-card" key={item.id}>
                  <div className="card-topline">
                    <span className="type-pill">
                      {humanize(item.opportunityType)}
                    </span>
                    {item.isRemote ? (
                      <span className="quiet-label">Remote</span>
                    ) : null}
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  <div className="card-meta">
                    <span>
                      {item.locationLabel ??
                        (item.isRemote ? "Remote" : "Location not specified")}
                    </span>
                    {formatCompensation(item) ? (
                      <strong>{formatCompensation(item)}</strong>
                    ) : null}
                  </div>
                  <div className="card-footer">
                    <span>
                      Published {formatDate(item.publishedAt) ?? "recently"}
                    </span>
                    {item.expiresAt ? (
                      <span>
                        Closes {formatDate(item.expiresAt) ?? "as listed"}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              No published opportunities match this search yet. Try another
              search or check back soon.
            </p>
          )}
        </section>
      ) : null}

      {view !== "opportunities" ? (
        <section className="catalog-section" id="services">
          <div className="section-heading">
            <div>
              <p className="eyebrow">WORK WITH TRUSTED PROVIDERS</p>
              <h2>Services</h2>
            </div>
            <span className="section-caption">
              Professional services · Remote · On-site
            </span>
          </div>
          {servicesUnavailable ? (
            <p className="empty-state">
              Service listings are temporarily unavailable. Please try again
              later.
            </p>
          ) : services.items?.length ? (
            <div className="listing-grid">
              {services.items.map((item) => (
                <article className="listing-card" key={item.id}>
                  <div className="card-topline">
                    <span className="type-pill">{humanize(item.category)}</span>
                    <span className="quiet-label">
                      {humanize(item.deliveryMode)}
                    </span>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.summary}</p>
                  <div className="card-meta">
                    <span>
                      {item.locationLabel ?? humanize(item.deliveryMode)}
                    </span>
                    <strong>{formatServicePrice(item)}</strong>
                  </div>
                  <div className="card-footer">
                    <span>
                      Published {formatDate(item.publishedAt) ?? "recently"}
                    </span>
                    {item.expiresAt ? (
                      <span>
                        Available until{" "}
                        {formatDate(item.expiresAt) ?? "as listed"}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              No published services match this search yet. Try a different term
              or check back soon.
            </p>
          )}
        </section>
      ) : null}

      <footer className="footer">
        <span>VOLITION VECTOR</span>
        <span>Capability. Trust. Fair access. Measurable outcomes.</span>
      </footer>
    </main>
  );
}
