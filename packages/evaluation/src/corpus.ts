/**
 * Corpus types — the assertion format for calibrating understanding.
 *
 * Each corpus entry declares truths about a repository that the
 * UnderstandingEngine should derive. The harness evaluates these
 * assertions and reports pass/fail per field.
 *
 * Assertions are intentionally incomplete — they assert specific
 * truths, not entire snapshots. This keeps them stable as the
 * understanding model evolves.
 */

export interface LanguageAssertion {
  readonly primary: string;
  readonly minimumConfidence?: number;
}

export interface FrameworkAssertion {
  readonly kind: string;
  readonly minimumConfidence?: number;
}

export interface ArchitectureAssertion {
  readonly kind: string;
  readonly minimumConfidence?: number;
}

export interface MaturityAssertion {
  readonly level: string;
  readonly minimumConfidence?: number;
}

export interface RiskAssertion {
  readonly contains: readonly string[];
}

export interface HealthAssertion {
  readonly scoreMin: number;
  readonly scoreMax: number;
}

export interface CorpusEntryAssertions {
  readonly language: LanguageAssertion;
  readonly framework?: FrameworkAssertion;
  readonly architecture: ArchitectureAssertion;
  readonly maturity: MaturityAssertion;
  readonly risks: RiskAssertion;
  readonly health?: HealthAssertion;
}

export interface CorpusEntry {
  readonly name: string;
  readonly path: string;
  readonly assertions: CorpusEntryAssertions;
}

export interface Corpus {
  readonly entries: readonly CorpusEntry[];
}
