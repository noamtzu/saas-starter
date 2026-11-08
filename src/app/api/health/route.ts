import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/** Liveness plus a database round-trip. Used by CI to know the app is ready. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
