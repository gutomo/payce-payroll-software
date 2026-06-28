import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { SsoForm } from "@/components/auth/sso-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div className="space-y-4">
      {error === "sso" && (
        <p
          role="alert"
          className="rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Single sign-on didn&rsquo;t complete. Please try again.
        </p>
      )}
      <LoginForm />
      <SsoForm />
    </div>
  );
}
