import { describe, expect, it } from "vitest";
import { copyright, footerColumns, modules, primaryNav, site, valueProps } from "./site";

describe("site content", () => {
  it("exposes the four product modules with unique keys", () => {
    expect(modules.map((m) => m.name)).toEqual([
      "Operations Console",
      "Insights",
      "MyHR",
      "Assist",
    ]);
    expect(new Set(modules.map((m) => m.key)).size).toBe(modules.length);
  });

  it("uses only internal hrefs in nav and footer", () => {
    const links = [...primaryNav, ...footerColumns.flatMap((c) => c.links)];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.href.startsWith("/")).toBe(true);
      expect(link.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("renders a deterministic copyright line", () => {
    expect(copyright(2026)).toBe("© 2026 Payce. A demonstration project — synthetic data only.");
  });

  // PLAN.md §2: original copy only — no reference brand names or customer logos in our content.
  it("contains no third-party brand or customer names", () => {
    const corpus = [
      site.name,
      site.tagline,
      site.description,
      ...modules.flatMap((m) => [m.name, m.summary]),
      ...valueProps.flatMap((v) => [v.title, v.body]),
      ...footerColumns.flatMap((c) => [c.heading, ...c.links.map((l) => l.label)]),
    ]
      .join(" ")
      .toLowerCase();

    for (const banned of ["ramco", "bingo", "chia", "coca-cola", "nissan", "standard chartered"]) {
      expect(corpus).not.toContain(banned);
    }
  });
});
