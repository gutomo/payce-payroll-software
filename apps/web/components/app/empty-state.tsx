/** Neutral placeholder for "nothing here / not available" states (no profile, no permission). */
export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-card border border-dashed border-gray-300 bg-white p-8 text-center">
      <h2 className="text-base font-semibold text-gray-900">{title}</h2>
      <p className="mx-auto mt-1 max-w-prose text-sm text-gray-500">{body}</p>
    </div>
  );
}
