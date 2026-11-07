import Link from "next/link";

export default function SignedOutPage() {
  return (
    <main className="shell">
      <p className="eyebrow">VOLITION VECTOR · INDIVIDUAL WORKSPACE</p>
      <h1>You’re signed out.</h1>
      <p>Your local AuthKit session has been ended.</p>
      <p>
        <Link href="/sign-in">Sign in again</Link>
      </p>
    </main>
  );
}
