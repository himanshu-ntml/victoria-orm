/**
 * Scheduled archival: D1 → VictoriaLogs
 *
 * 1. Read un-archived emails from D1 (archivedAt IS NULL)
 * 2. Batch-insert into VictoriaLogs via victoria-orm
 * 3. Mark as archived in D1 (set archivedAt = now)
 *
 * Runs on the cron schedule defined in wrangler.jsonc
 */

import { drizzle } from "drizzle-orm/d1";
import { isNull, inArray } from "drizzle-orm";
import { emails } from "@/providers/db/schema";
import { type Bindings, getVL } from "@/providers/victoria";
import { vlEmails } from "@/providers/victoria/schema";

const BATCH_SIZE = 500;

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
        // dataSent stays in D1 only — no need to duplicate it in VictoriaLogs
    }));

    await vl.insert(vlEmails).values(records);
    console.log(`[archival] Inserted ${records.length} records into VictoriaLogs`);

    // 3. Mark as archived in D1
    const ids = pending.map((e) => e.id);
    const now = new Date();

    // D1 has a variable limit, batch the update
    const updateBatchSize = 100;
    let batches = 0;
    for (let i = 0; i < ids.length; i += updateBatchSize) {
        const chunk = ids.slice(i, i + updateBatchSize);
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
