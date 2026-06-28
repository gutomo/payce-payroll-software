/**
 * Shared types for `@payce/integrations`, the connector framework (Phase 7). Pure: it defines the
 * typed connector interface, the canonical inbound record shape, and the outbound webhook event
 * catalog. The API layer wires these to tenant-scoped persistence and the existing employee-import
 * pipeline; this package has no I/O beyond deterministic HMAC signing.
 */

/** What a connector can do. Today only HCM (human-capital) sources are modelled. */
export type ConnectorKind = "hcm";

/** Direction of data flow for an integration run. */
export type IntegrationDirection = "INBOUND" | "OUTBOUND";

/**
 * The canonical inbound employee record a connector yields. It maps 1:1 onto the columns the Phase 2
 * employee-import pipeline accepts, so a connector "syncs" by normalising its source into this shape
 * and handing it to the same validated import path the CSV upload uses. Dates are `YYYY-MM-DD`.
 */
export interface EmployeeImportRecord {
  employeeNumber: string;
  firstName: string;
  lastName: string;
  hireDate: string;
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERN";
  jobTitle: string;
  workEmail?: string;
  departmentName?: string;
  locationName?: string;
  managerEmployeeNumber?: string;
}

/** Catalog metadata for a connector (the JSON-safe projection returned by the API catalog endpoint). */
export interface ConnectorDefinition {
  key: string;
  name: string;
  description: string;
  kind: ConnectorKind;
  directions: IntegrationDirection[];
}
