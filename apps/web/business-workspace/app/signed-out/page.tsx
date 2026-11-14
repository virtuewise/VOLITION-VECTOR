import Link from "next/link";

export default function SignedOutPage() {
  return (
    <main className="workspace">
      <section className="state-panel standalone-state" role="status">
        <p className="eyebrow">BUSINESS WORKSPACE</p>
        <h1>You are signed out.</h1>
        <p>
          Your Business Workspace session has ended. You can safely close this
          page or sign in again when you are ready.
        </p>
        <Link className="primary-link" href="/sign-in">
          Sign in again
        </Link>
      </section>
    </main>
  );
}
