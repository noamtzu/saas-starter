/**
 * Domain errors. Server actions translate these into user-facing messages;
 * anything else is treated as unexpected and logged.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ForbiddenError extends DomainError {}
export class NotFoundError extends DomainError {}
export class ValidationError extends DomainError {}
export class ConflictError extends DomainError {}

export class PlanLimitError extends DomainError {
  constructor(
    readonly resource: string,
    readonly limit: number,
  ) {
    super(`Your plan allows ${limit} ${resource}. Upgrade to add more.`);
  }
}
