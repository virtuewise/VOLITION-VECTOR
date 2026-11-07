const pathways = [
  {
    number: "01",
    eyebrow: "FOR INDIVIDUALS",
    title: "Make your next move count.",
    description:
      "Bring your capabilities into focus, discover relevant opportunities and build meaningful professional connections.",
    href: "/app/",
    action: "Explore the individual experience",
    tone: "mint",
  },
  {
    number: "02",
    eyebrow: "FOR ORGANISATIONS",
    title: "Find the people and capability to move forward.",
    description:
      "Connect with talent, services and the right opportunities to help your organisation make progress.",
    href: "/business/",
    action: "Explore the business workspace",
    tone: "blue",
  },
  {
    number: "03",
    eyebrow: "THE MARKETPLACE",
    title: "Turn possibility into a practical next step.",
    description:
      "Explore a connected space for services, capability and opportunity across the Volition Vector ecosystem.",
    href: "/marketplace/",
    action: "Discover the marketplace",
    tone: "violet",
  },
];

const principles = [
  {
    number: "01",
    title: "Clarity before complexity",
    description:
      "A more considered way to understand what is possible and decide where to go next.",
  },
  {
    number: "02",
    title: "Connections with purpose",
    description:
      "Bring people, organisations and opportunities into one coherent experience.",
  },
  {
    number: "03",
    title: "Trust built into the journey",
    description:
      "Identity, membership and accountable workflows are foundational to the platform.",
  },
];

export default function HomePage() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Volition Vector home">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-name">VOLITION<span>VECTOR</span></span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a href="#ecosystem">Ecosystem</a>
          <a href="#principles">Our approach</a>
          <a href="#about">About</a>
        </nav>
        <a className="header-cta" href="/marketplace/">
          Explore the platform <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className="hero">
        <div className="hero-glow hero-glow-one" aria-hidden="true" />
        <div className="hero-glow hero-glow-two" aria-hidden="true" />
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="eyebrow"><span className="eyebrow-line" /> A CONNECTED OPPORTUNITY ECOSYSTEM</p>
            <h1>Direction for what <em>comes next.</em></h1>
            <p className="hero-lede">
              Your capabilities. The right connections. New possibilities.
              One considered ecosystem to help you move forward.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#ecosystem">
                Discover the ecosystem <span aria-hidden="true">→</span>
              </a>
              <a className="text-link" href="#about">Get to know us <span aria-hidden="true">↗</span></a>
            </div>
            <div className="hero-footnote">
              <span className="status-dot" /> BUILT FOR PEOPLE AND ORGANISATIONS MOVING FORWARD
            </div>
          </div>

          <div className="hero-art" aria-label="Abstract illustration of connected paths and opportunities" role="img">
            <div className="orbit orbit-outer" />
            <div className="orbit orbit-middle" />
            <div className="orbit orbit-inner" />
            <div className="orbit-node node-top"><span>CAPABILITY</span></div>
            <div className="orbit-node node-right"><span>CONNECTION</span></div>
            <div className="orbit-node node-bottom"><span>OPPORTUNITY</span></div>
            <div className="core">
              <span className="core-symbol">V</span>
              <span className="core-label">VOLITION<br />VECTOR</span>
            </div>
            <div className="art-caption"><span>01 / 03</span> A clearer path forward</div>
          </div>
        </div>
        <div className="hero-bottom">
          <span>INDEPENDENT THINKING. CONNECTED PROGRESS.</span>
          <span className="scroll-cue">SCROLL TO EXPLORE <span aria-hidden="true">↓</span></span>
        </div>
      </section>

      <section className="intro section-wrap" id="about">
        <div className="section-kicker">01 — THE BIGGER PICTURE</div>
        <div className="intro-content">
          <h2>Progress happens when the right things <em>come together.</em></h2>
          <div className="intro-aside">
            <p>
              Volition Vector brings capability, trusted connections and
              opportunity into a shared digital ecosystem. Less fragmentation.
              More meaningful ways to take the next step.
            </p>
            <a className="underlined-link" href="#ecosystem">See how it comes together <span>→</span></a>
          </div>
        </div>
      </section>

      <section className="ecosystem-section" id="ecosystem">
        <div className="section-wrap">
          <div className="section-heading">
            <div>
              <div className="section-kicker">02 — ONE ECOSYSTEM, MULTIPLE PATHS</div>
              <h2>Start where <em>you are.</em></h2>
            </div>
            <p>Different goals. Connected experiences. A shared direction.</p>
          </div>
          <div className="pathway-grid">
            {pathways.map((pathway) => (
              <article className={`pathway-card ${pathway.tone}`} key={pathway.number}>
                <div className="card-topline"><span>{pathway.number}</span><span className="card-arrow">↗</span></div>
                <div className="card-orb" aria-hidden="true"><span /></div>
                <p className="card-eyebrow">{pathway.eyebrow}</p>
                <h3>{pathway.title}</h3>
                <p className="card-description">{pathway.description}</p>
                <a href={pathway.href} className="card-link">{pathway.action} <span>→</span></a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="principles-section section-wrap" id="principles">
        <div className="principles-lead">
          <div className="section-kicker">03 — THE VOLITION VECTOR APPROACH</div>
          <h2>Technology should make progress feel <em>more human.</em></h2>
          <p>We are building around the foundations that make digital participation useful, coherent and worthy of trust.</p>
        </div>
        <div className="principles-list">
          {principles.map((principle) => (
            <article className="principle" key={principle.number}>
              <span className="principle-number">{principle.number}</span>
              <div><h3>{principle.title}</h3><p>{principle.description}</p></div>
              <span className="principle-plus" aria-hidden="true">↗</span>
            </article>
          ))}
        </div>
      </section>

      <section className="closing-cta">
        <div className="closing-inner">
          <p className="eyebrow"><span className="eyebrow-line" /> YOUR NEXT CHAPTER STARTS HERE</p>
          <h2>Make room for <em>what’s possible.</em></h2>
          <p>Explore the Volition Vector ecosystem and find the path that fits your next move.</p>
          <a className="button button-light" href="/marketplace/">Explore Volition Vector <span>→</span></a>
        </div>
        <div className="closing-decoration" aria-hidden="true">V</div>
      </section>

      <footer className="site-footer">
        <a className="brand footer-brand" href="/" aria-label="Volition Vector home">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span className="brand-name">VOLITION<span>VECTOR</span></span>
        </a>
        <p>Direction for what comes next.</p>
        <div className="footer-links"><a href="#ecosystem">Ecosystem</a><a href="#principles">Our approach</a><a href="#about">About Volition Vector</a></div>
        <span className="copyright">© {new Date().getFullYear()} VOLITION VECTOR</span>
      </footer>
    </main>
  );
}
