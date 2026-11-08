import { describe, expect, it } from "vitest";
import {
  ROLES,
  assertCanChangeRole,
  assertCanRemove,
  assignableRoles,
  authorize,
  can,
  canManage,
  isRole,
  type Permission,
  type Role,
} from "@/server/auth/permissions";
import { ForbiddenError } from "@/server/errors";

describe("can()", () => {
  // The full matrix, written out so a policy change shows up as a readable diff.
  const matrix: Record<Permission, Record<Role, boolean>> = {
    "org:view": { owner: true, admin: true, member: true },
    "org:rename": { owner: true, admin: true, member: false },
    "project:create": { owner: true, admin: true, member: true },
    "project:delete": { owner: true, admin: true, member: false },
    "member:invite": { owner: true, admin: true, member: false },
    "member:changeRole": { owner: true, admin: true, member: false },
    "member:remove": { owner: true, admin: true, member: false },
    "billing:view": { owner: true, admin: true, member: true },
    "billing:manage": { owner: true, admin: false, member: false },
  };

  for (const [permission, byRole] of Object.entries(matrix) as [Permission, Record<Role, boolean>][]) {
    for (const role of ROLES) {
      it(`${role} ${byRole[role] ? "can" : "cannot"} ${permission}`, () => {
        expect(can(role, permission)).toBe(byRole[role]);
      });
    }
  }

  it("authorize() throws ForbiddenError when denied", () => {
    expect(() => authorize("member", "billing:manage")).toThrow(ForbiddenError);
    expect(() => authorize("owner", "billing:manage")).not.toThrow();
  });
});

describe("isRole()", () => {
  it("accepts known roles only", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("superuser")).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});

describe("role assignment", () => {
  it("only owners can create owners", () => {
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("admin")).toEqual(["admin", "member"]);
    expect(assignableRoles("member")).toEqual([]);
  });

  it("admins manage members but not other admins or owners", () => {
    expect(canManage("admin", "member")).toBe(true);
    expect(canManage("admin", "admin")).toBe(false);
    expect(canManage("admin", "owner")).toBe(false);
    expect(canManage("owner", "owner")).toBe(true);
    expect(canManage("member", "member")).toBe(false);
  });
});

describe("assertCanChangeRole()", () => {
  const base = { isSelf: false, ownerCount: 2 };

  it("lets an owner promote a member to admin", () => {
    expect(() => assertCanChangeRole({ ...base, actor: "owner", target: "member", next: "admin" })).not.toThrow();
  });

  it("lets an admin promote a member to admin", () => {
    expect(() => assertCanChangeRole({ ...base, actor: "admin", target: "member", next: "admin" })).not.toThrow();
  });

  it("stops an admin from granting owner", () => {
    expect(() => assertCanChangeRole({ ...base, actor: "admin", target: "member", next: "owner" })).toThrow(
      ForbiddenError,
    );
  });

  it("stops an admin from demoting another admin", () => {
    expect(() => assertCanChangeRole({ ...base, actor: "admin", target: "admin", next: "member" })).toThrow(
      ForbiddenError,
    );
  });

  it("stops a member from changing anyone", () => {
    expect(() => assertCanChangeRole({ ...base, actor: "member", target: "member", next: "admin" })).toThrow(
      ForbiddenError,
    );
  });

  it("never demotes the last owner, even by themselves", () => {
    const lastOwner = { actor: "owner" as const, target: "owner" as const, next: "admin" as const, ownerCount: 1 };
    expect(() => assertCanChangeRole({ ...lastOwner, isSelf: true })).toThrow(/at least one owner/);
    expect(() => assertCanChangeRole({ ...lastOwner, isSelf: false })).toThrow(/at least one owner/);
  });

  it("allows an owner to step down when another owner exists", () => {
    expect(() =>
      assertCanChangeRole({ actor: "owner", target: "owner", next: "member", isSelf: true, ownerCount: 2 }),
    ).not.toThrow();
  });

  it("does not let anyone promote themselves", () => {
    expect(() =>
      assertCanChangeRole({ actor: "admin", target: "admin", next: "owner", isSelf: true, ownerCount: 1 }),
    ).toThrow(/promote yourself/);
  });

  it("is a no-op when the role does not change", () => {
    expect(() =>
      assertCanChangeRole({ actor: "member", target: "owner", next: "owner", isSelf: false, ownerCount: 1 }),
    ).not.toThrow();
  });
});

describe("assertCanRemove()", () => {
  it("lets anyone leave", () => {
    expect(() => assertCanRemove({ actor: "member", target: "member", isSelf: true, ownerCount: 1 })).not.toThrow();
  });

  it("keeps the last owner in place", () => {
    expect(() => assertCanRemove({ actor: "owner", target: "owner", isSelf: true, ownerCount: 1 })).toThrow(
      /last owner/,
    );
  });

  it("lets an admin remove a member but not an admin", () => {
    expect(() => assertCanRemove({ actor: "admin", target: "member", isSelf: false, ownerCount: 1 })).not.toThrow();
    expect(() => assertCanRemove({ actor: "admin", target: "admin", isSelf: false, ownerCount: 1 })).toThrow(
      ForbiddenError,
    );
  });

  it("stops a member from removing others", () => {
    expect(() => assertCanRemove({ actor: "member", target: "member", isSelf: false, ownerCount: 1 })).toThrow(
      ForbiddenError,
    );
  });
});
