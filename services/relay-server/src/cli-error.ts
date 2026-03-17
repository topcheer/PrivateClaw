export class RelayCliUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayCliUserError";
  }
}
