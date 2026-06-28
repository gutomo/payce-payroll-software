/**
 * PII redaction for audit logs. Every Assist prompt/response is audit-logged (PLAN.md §5.4), but the
 * audit trail must not become a PII sink (golden rule 1, telemetry rule). We mask the obvious direct
 * identifiers a free-text question might contain before it is persisted to the audit event. This is a
 * conservative scrub for telemetry, not a security boundary — the real data access is RBAC/RLS-bound.
 */

/** Email addresses → `[redacted-email]`. */
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
/** Runs of 5+ digits (tax IDs, bank/account numbers, long employee codes) → `[redacted-number]`. */
const LONG_NUMBER_RE = /\d[\d\s-]{4,}\d/g;

/** Redact direct identifiers from free text before it is logged. Idempotent and side-effect free. */
export function redactPii(text: string): string {
  return text.replace(EMAIL_RE, "[redacted-email]").replace(LONG_NUMBER_RE, "[redacted-number]");
}
