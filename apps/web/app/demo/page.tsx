import Link from "next/link";
import { TOURS } from "@/lib/demo/tours";

export default function DemoHomePage() {
  return (
    <section>
      <h1 className="text-3xl font-bold tracking-tight text-gray-900">Take a guided tour</h1>
      <p className="mt-2 max-w-2xl text-gray-600">
        Click through the product on synthetic data — no sign-in, nothing saved. Pick a tour to
        start; a spotlight walks you through each screen step by step.
      </p>

      <ul className="mt-8 grid gap-6 sm:grid-cols-2">
        {TOURS.map((tour) => (
          <li key={tour.id}>
            <Link
              href={tour.path}
              className="block h-full rounded-card border border-gray-200 bg-white p-6 shadow-card transition-colors hover:border-brand-300"
            >
              <h2 className="text-lg font-semibold text-gray-900">{tour.name}</h2>
              <p className="mt-2 text-sm text-gray-600">{tour.description}</p>
              <p className="mt-4 text-sm font-medium text-brand-700">
                Start tour · {tour.steps.length} steps →
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
