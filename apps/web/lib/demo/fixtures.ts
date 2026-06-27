/**
 * Static, synthetic fixtures for the interactive demo. No auth, no API, no real PII (golden rule 1):
 * everything here is made-up data baked into the web app so `/demo` runs entirely client-side and is
 * fully reproducible. Money is shown as preformatted strings (this is illustrative, not a calculation).
 */

export interface DemoLeaveBalance {
  type: string;
  remaining: number;
  entitled: number;
}

export interface DemoMetricRow {
  department: string;
  value: number;
}

export const demoEmployee = {
  name: "Jordan Avery",
  employeeNumber: "E-1042",
  jobTitle: "Senior Software Engineer",
  department: "Engineering",
  manager: "Sam Rivera",
};

export const demoPayslip = {
  period: "May 2026",
  payDate: "30 May 2026",
  gross: "$8,750.00",
  net: "$6,420.18",
};

export const demoLeaveBalances: readonly DemoLeaveBalance[] = [
  { type: "Annual Leave", remaining: 14, entitled: 20 },
  { type: "Sick Leave", remaining: 8, entitled: 10 },
];

export const demoTasks: readonly string[] = [
  "Submit your March travel claim",
  "Confirm your updated home address",
  "Acknowledge the new remote-work policy",
];

export const demoHeadcountByDept: readonly DemoMetricRow[] = [
  { department: "Engineering", value: 24 },
  { department: "Sales", value: 18 },
  { department: "Operations", value: 12 },
  { department: "People", value: 6 },
  { department: "Finance", value: 5 },
];

// Annualised cost to company by department, in thousands (illustrative).
export const demoCostByDept: readonly DemoMetricRow[] = [
  { department: "Engineering", value: 3120 },
  { department: "Sales", value: 2040 },
  { department: "Operations", value: 1080 },
  { department: "Finance", value: 720 },
  { department: "People", value: 540 },
];

/** Total across metric rows — used in the demo dashboard summary. */
export function sumMetric(rows: readonly DemoMetricRow[]): number {
  return rows.reduce((total, row) => total + row.value, 0);
}
