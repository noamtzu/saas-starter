import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { invitations, memberships, organizations, users, type Invitation } from "@/db/schema";
import { authorize, canAssignRole, type Role } from "@/server/auth/permissions";
import { assertWithinLimit, resolvePlan } from "@/server/billing/plans";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { lockOrg, withTenant, type TenantContext } from "./rls";

const INVITE_TTL_DAYS = 7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function listPendingInvitations(ctx: TenantContext): Promise<Invitation[]> {
  authorize(ctx.role, "member:invite");
  return withTenant(ctx, (tx) =>
    tx
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.orgId, ctx.orgId),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .orderBy(desc(invitations.createdAt)),
  );
}

/**
 * Creates an invitation and returns the raw token exactly once. Only its hash
 * is stored, so a database leak does not leak usable invite links.
 */
export async function createInvitation(
  ctx: TenantContext,
  input: { email: string; role: Role },
): Promise<{ invitation: Invitation; token: string }> {
  authorize(ctx.role, "member:invite");
  if (!canAssignRole(ctx.role, input.role)) {
    throw new ForbiddenError(`An ${ctx.role} cannot invite someone as ${input.role}.`);
  }
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new ValidationError("Enter a valid email address.");

  return withTenant(ctx, async (tx) => {
    await lockOrg(tx, ctx.orgId);

    const [existing] = await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.orgId, ctx.orgId), sql`lower(${users.email}) = ${email}`));
    if (existing) throw new ConflictError(`${email} is already a member.`);

    // Seats = members + open invitations, so the limit cannot be bypassed by inviting in bulk.
    const [org] = await tx
      .select({ subscriptionStatus: organizations.subscriptionStatus })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId));
    const [memberCount] = await tx
      .select({ n: count() })
      .from(memberships)
      .where(eq(memberships.orgId, ctx.orgId));
    const [openInvites] = await tx
      .select({ n: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.orgId, ctx.orgId),
          ne(invitations.email, email), // a re-invite replaces its own seat
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      );
    assertWithinLimit(resolvePlan(org!), "members", (memberCount?.n ?? 0) + (openInvites?.n ?? 0));

    // Re-inviting replaces any previous open (possibly expired) invitation.
    await tx
      .delete(invitations)
      .where(
        and(
          eq(invitations.orgId, ctx.orgId),
          eq(invitations.email, email),
          isNull(invitations.acceptedAt),
        ),
      );

    const token = randomBytes(32).toString("base64url");
    const [invitation] = await tx
      .insert(invitations)
      .values({
        orgId: ctx.orgId,
        email,
        role: input.role,
        tokenHash: hashInviteToken(token),
        invitedById: ctx.userId,
        expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      })
      .returning();
    return { invitation: invitation!, token };
  });
}

export async function revokeInvitation(ctx: TenantContext, invitationId: string): Promise<void> {
  authorize(ctx.role, "member:invite");
  await withTenant(ctx, async (tx) => {
    const deleted = await tx
      .delete(invitations)
      .where(and(eq(invitations.id, invitationId), eq(invitations.orgId, ctx.orgId)))
      .returning({ id: invitations.id });
    if (deleted.length === 0) throw new NotFoundError("Invitation not found.");
  });
}

export type InvitationPreview = { orgName: string; email: string; role: Role; expired: boolean };

/** System path: the invitee is not a member yet, so RLS cannot admit this read. */
export async function previewInvitation(token: string): Promise<InvitationPreview | null> {
  const [row] = await db
    .select({
      orgName: organizations.name,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      acceptedAt: invitations.acceptedAt,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .where(eq(invitations.tokenHash, hashInviteToken(token)));
  if (!row || row.acceptedAt) return null;
  return { orgName: row.orgName, email: row.email, role: row.role, expired: row.expiresAt < new Date() };
}

/**
 * System path. Checks, in one transaction, that the token is valid, unexpired,
 * unused and addressed to the signed-in user's email, then adds the membership.
 */
export async function acceptInvitation(
  user: { id: string; email: string | null | undefined },
  token: string,
): Promise<{ orgSlug: string }> {
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, hashInviteToken(token)))
      .for("update");
    if (!invite || invite.acceptedAt) throw new NotFoundError("This invitation is no longer valid.");
    if (invite.expiresAt < new Date()) throw new ForbiddenError("This invitation has expired.");
    if (!user.email || user.email.toLowerCase() !== invite.email) {
      throw new ForbiddenError(`This invitation was sent to ${invite.email}. Sign in with that address.`);
    }

    await tx
      .insert(memberships)
      .values({ orgId: invite.orgId, userId: user.id, role: invite.role })
      .onConflictDoNothing();
    await tx
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, invite.id));

    const [org] = await tx
      .select({ slug: organizations.slug })
      .from(organizations)
      .where(eq(organizations.id, invite.orgId));
    return { orgSlug: org!.slug };
  });
}
