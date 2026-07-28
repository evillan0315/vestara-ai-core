export class HistoryError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'HistoryError';
    this.code = code;
  }
}

export class RecordNotFoundError extends HistoryError {
  constructor(recordId: string) {
    super(`No record found: ${recordId}`, 'RECORD_NOT_FOUND');
    this.name = 'RecordNotFoundError';
  }
}

export class DuplicateRecordError extends HistoryError {
  constructor(recordId: string) {
    super(`Record already exists: ${recordId}`, 'DUPLICATE_RECORD');
    this.name = 'DuplicateRecordError';
  }
}
