import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { OrgTree } from "@/components/app/org-tree";
import { getOrgTree } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import { requireAccessToken } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Org chart" };

export default async function OrgPage() {
  const token = await requireAccessToken();
  let tree;
  try {
    tree = await getOrgTree(token);
  } catch (error) {
    if (error instanceof ApiError) {
      // Reachable by direct navigation without org-read permission; the nav link is hidden otherwise.
      if (error.isForbidden) {
        return (
          <Page>
            <EmptyState
              title="Not available"
              body="You don't have permission to view the organization chart."
            />
          </Page>
        );
      }
      if (error.isUnauthorized) redirect("/login");
    }
    throw error;
  }

  return (
    <Page>
      <div className="rounded-card border border-gray-200 bg-white p-4">
        <OrgTree nodes={tree} />
      </div>
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <section>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-gray-900">Org chart</h1>
      {children}
    </section>
  );
}
