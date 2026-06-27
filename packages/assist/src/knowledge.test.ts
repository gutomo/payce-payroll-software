import { describe, expect, it } from "vitest";
import { retrieve, tokenize } from "./knowledge";
import type { KnowledgeArticle } from "./types";

const ARTICLES: KnowledgeArticle[] = [
  {
    id: "a-leave",
    title: "Applying for leave",
    body: "To apply for leave, open MyHR, choose a leave type and submit the dates. Your manager approves it.",
    tags: ["leave", "timeoff"],
  },
  {
    id: "a-pay",
    title: "When you get paid",
    body: "Salaries are paid on the last working day of each month into your registered bank account.",
    tags: ["payroll", "payday"],
  },
  {
    id: "a-claims",
    title: "Submitting an expense claim",
    body: "Submit claims with a receipt attached. Finance reviews and reimburses approved claims with payroll.",
    tags: ["claims", "expenses"],
  },
];

describe("tokenize", () => {
  it("lowercases, splits on non-alphanumerics, and drops stopwords and single chars", () => {
    expect(tokenize("How do I apply for Leave?")).toEqual(["apply", "leave"]);
  });

  it("returns an empty list for stopword-only input", () => {
    expect(tokenize("how do I")).toEqual([]);
  });
});

describe("retrieve", () => {
  it("ranks the most relevant article first", () => {
    const results = retrieve(ARTICLES, "how do I apply for leave?");
    expect(results[0]?.article.id).toBe("a-leave");
    expect(results[0]?.score).toBeGreaterThan(0);
  });

  it("matches on a title or tag more strongly than body-only", () => {
    const results = retrieve(ARTICLES, "when is payday?");
    expect(results[0]?.article.id).toBe("a-pay");
  });

  it("excludes articles with no token overlap", () => {
    const results = retrieve(ARTICLES, "office parking policy");
    expect(results).toHaveLength(0);
  });

  it("honours topK", () => {
    const results = retrieve(ARTICLES, "leave pay claims", 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("is deterministic across calls", () => {
    const a = retrieve(ARTICLES, "expense claim receipt");
    const b = retrieve(ARTICLES, "expense claim receipt");
    expect(a).toEqual(b);
    expect(a[0]?.article.id).toBe("a-claims");
  });
});
