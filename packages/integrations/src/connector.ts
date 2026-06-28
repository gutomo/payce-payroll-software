/**
 * The typed connector interface + registry. A connector is data (catalog metadata) plus behaviour
 * (how to fetch records from its source). Inbound fetching is deterministic given its options, so the
 * same run inputs always produce the same records — which is what makes an integration run idempotent.
 */
import { MOCK_HCM } from "./mock-hcm";
import type { ConnectorDefinition, EmployeeImportRecord } from "./types";

/** Options for an inbound pull. `seed` makes generation deterministic; `count` bounds the batch. */
export interface FetchOptions {
  seed: number;
  count: number;
}

export interface Connector extends ConnectorDefinition {
  /** Pull employee records from the (mock) source system. Deterministic given the same options. */
  fetchEmployees(options: FetchOptions): EmployeeImportRecord[];
}

/** All registered connectors. v1 ships one synthetic HCM connector. */
export const CONNECTORS: readonly Connector[] = [MOCK_HCM];

export function getConnector(key: string): Connector | undefined {
  return CONNECTORS.find((connector) => connector.key === key);
}

/** JSON-safe catalog projection (drops the behaviour) for the API's connector-catalog endpoint. */
export function connectorSummaries(): ConnectorDefinition[] {
  return CONNECTORS.map(({ key, name, description, kind, directions }) => ({
    key,
    name,
    description,
    kind,
    directions,
  }));
}
