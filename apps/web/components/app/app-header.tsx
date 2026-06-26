import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import type { Me } from "@/lib/api/types";
import { logoutAction } from "@/lib/auth/actions";

const ORG_READ = "org.employee.read";

/** Top bar for the authenticated app: brand, nav, signed-in identity, and sign-out. The Org link is
 *  shown only when the caller has org-read permission; the API enforces it regardless. */
export function AppHeader({ me }: { me: Me }) {
  const canReadOrg = me.permissions.includes(ORG_READ);
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="container mx-auto flex h-16 max-w-screen-lg items-center justify-between gap-6 px-4">
        <div className="flex items-center gap-6">
          <Logo />
          <nav aria-label="MyHR" className="flex items-center gap-4">
            <Link href="/myhr" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              My profile
            </Link>
            {canReadOrg && (
              <Link href="/org" className="text-sm font-medium text-gray-600 hover:text-gray-900">
                Org chart
              </Link>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-gray-500 sm:inline">{me.email}</span>
          <form action={logoutAction}>
            <button type="submit" className={buttonClasses("secondary")}>
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
