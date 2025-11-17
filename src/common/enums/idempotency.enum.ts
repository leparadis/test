export enum IdempotencyScope {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export enum IdempotencyStatus {
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum WalletResponseStatus {
  OK = 'OK',
  REJECTED = 'REJECTED',
}
