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
import { victoriaLogs, stream, text, enm } from "victoria-orm";
import { emails } from "./db/schema";

// VictoriaLogs email stream schema (matches the D1 fields we archive)
const emailArchive = stream("email-archive", {
    id: text("id"),
    to: text("to").notNull(),
    from: text("from").notNull(),
    subject: text("subject").notNull(),
    status: text("status"),
    dataSent: text("dataSent"),
});

const BATCH_SIZE = 500;

interface Env {
    DB: D1Database;
    VICTORIA_BASE_URL: string;
    VICTORIA_TOKEN: string;
}

export async function archiveEmails(env: Env): Promise<{
    archived: number;
    batches: number;
    durationMs: number;
}> {
    const start = Date.now();
    const db = drizzle(env.DB);
    const vl = victoriaLogs({
        url: env.VICTORIA_BASE_URL,
        token: env.VICTORIA_TOKEN || "",
        logger: true,
    });

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
        id: String(email.id),
        to: email.to,
        from: email.from,
        subject: email.subject,
        status: "delivered",
        dataSent: email.dataSent || "",
    }));

    await vl.insert(emailArchive).values(records);
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
