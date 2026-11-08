import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { Pool } from "pg";

/**
 * Signs a fresh user in without going through email: it creates the user and a
 * database session row, exactly as Auth.js would after a magic-link click, and
 * hands Playwright the session cookie. The app itself has no test-only login.
 */
export default async function globalSetup() {
  try {
    process.loadEnvFile();
  } catch {
    // CI provides DATABASE_URL directly.
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const userId = `e2e-${randomUUID()}`;
  const sessionToken = randomBytes(32).toString("hex");
  try {
    await pool.query(
      `insert into users (id, email, name, email_verified) values ($1, $2, 'E2E Tester', now())`,
      [userId, `${userId}@example.com`],
    );
    await pool.query(
      `insert into sessions (session_token, user_id, expires) values ($1, $2, now() + interval '1 day')`,
      [sessionToken, userId],
    );
  } finally {
    await pool.end();
  }

  mkdirSync("e2e/.auth", { recursive: true });
  writeFileSync(
    "e2e/.auth/state.json",
    JSON.stringify({
      cookies: [
        {
          name: "authjs.session-token",
          value: sessionToken,
          domain: "localhost",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 86_400,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    }),
  );
}
