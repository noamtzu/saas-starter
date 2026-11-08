import { ForbiddenError } from "@/server/errors";

export const ROLES = ["owner", "admin", "member"] as const;
export type Role = (typeof ROLES)[number];

const RANK: Record<Role, number> = { member: 0, admin: 1, owner: 2 };

/**
 * The minimum role required for each action. Keeping this as data (rather than
 * `if` statements spread across handlers) makes the policy reviewable in one
 * place and trivially testable.
 */
const MINIMUM_ROLE = {
  "org:view": "member",
  "org:rename": "admin",
  "project:create": "member",
  "project:delete": "admin",
  "member:invite": "admin",
  "member:changeRole": "admin",
  "member:remove": "admin",
  "billing:view": "member",
  "billing:manage": "owner",
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof MINIMUM_ROLE;

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function atLeast(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}

export function can(role: Role, permission: Permission): boolean {
  return atLeast(role, MINIMUM_ROLE[permission]);
}

export function authorize(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new ForbiddenError(`Your role (${role}) cannot perform "${permission}".`);
  }
}

/** Roles an actor may hand out, via invitation or role change. Only owners create owners. */
export function assignableRoles(actor: Role): Role[] {
  if (actor === "owner") return ["owner", "admin", "member"];
  if (actor === "admin") return ["admin", "member"];
  return [];
}

export function canAssignRole(actor: Role, role: Role): boolean {
  return assignableRoles(actor).includes(role);
}

/** Owners manage anyone; admins manage only plain members. */
export function canManage(actor: Role, target: Role): boolean {
  if (actor === "owner") return true;
  return actor === "admin" && target === "member";
}

type RoleChange = {
  actor: Role;
  target: Role;
  next: Role;
  isSelf: boolean;
  ownerCount: number;
};

export function assertCanChangeRole({ actor, target, next, isSelf, ownerCount }: RoleChange): void {
  if (target === next) return;
  if (target === "owner" && ownerCount <= 1) {
    throw new ForbiddenError("An organisation needs at least one owner. Promote someone else first.");
  }
  if (isSelf) {
    // Demoting yourself is allowed (subject to the last-owner rule); promoting yourself is not.
    if (atLeast(next, actor)) throw new ForbiddenError("You cannot promote yourself.");
    return;
  }
  authorize(actor, "member:changeRole");
  if (!canManage(actor, target)) throw new ForbiddenError(`An ${actor} cannot manage an ${target}.`);
  if (!canAssignRole(actor, next)) throw new ForbiddenError(`An ${actor} cannot grant the ${next} role.`);
}

type Removal = { actor: Role; target: Role; isSelf: boolean; ownerCount: number };

export function assertCanRemove({ actor, target, isSelf, ownerCount }: Removal): void {
  if (target === "owner" && ownerCount <= 1) {
    throw new ForbiddenError("The last owner cannot leave or be removed.");
  }
  if (isSelf) return; // anyone may leave
  authorize(actor, "member:remove");
  if (!canManage(actor, target)) throw new ForbiddenError(`An ${actor} cannot remove an ${target}.`);
}
