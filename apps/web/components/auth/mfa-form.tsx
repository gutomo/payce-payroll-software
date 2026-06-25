"use client";

import { useActionState } from "react";
import { buttonClasses } from "@/components/ui/button";
import { verifyMfaAction } from "@/lib/auth/actions";
import { INITIAL_AUTH_STATE } from "@/lib/auth/form-state";

/** Second factor step. Posts the authenticator code to `verifyMfaAction`, which exchanges the
 *  pending MFA token for a session. */
export function MfaForm() {
  const [state, action, pending] = useActionState(verifyMfaAction, INITIAL_AUTH_STATE);
  return (
    <form
      action={action}
      className="space-y-4 rounded-card border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h1 className="text-lg font-bold text-gray-900">Two-factor verification</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enter the 6-digit code from your authenticator app.
        </p>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">Code</span>
        <input
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6,8}"
          maxLength={8}
          required
          className="block w-full rounded-card border border-gray-300 px-3 py-2 text-center font-mono text-lg tracking-widest shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
      </label>
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClasses("primary", "w-full")}>
        {pending ? "Verifying…" : "Verify"}
      </button>
    </form>
  );
}
