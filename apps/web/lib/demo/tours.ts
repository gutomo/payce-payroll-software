/**
 * JSON-defined guided tours for the interactive demo (PLAN.md §6.4). Each step targets an element by
 * a `data-tour` selector on the demo screen, so non-engineers can add or reword tours here without
 * touching the overlay engine. Two starter tours mirror the reference product: an MyHR/ESS tour and
 * an Insights dashboard tour. No auth, no real data — these drive static synthetic fixtures.
 */

export type TourPlacement = "top" | "bottom" | "left" | "right";

export interface TourStep {
  /** CSS selector for the element to spotlight, e.g. `[data-tour="leave-balance"]`. */
  target: string;
  title: string;
  body: string;
  /** Preferred tooltip side; the engine flips it if it would overflow the viewport. */
  placement?: TourPlacement;
}

export interface Tour {
  id: string;
  name: string;
  description: string;
  /** The demo screen this tour runs on. */
  path: string;
  steps: TourStep[];
}

export const TOURS: readonly Tour[] = [
  {
    id: "myhr",
    name: "Employee self-service (MyHR)",
    description: "See how an employee checks their payslip, leave, and tasks — and asks Assist.",
    path: "/demo/myhr",
    steps: [
      {
        target: '[data-tour="welcome"]',
        title: "Welcome to MyHR",
        body: "This is the home an employee sees after signing in: their latest pay, leave, and anything that needs their attention.",
        placement: "bottom",
      },
      {
        target: '[data-tour="payslip"]',
        title: "Your latest payslip",
        body: "The most recent published payslip is one click away, with year-to-date figures and a PDF download.",
        placement: "right",
      },
      {
        target: '[data-tour="leave"]',
        title: "Leave at a glance",
        body: "Remaining balances per leave type. Applying for time off updates these automatically once a manager approves.",
        placement: "left",
      },
      {
        target: '[data-tour="tasks"]',
        title: "Tasks & approvals",
        body: "Pending items — a claim to submit, a profile change to confirm — surface here so nothing slips.",
        placement: "top",
      },
      {
        target: '[data-tour="assist"]',
        title: "Ask Assist",
        body: "The AI assistant answers everyday questions from the employee's own data and company policies, and escalates to a person when unsure.",
        placement: "top",
      },
    ],
  },
  {
    id: "insights",
    name: "Analytics (Insights)",
    description: "Tour the prebuilt dashboards and the no-code report builder.",
    path: "/demo/insights",
    steps: [
      {
        target: '[data-tour="dashboard"]',
        title: "Workforce dashboard",
        body: "Prebuilt views of the metrics teams ask for most — no setup required.",
        placement: "bottom",
      },
      {
        target: '[data-tour="headcount"]',
        title: "Headcount by department",
        body: "Every chart is interactive and respects each viewer's access — people only ever see what they're permitted to.",
        placement: "right",
      },
      {
        target: '[data-tour="cost"]',
        title: "Cost to company",
        body: "Annualised compensation by department, served from a read-optimised store so dashboards stay fast.",
        placement: "left",
      },
      {
        target: '[data-tour="builder"]',
        title: "Build your own",
        body: "Pick dimensions and measures to build a report without SQL, then export or schedule it.",
        placement: "top",
      },
    ],
  },
];

export function getTour(id: string): Tour | undefined {
  return TOURS.find((tour) => tour.id === id);
}
