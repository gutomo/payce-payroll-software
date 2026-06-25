import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaForm } from "@/components/auth/mfa-form";
import { getMfaToken } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Two-factor verification" };

export default async function MfaPage() {
  // Reaching this step without a pending MFA challenge means there's nothing to verify.
  if (!(await getMfaToken())) {
    redirect("/login");
  }
  return <MfaForm />;
}
