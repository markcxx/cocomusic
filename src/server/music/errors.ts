/** Error with an HTTP status, surfaced to the UI as `{ error }`. Platform errors extend it. */
export class CatalogError extends Error {
  constructor(message: string, public readonly status = 502) {
    super(message);
  }
}
