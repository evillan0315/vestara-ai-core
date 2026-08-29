/**
 * Evidence framework errors (ADR-012). Errors preserve provenance so a
 * conclusion can never be constructed from missing or mismatched evidence.
 */

export class EvidenceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'EvidenceError';
    this.code = code;
  }
}

export class MissingBaselineError extends EvidenceError {
  constructor(message = 'Baseline evidence snapshot is required for comparison') {
    super('evidence.missing-baseline', message);
    this.name = 'MissingBaselineError';
  }
}

export class MismatchedEvidenceTypeError extends EvidenceError {
  constructor(baselineType: string, currentType: string) {
    super('evidence.mismatched-type', `Cannot compare evidence of different types: ${baselineType} vs ${currentType}`);
    this.name = 'MismatchedEvidenceTypeError';
  }
}
