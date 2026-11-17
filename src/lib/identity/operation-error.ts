/** Deliberately structured errors from trusted Identity transaction work.
 * Preserved through rollback; raw database/provider errors remain sanitized. */
export class IdentityOperationError extends Error {
  readonly status: number;
  readonly error: string;
  constructor(status: number, error: string) { super(error); this.status = status; this.error = error; }
}
