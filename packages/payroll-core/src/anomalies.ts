export type AnomalySeverity = "ERROR" | "WARNING";
export type AnomalyType = "NEGATIVE_NET" | "NO_COMPENSATION" | "PAY_VARIANCE";

export interface AnomalyInput {
  employeeId: string;
  grossMinor: number;
  deductionsMinor: number;
  netMinor: number;
  /** True when the employee was in the pay group but had no payable compensation record this period. */
  skipped?: boolean;
}

export interface PriorPeriodLine {
  employeeId: string;
  grossMinor: number;
}

export interface DetectedAnomaly {
  employeeId: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  detail: Record<string, unknown>;
}

/** Flag when gross changes by more than this fraction vs the prior period. */
const PAY_VARIANCE_THRESHOLD = 0.2;

/**
 * Pure anomaly detection over a set of calculated pay lines. Deterministic — no I/O.
 *
 * @param lines      Current-period results, including skipped (no-comp) employees.
 * @param priorLines Optional gross pay per employee from the most recent prior run for variance checks.
 */
export function detectAnomalies(
  lines: AnomalyInput[],
  priorLines?: PriorPeriodLine[],
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const priorByEmployee = new Map(priorLines?.map((l) => [l.employeeId, l.grossMinor]) ?? []);

  for (const line of lines) {
    if (line.skipped) {
      anomalies.push({
        employeeId: line.employeeId,
        type: "NO_COMPENSATION",
        severity: "WARNING",
        detail: { reason: "No active compensation record in this pay group's currency" },
      });
      continue; // no further checks for skipped employees
    }

    if (line.netMinor < 0) {
      anomalies.push({
        employeeId: line.employeeId,
        type: "NEGATIVE_NET",
        severity: "ERROR",
        detail: {
          netMinor: line.netMinor,
          grossMinor: line.grossMinor,
          deductionsMinor: line.deductionsMinor,
        },
      });
    }

    const priorGross = priorByEmployee.get(line.employeeId);
    if (priorGross !== undefined && priorGross > 0) {
      const change = (line.grossMinor - priorGross) / priorGross;
      if (Math.abs(change) > PAY_VARIANCE_THRESHOLD) {
        anomalies.push({
          employeeId: line.employeeId,
          type: "PAY_VARIANCE",
          severity: "WARNING",
          detail: {
            grossMinor: line.grossMinor,
            priorGrossMinor: priorGross,
            changePercent: Math.round(change * 100),
          },
        });
      }
    }
  }

  return anomalies;
}
