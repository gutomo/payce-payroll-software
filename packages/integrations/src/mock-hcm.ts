/**
 * The mock HCM connector: a synthetic human-capital source for demos and tests. It yields
 * deterministic, fake employee records (golden rule 1: never real PII) keyed off a numeric seed, so
 * a given run always produces the same batch and distinct runs produce distinct employee numbers.
 * It sets only self-contained fields (no department/location/manager refs), so every generated row
 * imports cleanly regardless of how the target tenant's org is configured.
 */
import type { Connector, FetchOptions } from "./connector";
import { mulberry32 } from "./seed";
import type { EmployeeImportRecord } from "./types";

const FIRST_NAMES = [
  "Alex",
  "Jordan",
  "Sam",
  "Taylor",
  "Morgan",
  "Casey",
  "Riley",
  "Jamie",
  "Avery",
  "Quinn",
  "Drew",
  "Reese",
  "Cameron",
  "Devon",
  "Harper",
  "Rowan",
  "Emerson",
  "Finley",
  "Sage",
  "Hayden",
];
const LAST_NAMES = [
  "Avery",
  "Rivera",
  "Chen",
  "Patel",
  "Okafor",
  "Nguyen",
  "Santos",
  "Khan",
  "Mueller",
  "Larsen",
  "Romano",
  "Haddad",
  "Costa",
  "Bauer",
  "Ito",
  "Walsh",
  "Frost",
  "Mbeki",
  "Cohen",
  "Park",
];
const JOB_TITLES = [
  "Software Engineer",
  "Account Executive",
  "Operations Analyst",
  "Financial Analyst",
  "People Partner",
  "Support Specialist",
  "Product Manager",
  "Data Analyst",
];
const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"] as const;

function pick<T>(pool: readonly T[], rand: () => number): T {
  const value = pool[Math.floor(rand() * pool.length)];
  if (value === undefined) throw new Error("cannot pick from an empty pool");
  return value;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function generate({ seed, count }: FetchOptions): EmployeeImportRecord[] {
  const rand = mulberry32(seed);
  const tag = seed.toString(36);
  const records: EmployeeImportRecord[] = [];
  for (let i = 0; i < count; i++) {
    const firstName = pick(FIRST_NAMES, rand);
    const lastName = pick(LAST_NAMES, rand);
    const year = 2019 + Math.floor(rand() * 6);
    const month = 1 + Math.floor(rand() * 12);
    const day = 1 + Math.floor(rand() * 28);
    records.push({
      employeeNumber: `HCM-${tag}-${String(i + 1).padStart(4, "0")}`,
      firstName,
      lastName,
      hireDate: `${year}-${pad(month)}-${pad(day)}`,
      employmentType: pick(EMPLOYMENT_TYPES, rand),
      jobTitle: pick(JOB_TITLES, rand),
      workEmail: `${firstName}.${lastName}.${i + 1}@hcm.example`.toLowerCase(),
    });
  }
  return records;
}

export const MOCK_HCM: Connector = {
  key: "mock-hcm",
  name: "Mock HCM",
  description:
    "A synthetic human-capital source for demos and tests. Generates deterministic, fake employee records to sync into the platform.",
  kind: "hcm",
  directions: ["INBOUND", "OUTBOUND"],
  fetchEmployees: generate,
};
