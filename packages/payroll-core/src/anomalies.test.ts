import { describe, expect, it } from "vitest";
import { detectAnomalies } from "./anomalies";

const ok = (employeeId: string, grossMinor = 500_000, deductionsMinor = 100_000) => ({
  employeeId,
  grossMinor,
  deductionsMinor,
  netMinor: grossMinor - deductionsMinor,
});

describe("detectAnomalies", () => {
  it("returns no anomalies for a clean set of lines", () => {
    expect(detectAnomalies([ok("e1"), ok("e2")])).toHaveLength(0);
  });

  describe("NEGATIVE_NET", () => {
    it("flags when net pay is below zero (ERROR)", () => {
      const result = detectAnomalies([
        { employeeId: "e1", grossMinor: 100, deductionsMinor: 500, netMinor: -400 },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        employeeId: "e1",
        type: "NEGATIVE_NET",
        severity: "ERROR",
        detail: { netMinor: -400, grossMinor: 100, deductionsMinor: 500 },
      });
    });

    it("does not flag zero net pay", () => {
      expect(
        detectAnomalies([{ employeeId: "e1", grossMinor: 0, deductionsMinor: 0, netMinor: 0 }]),
      ).toHaveLength(0);
    });
  });

  describe("NO_COMPENSATION", () => {
    it("flags skipped employees (WARNING)", () => {
      const result = detectAnomalies([
        { employeeId: "e1", grossMinor: 0, deductionsMinor: 0, netMinor: 0, skipped: true },
      ]);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ type: "NO_COMPENSATION", severity: "WARNING" });
    });

    it("does not additionally flag a skipped employee as NEGATIVE_NET", () => {
      const result = detectAnomalies([
        { employeeId: "e1", grossMinor: 0, deductionsMinor: 0, netMinor: 0, skipped: true },
      ]);
      expect(result.every((a) => a.type !== "NEGATIVE_NET")).toBe(true);
    });
  });

  describe("PAY_VARIANCE", () => {
    it("flags when gross increases > 20% vs prior (WARNING)", () => {
      // +50% change
      const result = detectAnomalies(
        [ok("e1", 600_000)],
        [{ employeeId: "e1", grossMinor: 400_000 }],
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        type: "PAY_VARIANCE",
        severity: "WARNING",
        detail: { grossMinor: 600_000, priorGrossMinor: 400_000, changePercent: 50 },
      });
    });

    it("flags when gross decreases > 20% vs prior", () => {
      // -25% change
      const result = detectAnomalies(
        [ok("e1", 300_000)],
        [{ employeeId: "e1", grossMinor: 400_000 }],
      );
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("PAY_VARIANCE");
      expect(result[0].detail.changePercent).toBe(-25);
    });

    it("does not flag at exactly 20% threshold (exclusive)", () => {
      const result = detectAnomalies(
        [ok("e1", 600_000)],
        [{ employeeId: "e1", grossMinor: 500_000 }],
      );
      expect(result).toHaveLength(0);
    });

    it("does not flag changes within threshold", () => {
      // +2%
      const result = detectAnomalies(
        [ok("e1", 510_000)],
        [{ employeeId: "e1", grossMinor: 500_000 }],
      );
      expect(result).toHaveLength(0);
    });

    it("does not flag when no prior run is provided", () => {
      expect(detectAnomalies([ok("e1", 1_000_000)])).toHaveLength(0);
    });

    it("does not flag new employees absent from prior lines", () => {
      const result = detectAnomalies(
        [ok("e1"), ok("e2")],
        [{ employeeId: "e1", grossMinor: ok("e1").grossMinor }],
      );
      expect(result.every((a) => a.employeeId !== "e2")).toBe(true);
    });
  });

  describe("mixed anomaly types", () => {
    it("detects multiple anomalies in one pass (golden master)", () => {
      const lines = [
        ok("e1"),
        { employeeId: "e2", grossMinor: 100, deductionsMinor: 500, netMinor: -400 },
        { employeeId: "e3", grossMinor: 0, deductionsMinor: 0, netMinor: 0, skipped: true },
        ok("e4", 900_000), // +80% vs prior
      ];
      const prior = [
        { employeeId: "e1", grossMinor: ok("e1").grossMinor },
        { employeeId: "e4", grossMinor: 500_000 },
      ];
      const result = detectAnomalies(lines, prior);
      expect(result).toHaveLength(3); // e2 NEGATIVE_NET, e3 NO_COMPENSATION, e4 PAY_VARIANCE
      expect(result.find((a) => a.employeeId === "e2")?.type).toBe("NEGATIVE_NET");
      expect(result.find((a) => a.employeeId === "e3")?.type).toBe("NO_COMPENSATION");
      expect(result.find((a) => a.employeeId === "e4")?.type).toBe("PAY_VARIANCE");
    });
  });
});
