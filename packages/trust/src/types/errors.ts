export class TrustError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'TrustError';
    this.code = code;
  }
}

export class InsufficientEvidenceError extends TrustError {
  constructor(message = 'Not enough evidence to compute trust') {
    super(message, 'INSUFFICIENT_EVIDENCE');
    this.name = 'InsufficientEvidenceError';
  }
}

export class UnknownSourceError extends TrustError {
  constructor(sourceId: string) {
    super(`No trust data for source: ${sourceId}`, 'UNKNOWN_SOURCE');
    this.name = 'UnknownSourceError';
  }
}
