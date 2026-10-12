/** A rule of an instance refused the action; `code` is the API error code. */
export class GateRuleError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

export const refuse = (code: string, message: string): never => {
  throw new GateRuleError(code, message)
}
