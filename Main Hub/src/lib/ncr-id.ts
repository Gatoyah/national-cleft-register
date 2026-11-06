import { db, patients } from "@/db";
import { like, desc } from "drizzle-orm";

/**
 * Generate the next sequential NCR ID for the current year: NCR-YYYY-NNNNN.
 * Sequential (not random) so IDs never collide and are easy to read out.
 * Callers insert inside a retry loop; the UNIQUE constraint on ncr_id is the
 * final guard against a race between two simultaneous registrations.
 */
export async function nextNcrId(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `NCR-${year}-`;
  const [last] = await db
    .select({ ncrId: patients.ncrId })
    .from(patients)
    .where(like(patients.ncrId, `${prefix}%`))
    .orderBy(desc(patients.ncrId))
    .limit(1);
  const lastNum = last ? parseInt(last.ncrId.slice(prefix.length), 10) || 0 : 0;
  return `${prefix}${String(lastNum + 1).padStart(5, "0")}`;
}

/** Run an insert that needs a fresh NCR ID, retrying on a unique-constraint race. */
export async function withNcrId<T>(insert: (ncrId: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const ncrId = await nextNcrId();
    try {
      return await insert(ncrId);
    } catch (e) {
      const msg = String((e as Error)?.message || "") + String((e as { cause?: Error })?.cause?.message || "");
      if (!msg.includes("UNIQUE") || !msg.includes("ncr_id")) throw e;
    }
  }
  throw new Error("Could not allocate a unique NCR ID");
}
