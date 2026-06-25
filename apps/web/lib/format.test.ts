import { describe, expect, it } from "vitest";
import { formatDate } from "./format";

describe("formatDate", () => {
  it("formats an ISO date in UTC regardless of server timezone", () => {
    expect(formatDate("2021-03-05T00:00:00.000Z")).toBe("Mar 5, 2021");
  });

  it("returns an em dash for null, empty, or invalid input", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });
});
