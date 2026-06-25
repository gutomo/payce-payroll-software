import Link from "next/link";
import { cn } from "@/lib/cn";
import { site } from "@/lib/site";

/**
 * Brand wordmark — an original mark (a simple stylized "P" glyph) plus the placeholder name. No
 * third-party logo or brand asset (PLAN.md §2).
 */
export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      aria-label={`${site.name} home`}
      className={cn("inline-flex items-center gap-2", className)}
    >
      <span
        aria-hidden="true"
        className="grid h-8 w-8 place-items-center rounded-card bg-brand-600 text-base font-bold text-white"
      >
        P
      </span>
      <span className="text-lg font-bold tracking-tight text-gray-900">{site.name}</span>
    </Link>
  );
}
