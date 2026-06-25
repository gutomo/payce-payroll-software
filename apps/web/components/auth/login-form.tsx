"use client";

import { useActionState } from "react";
import type { ComponentProps } from "react";
import { buttonClasses } from "@/components/ui/button";
import { loginAction } from "@/lib/auth/actions";
import { INITIAL_AUTH_STATE } from "@/lib/auth/form-state";

/** Password step. Posts to the `loginAction` server action, which either issues a session and
 *  redirects, or routes to the MFA step. The workspace defaults to `demo` to ease local sign-in. */
export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, INITIAL_AUTH_STATE);
  return (
    <form
      action={action}
      className="space-y-4 rounded-card border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h1 className="text-lg font-bold text-gray-900">Sign in</h1>
        <p className="mt-1 text-sm text-gray-500">Access your MyHR profile.</p>
      </div>
      <Field
        label="Workspace"
        name="tenantSlug"
        type="text"
        autoComplete="organization"
        defaultValue="demo"
        required
      />
      <Field label="Email" name="email" type="email" autoComplete="username" required />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClasses("primary", "w-full")}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

function Field({ label, name, ...props }: { label: string } & ComponentProps<"input">) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <input
        name={name}
        className="block w-full rounded-card border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        {...props}
      />
    </label>
  );
}
