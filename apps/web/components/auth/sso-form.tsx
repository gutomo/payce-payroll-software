"use client";

import { useActionState } from "react";
import type { ComponentProps } from "react";
import { buttonClasses } from "@/components/ui/button";
import { ssoStartAction } from "@/lib/auth/actions";
import { INITIAL_AUTH_STATE } from "@/lib/auth/form-state";

/**
 * Enterprise single sign-on. Posts to `ssoStartAction`, which redirects the browser to the workspace's
 * identity provider. Email is an optional hint (the offline/dev test IdP uses it to pick the account).
 */
export function SsoForm() {
  const [state, action, pending] = useActionState(ssoStartAction, INITIAL_AUTH_STATE);
  return (
    <form
      action={action}
      className="space-y-4 rounded-card border border-gray-200 bg-white p-6 shadow-sm"
    >
      <div>
        <h2 className="text-base font-bold text-gray-900">Single sign-on</h2>
        <p className="mt-1 text-sm text-gray-500">
          Use your organization&rsquo;s identity provider.
        </p>
      </div>
      <Field
        label="Workspace"
        name="tenantSlug"
        type="text"
        autoComplete="organization"
        defaultValue="demo"
        required
      />
      <Field label="Email" name="email" type="email" autoComplete="username" />
      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className={buttonClasses("secondary", "w-full")}>
        {pending ? "Redirecting…" : "Continue with SSO"}
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
