import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/app/empty-state";
import { ProfileCard } from "@/components/app/profile-card";
import { getMyProfile } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import { requireAccessToken } from "@/lib/auth/server";

export const metadata: Metadata = { title: "My profile" };

export default async function MyHrPage() {
  const token = await requireAccessToken();
  let profile;
  try {
    profile = await getMyProfile(token);
  } catch (error) {
    if (error instanceof ApiError) {
      // No linked employee record (e.g. an admin-only account): show guidance, not an error page.
      if (error.isNotFound) {
        return (
          <Page>
            <EmptyState
              title="No employee profile"
              body="Your account isn't linked to an employee record yet. An administrator can link it from the Operations Console."
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
      <ProfileCard profile={profile} />
    </Page>
  );
}

function Page({ children }: { children: ReactNode }) {
  return (
    <section>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-gray-900">My profile</h1>
      {children}
    </section>
  );
}
