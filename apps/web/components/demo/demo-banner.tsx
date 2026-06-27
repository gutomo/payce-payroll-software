import Link from "next/link";

/** Persistent reminder that the demo is synthetic and login-free (PLAN.md §6.4, golden rule 1). */
export function DemoBanner() {
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-sm text-amber-900">
      <div className="container mx-auto flex max-w-screen-lg items-center justify-between gap-4 px-4 py-2">
        <p>
          You&rsquo;re exploring an interactive demo with synthetic data — no login, nothing saved.
        </p>
        <Link href="/demo" className="shrink-0 font-medium underline">
          Choose a tour
        </Link>
      </div>
    </div>
  );
}
