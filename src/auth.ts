import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import GitHub from "next-auth/providers/github";
import Nodemailer from "next-auth/providers/nodemailer";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db/client";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { authProviders } from "@/lib/env";

const providers: Provider[] = [];

if (authProviders.github) {
  // Reads AUTH_GITHUB_ID / AUTH_GITHUB_SECRET from the environment.
  providers.push(GitHub);
}

if (authProviders.email) {
  const smtp = process.env.EMAIL_SERVER;
  providers.push(
    Nodemailer({
      // Auth.js insists on a server value. Without SMTP (local development only) the
      // placeholder is never contacted, because sendVerificationRequest below prints
      // the link to the server log instead.
      server: smtp || "smtp://localhost:1025",
      from: process.env.EMAIL_FROM ?? "SaaS Starter <no-reply@example.com>",
      ...(smtp
        ? {}
        : {
            sendVerificationRequest: ({ identifier, url }) => {
              console.info(`\n[auth] Magic link for ${identifier}:\n${url}\n`);
            },
          }),
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  // Database sessions can be revoked server-side (sign out everywhere, ban a user).
  session: { strategy: "database" },
  providers,
  pages: { signIn: "/sign-in", verifyRequest: "/sign-in/check-email" },
  trustHost: true,
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      session.user.isPlatformAdmin = Boolean((user as { isPlatformAdmin?: boolean }).isPlatformAdmin);
      return session;
    },
  },
});
