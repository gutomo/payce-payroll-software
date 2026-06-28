/**
 * Serialise connector records into the exact CSV the Phase 2 employee-import pipeline accepts (a
 * header row of named columns, RFC-4180 quoting). This lets an inbound sync reuse the existing
 * validated import path instead of a parallel write path.
 */
import type { EmployeeImportRecord } from "./types";

/** Column order/names must match the import RowSchema (apps/api employees-import.service). */
export const IMPORT_COLUMNS = [
  "employeeNumber",
  "firstName",
  "lastName",
  "hireDate",
  "employmentType",
  "jobTitle",
  "workEmail",
  "departmentName",
  "locationName",
  "managerEmployeeNumber",
] as const;

function escapeCell(value: string | undefined): string {
  const cell = value ?? "";
  return /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export function recordsToCsv(records: readonly EmployeeImportRecord[]): string {
  const header = IMPORT_COLUMNS.join(",");
  const rows = records.map((record) =>
    IMPORT_COLUMNS.map((column) => escapeCell(record[column])).join(","),
  );
  return [header, ...rows].join("\n");
}
