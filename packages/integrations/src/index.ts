/**
 * `@payce/integrations`, the pure connector framework (Phase 7). It defines the typed connector
 * interface + registry, a deterministic mock HCM connector, CSV normalisation onto the existing
 * employee-import pipeline, and HMAC webhook signing. No I/O beyond crypto; the API layer wires it to
 * tenant-scoped persistence and idempotent runs.
 */

export type {
  ConnectorDefinition,
  ConnectorKind,
  EmployeeImportRecord,
  IntegrationDirection,
} from "./types";
export {
  type Connector,
  CONNECTORS,
  connectorSummaries,
  type FetchOptions,
  getConnector,
} from "./connector";
export { MOCK_HCM } from "./mock-hcm";
export { hashSeed, mulberry32 } from "./seed";
export { IMPORT_COLUMNS, recordsToCsv } from "./csv";
export {
  isWebhookEvent,
  signPayload,
  verifySignature,
  WEBHOOK_EVENTS,
  type WebhookEvent,
} from "./webhook";
