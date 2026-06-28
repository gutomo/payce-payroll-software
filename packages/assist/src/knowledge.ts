/**
 * Lexical retrieval over a tenant's knowledge base. Deterministic and dependency-free: no embeddings,
 * no network — the API passes the candidate articles (already tenant-scoped by RLS) and we rank them
 * by token overlap with the query. Good enough for L1 FAQ routing and trivially testable; the model
 * (when Bedrock is wired) only ever phrases from these retrieved snippets, never from raw recall.
 */
import type { KnowledgeArticle, RetrievedArticle } from "./types";

/** Common English words that carry no retrieval signal; dropped before scoring. */
const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "is",
  "are",
  "do",
  "does",
  "how",
  "what",
  "when",
  "where",
  "can",
  "i",
  "my",
  "me",
  "you",
  "your",
  "it",
  "this",
  "that",
  "with",
  "about",
  "please",
  "tell",
]);

/** Lowercase, split on non-alphanumerics, drop stopwords and single characters. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

/** A title hit is worth more than a body hit: titles are curated, bodies are noisy. */
const TITLE_WEIGHT = 2;
const TAG_WEIGHT = 1.5;

/**
 * Score one article against the query's token set. The score is the fraction of distinct query
 * tokens that appear anywhere in the article (title/tags weighted up), capped at 1. Returns 0 when
 * nothing matches, so the caller can threshold on "any signal".
 */
function scoreArticle(article: KnowledgeArticle, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 0;
  const titleTokens = new Set(tokenize(article.title));
  const tagTokens = new Set((article.tags ?? []).flatMap(tokenize));
  const bodyTokens = new Set(tokenize(article.body));

  let matched = 0;
  for (const token of new Set(queryTokens)) {
    if (titleTokens.has(token)) matched += TITLE_WEIGHT;
    else if (tagTokens.has(token)) matched += TAG_WEIGHT;
    else if (bodyTokens.has(token)) matched += 1;
  }
  const distinctQueryTokens = new Set(queryTokens).size;
  return Math.min(1, matched / (distinctQueryTokens * TITLE_WEIGHT));
}

/**
 * Rank articles by relevance to `query`, returning the top `topK` with a positive score, highest
 * first. Ties break on the article id for stable, deterministic ordering.
 */
export function retrieve(
  articles: readonly KnowledgeArticle[],
  query: string,
  topK = 3,
): RetrievedArticle[] {
  const queryTokens = tokenize(query);
  return articles
    .map((article) => ({ article, score: scoreArticle(article, queryTokens) }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.article.id.localeCompare(b.article.id))
    .slice(0, Math.max(0, topK));
}
