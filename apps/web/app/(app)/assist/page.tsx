import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AssistChat } from "@/components/app/assist-chat";
import { EmptyState } from "@/components/app/empty-state";
import { requireMe } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Assist" };

const ASSIST_USE = "assist.use";

export default async function AssistPage() {
  const { me } = await requireMe();

  if (!me.permissions.includes(ASSIST_USE)) {
    return (
      <Page>
        <EmptyState title="Not available" body="You don't have access to Assist." />
      </Page>
    );
  }

  return (
    <Page>
      <AssistChat />
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <section>
      <h1 className="mb-2 text-2xl font-bold tracking-tight text-gray-900">Assist</h1>
      <p className="mb-6 text-sm text-gray-500">
        Your in-app assistant for everyday questions about leave, pay, claims, and company policies.
      </p>
      {children}
    </section>
  );
}
