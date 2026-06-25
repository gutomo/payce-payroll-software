import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { modules } from "@/lib/site";
import HomePage from "./page";

describe("marketing home page", () => {
  it("renders the hero headline as the page h1", () => {
    render(<HomePage />);
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1).toHaveTextContent(/global payroll/i);
  });

  it("renders a card for every product module", () => {
    render(<HomePage />);
    for (const module of modules) {
      const card = screen.getByTestId(`module-${module.key}`);
      expect(card).toHaveTextContent(module.name);
    }
  });

  it("exposes primary calls to action", () => {
    render(<HomePage />);
    expect(screen.getAllByRole("link", { name: /book a demo/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /take a tour/i }).length).toBeGreaterThan(0);
  });
});
