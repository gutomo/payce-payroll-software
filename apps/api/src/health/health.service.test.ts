import { describe, expect, it } from "vitest";
import { HealthService } from "./health.service";

describe("HealthService", () => {
  it("returns ok status for the api service", () => {
    const result = new HealthService().check();

    expect(result.status).toBe("ok");
    expect(result.service).toBe("api");
    expect(result.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});
