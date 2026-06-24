import { describe, expect, it } from "vitest";
import { getHealth } from "./health";

describe("getHealth", () => {
  it("reports ok status for the default service", () => {
    expect(getHealth()).toEqual({ status: "ok", service: "web" });
  });

  it("uses the provided service name", () => {
    expect(getHealth("marketing").service).toBe("marketing");
  });
});
