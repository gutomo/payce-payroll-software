import type { Locale } from "@payce/i18n";
import type { EmployeeProfile, EmployeeStatus } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

const STATUS_LABEL: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  TERMINATED: "Terminated",
};

const STATUS_CLASS: Record<EmployeeStatus, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  ON_LEAVE: "bg-amber-100 text-amber-800",
  TERMINATED: "bg-gray-200 text-gray-700",
};

/** Read-only MyHR profile card. Compensation is deliberately not shown; it is a separate,
 *  permissioned endpoint, not part of this self-service view. */
export function ProfileCard({ profile, locale }: { profile: EmployeeProfile; locale?: Locale }) {
  const managerName = profile.manager
    ? `${profile.manager.firstName} ${profile.manager.lastName}`
    : null;

  return (
    <article className="overflow-hidden rounded-card border border-gray-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-6 py-5">
        <div>
          <h2 className="text-lg font-bold text-gray-900">
            {profile.firstName} {profile.lastName}
          </h2>
          <p className="font-mono text-sm text-gray-500">{profile.employeeNumber}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_CLASS[profile.status]}`}
        >
          {STATUS_LABEL[profile.status]}
        </span>
      </header>
      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 px-6 py-5 sm:grid-cols-2">
        <Field label="Work email" value={profile.workEmail} />
        <Field label="Manager" value={managerName} />
        <Field label="Department" value={profile.department?.name ?? null} />
        <Field label="Location" value={profile.location?.name ?? null} />
        <Field label="Cost center" value={profile.costCenter?.name ?? null} />
        <Field label="Hire date" value={formatDate(profile.hireDate, locale)} />
        {profile.terminationDate && (
          <Field label="Termination date" value={formatDate(profile.terminationDate, locale)} />
        )}
      </dl>
    </article>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-900">{value ?? "-"}</dd>
    </div>
  );
}
