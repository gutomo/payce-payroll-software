import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Centered, padded content column shared across marketing sections. */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("container mx-auto max-w-screen-2xl", className)}>{children}</div>;
}
