import type { ReactNode } from "react";
import { AppHeader } from "@/components/app/app-header";
import { requireMe } from "@/lib/auth/server";

/** Authenticated app shell. Resolves the current user once (redirecting to login if the session is
 *  gone) and frames the MyHR pages with the app header. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { me } = await requireMe();
  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <AppHeader me={me} />
      <main id="main" className="flex-1">
        <div className="container mx-auto max-w-screen-lg px-4 py-8">{children}</div>
      </main>
    </div>
  );
}
