import { getHealth } from "@/lib/health";

export default function HomePage() {
  const health = getHealth();

  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="text-3xl font-bold">Payce</h1>
      <p className="mt-2 text-gray-600">
        Global payroll platform — Phase 0 scaffold. Service status:{" "}
        <span className="font-medium">{health.status}</span>.
      </p>
    </main>
  );
}
