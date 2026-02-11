/**
 * Scheduled archival: D1 → VictoriaLogs (two-phase)
 *
 * Phase 1 — archiveEmails:
 *   1. Read un-archived emails from D1 (archivedAt IS NULL)
 *   2. Batch-insert into VictoriaLogs via victoria-orm
 *   3. Mark as archived in D1 (set archivedAt = now)
 *
 * Phase 2 — cleanupArchived:
 *   4. Read archived emails from D1 (archivedAt IS NOT NULL)
 *   5. Verify each exists in VictoriaLogs by querying for its ID
 *   6. Hard-delete verified emails from D1
 *
 * Both phases run on the cron schedule defined in wrangler.jsonc.
 */

import { drizzle } from "drizzle-orm/d1";
import { isNull, isNotNull, inArray } from "drizzle-orm";
import { emails } from "@/providers/db/schema";
import { type Bindings, getVL } from "@/providers/victoria";
import { vlEmails } from "@/providers/victoria/schema";

const BATCH_SIZE = 500;
const D1_VAR_LIMIT = 95; // Reserve headroom for SET clause params (updated_at, archived_at, etc.)

// ── Phase 1: Archive D1 → VictoriaLogs ──

export async function archiveEmails(env: Bindings): Promise<{
    archived: number;
    batches: number;
    durationMs: number;
}> {
    const start = Date.now();
    const db = drizzle(env.DB);
    const vl = getVL(env);

    // 1. Fetch un-archived emails
    const pending = await db
        .select()
        .from(emails)
        .where(isNull(emails.archivedAt))
        .limit(BATCH_SIZE);

    if (pending.length === 0) {
        console.log("[archival] No pending emails to archive");
        return { archived: 0, batches: 0, durationMs: Date.now() - start };
    }

    console.log(`[archival] Found ${pending.length} emails to archive`);

    // 2. Insert into VictoriaLogs
    const records = pending.map((email) => ({
        _msg: `Email: "${email.subject}" → ${email.to}`,
        id: String(email.id),
        to: email.to,
        from: email.from,
        subject: email.subject,
        status: "delivered",
    }));

    await vl.insert(vlEmails).values(records);
    console.log(`[archival] Inserted ${records.length} records into VictoriaLogs`);

    // 3. Mark as archived in D1
    const ids = pending.map((e) => e.id);
    const now = new Date();

    let batches = 0;
    for (let i = 0; i < ids.length; i += D1_VAR_LIMIT) {
        const chunk = ids.slice(i, i + D1_VAR_LIMIT);
        await db
            .update(emails)
            .set({ archivedAt: now })
            .where(inArray(emails.id, chunk));
        batches++;
    }

    console.log(
        `[archival] Marked ${ids.length} emails as archived in ${batches} batches`
    );

    return {
        archived: ids.length,
        batches,
        durationMs: Date.now() - start,
    };
}

// ── Phase 2: Verify in VictoriaLogs → Hard-delete from D1 ──

export async function cleanupArchived(env: Bindings): Promise<{
    verified: number;
    deleted: number;
    failed: number;
    durationMs: number;
}> {
    const start = Date.now();
    const db = drizzle(env.DB);
    const vl = getVL(env);

    // 4. Read archived emails from D1 (soft-deleted, pending cleanup)
    const archived = await db
        .select({ id: emails.id })
        .from(emails)
        .where(isNotNull(emails.archivedAt))
        .limit(BATCH_SIZE);

    if (archived.length === 0) {
        console.log("[cleanup] No archived emails pending cleanup");
        return { verified: 0, deleted: 0, failed: 0, durationMs: Date.now() - start };
    }

    console.log(`[cleanup] Found ${archived.length} archived emails to verify`);

    // 5. Batch-verify emails in VictoriaLogs
    //    Combine IDs into OR queries: id:"1" OR id:"2" OR ... (50 per query)
    //    Run up to CONCURRENCY queries in parallel
    const VERIFY_BATCH = 50;
    const CONCURRENCY = 5;
    const verifiedIds: number[] = [];
    const failedIds: number[] = [];

    const allIds = archived.map((r) => r.id);
    const verifyChunks: number[][] = [];
    for (let i = 0; i < allIds.length; i += VERIFY_BATCH) {
        verifyChunks.push(allIds.slice(i, i + VERIFY_BATCH));
    }

    // Process verify chunks with bounded concurrency
    for (let i = 0; i < verifyChunks.length; i += CONCURRENCY) {
        const concurrent = verifyChunks.slice(i, i + CONCURRENCY);

        const results = await Promise.allSettled(
            concurrent.map(async (chunk) => {
                const orClause = chunk.map((id) => `id:"${id}"`).join(" OR ");
                const query = `_stream:{stream="email-archive"} AND (${orClause})`;
                const result = await vl.rawQuery(query, { limit: chunk.length });

                // Extract found IDs from the result logs
                const foundIds = new Set(
                    result.logs
                        .map((log: Record<string, unknown>) => Number(log.id))
                        .filter((id: number) => !isNaN(id))
                );

                return { chunk, foundIds };
            })
        );

        for (const result of results) {
            if (result.status === "fulfilled") {
                const { chunk, foundIds } = result.value;
                for (const id of chunk) {
                    if (foundIds.has(id)) {
                        verifiedIds.push(id);
                    } else {
                        failedIds.push(id);
                    }
                }
            } else {
                // If the whole batch query failed, mark all as failed
                const idx = results.indexOf(result);
                const chunk = concurrent[idx];
                failedIds.push(...chunk);
            }
        }
    }

    console.log(
        `[cleanup] Verified: ${verifiedIds.length}, Failed: ${failedIds.length}`
    );

    // 6. Hard-delete verified emails from D1
    let deleted = 0;
    for (let i = 0; i < verifiedIds.length; i += D1_VAR_LIMIT) {
        const chunk = verifiedIds.slice(i, i + D1_VAR_LIMIT);
        await db.delete(emails).where(inArray(emails.id, chunk));
        deleted += chunk.length;
    }

    console.log(`[cleanup] Deleted ${deleted} verified emails from D1`);

    if (failedIds.length > 0) {
        console.warn(
            `[cleanup] ${failedIds.length} emails NOT found in VictoriaLogs — kept in D1:`,
            failedIds
        );
    }

    return {
        verified: verifiedIds.length,
        deleted,
        failed: failedIds.length,
        durationMs: Date.now() - start,
    };
}
