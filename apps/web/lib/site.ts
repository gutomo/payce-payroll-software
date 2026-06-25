/**
 * Marketing site content model. Original copy for the placeholder "Payce" brand — no third-party
 * brand names, customer logos, or verbatim marketing copy (PLAN.md §2). Keeping content as typed
 * data (rather than inline JSX) keeps it testable and lets the shell stay presentational.
 */

export const site = {
  name: "Payce",
  tagline: "Global payroll, run with confidence.",
  description:
    "A multi-tenant platform that runs accurate, auditable payroll across borders — with self-service for every employee and AI assistance built in.",
} as const;

export type NavLink = { label: string; href: string };

export const primaryNav: readonly NavLink[] = [
  { label: "Platform", href: "/#platform" },
  { label: "Modules", href: "/#modules" },
  { label: "Why Payce", href: "/#why" },
  { label: "Resources", href: "/#resources" },
];

export type Module = {
  /** Stable key, also used as the anchor id and test selector. */
  key: string;
  name: string;
  summary: string;
};

/**
 * The four product modules. Names are our own working names (PLAN.md §2) — deliberately generic and
 * not the reference product's module names.
 */
export const modules: readonly Module[] = [
  {
    key: "operations-console",
    name: "Operations Console",
    summary:
      "Run end-to-end payroll cycles with maker–checker controls, variance checks, and a full audit trail on every change.",
  },
  {
    key: "insights",
    name: "Insights",
    summary:
      "Self-serve analytics, dashboards, and a report builder that turn payroll and cost data into decisions.",
  },
  {
    key: "myhr",
    name: "MyHR",
    summary:
      "Employee self-service for payslips, leave, claims, and profile — secure access from any device.",
  },
  {
    key: "assist",
    name: "Assist",
    summary:
      "An AI assistant that answers first-line payroll and HR questions across the platform, grounded in your data.",
  },
];

export type ValueProp = { title: string; body: string };

export const valueProps: readonly ValueProp[] = [
  {
    title: "Tenant isolation by default",
    body: "Every record is scoped to its tenant and enforced in the database, so one customer can never see another's data.",
  },
  {
    title: "Auditable by design",
    body: "Sensitive actions emit immutable audit events, giving you a defensible record of who changed what, and when.",
  },
  {
    title: "Built for scale",
    body: "A horizontally scalable architecture keeps reads fast and large payroll runs predictable as you grow.",
  },
];

export type FooterColumn = { heading: string; links: readonly NavLink[] };

export const footerColumns: readonly FooterColumn[] = [
  {
    heading: "Product",
    links: [
      { label: "Operations Console", href: "/#modules" },
      { label: "Insights", href: "/#modules" },
      { label: "MyHR", href: "/#modules" },
      { label: "Assist", href: "/#modules" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "Why Payce", href: "/#why" },
      { label: "Resources", href: "/#resources" },
      { label: "Contact", href: "/#resources" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Privacy", href: "/#resources" },
      { label: "Security", href: "/#why" },
    ],
  },
];

/** Copyright line. Year is injected so the result stays deterministic and testable. */
export function copyright(year: number): string {
  return `© ${year} ${site.name}. A demonstration project — synthetic data only.`;
}
