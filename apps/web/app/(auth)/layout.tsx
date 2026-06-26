import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";

/** Minimal centered chrome for the sign-in flow: no marketing header/footer, no app nav. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        {children}
      </div>
    </div>
  );
}
