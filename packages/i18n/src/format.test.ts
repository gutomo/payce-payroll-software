import { describe, expect, it } from "vitest";
import {
  currencyDecimals,
  formatDate,
  formatDateTime,
  formatDays,
  formatMoney,
  formatNumber,
} from "./format";

describe("currencyDecimals", () => {
  it("knows each currency's minor-unit exponent", () => {
    expect(currencyDecimals("USD")).toBe(2);
    expect(currencyDecimals("EUR")).toBe(2);
    expect(currencyDecimals("JPY")).toBe(0);
    expect(currencyDecimals("BHD")).toBe(3);
  });

  it("falls back to 2 for an invalid code", () => {
    expect(currencyDecimals("US")).toBe(2);
  });
});

describe("formatMoney", () => {
  it("formats minor units with the currency's own decimals and locale", () => {
    expect(formatMoney(642018, "USD", "en-US")).toBe("$6,420.18");
    expect(formatMoney(642018, "GBP", "en-GB")).toBe("£6,420.18");
  });

  it("respects zero-decimal currencies (JPY: minor units == major units)", () => {
    const jpy = formatMoney(6420, "JPY", "en-US");
    expect(jpy).toContain("6,420");
    expect(jpy).not.toContain("."); // no fractional part for a zero-decimal currency
  });

  it("respects locale grouping and decimal marks (de-DE / EUR)", () => {
    const eur = formatMoney(642018, "EUR", "de-DE");
    expect(eur).toContain("6.420,18");
    expect(eur).toContain("€");
  });

  it("accepts bigint minor units", () => {
    expect(formatMoney(642018n, "USD", "en-US")).toBe("$6,420.18");
  });

  it("degrades gracefully for an unparseable currency code", () => {
    expect(formatMoney(100, "US", "en-US")).toContain("US");
  });
});

describe("formatNumber / formatDays", () => {
  it("localizes grouping and decimal separators", () => {
    expect(formatNumber(1234567.89, "en-US")).toBe("1,234,567.89");
    expect(formatNumber(1234567.89, "de-DE")).toBe("1.234.567,89");
  });

  it("formats day counts with at most two decimals", () => {
    expect(formatDays(18.5, "en-US")).toBe("18.5");
  });
});

describe("formatDate / formatDateTime", () => {
  it("formats an ISO date in UTC for the default locale", () => {
    expect(formatDate("2021-03-05T00:00:00.000Z")).toBe("Mar 5, 2021");
  });

  it("localizes the date for another locale", () => {
    const ja = formatDate("2021-03-05T00:00:00.000Z", "ja-JP");
    expect(ja).toContain("2021");
    expect(ja).not.toBe("Mar 5, 2021");
  });

  it("returns a hyphen for null/empty/invalid input", () => {
    expect(formatDate(null)).toBe("-");
    expect(formatDate("")).toBe("-");
    expect(formatDate("not-a-date")).toBe("-");
    expect(formatDateTime(undefined)).toBe("-");
  });

  it("includes a 24h time in date-time output", () => {
    expect(formatDateTime("2021-03-05T06:30:00.000Z", "en-GB")).toContain("06:30");
  });
});
