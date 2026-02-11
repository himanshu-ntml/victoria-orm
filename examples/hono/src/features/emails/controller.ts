/**
 * Emails feature — controller (D1 operations)
 */

import type { Context } from "hono";
import { drizzle } from "drizzle-orm/d1";
import { eq, isNull, desc, isNotNull, count } from "drizzle-orm";
import type { Bindings } from "@/providers/victoria";
import { emails, type NewEmail } from "@/providers/db/schema";
import { archiveEmails, cleanupArchived } from "@/scheduler/archival";

function getDB(env: Bindings) {
    return drizzle(env.DB);
}

// List emails from D1
export async function listEmails(c: Context<{ Bindings: Bindings }>) {
    const db = getDB(c.env);
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);
    const archived = c.req.query("archived");

    try {
        let query = db
            .select()
            .from(emails)
            .orderBy(desc(emails.createdAt))
            .limit(limit)
            .offset(offset);

        // Filter by archive status
        if (archived === "false") {
            query = query.where(isNull(emails.archivedAt)) as typeof query;
        }

        const result = await query;
        return c.json({ data: result, count: result.length });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: message }, 500);
    }
}

// Get single email by ID
export async function getEmail(c: Context<{ Bindings: Bindings }>) {
    const db = getDB(c.env);
    const id = parseInt(c.req.param("id"), 10);

    try {
        const [result] = await db
            .select()
            .from(emails)
            .where(eq(emails.id, id))
            .limit(1);

        if (!result) {
            return c.json({ error: "Email not found" }, 404);
        }
        return c.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: message }, 500);
    }
}

//get email count archived and not archived
export async function getEmailCount(c: Context<{ Bindings: Bindings }>) {
    const db = getDB(c.env);
    try {
        const [active] = await db.select({ count: count() }).from(emails).where(isNull(emails.archivedAt));
        const [archived] = await db.select({ count: count() }).from(emails).where(isNotNull(emails.archivedAt));
        return c.json({ count: active.count, archivedCount: archived.count });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: message }, 500);
    }
}

// Create a new email
export async function createEmail(c: Context<{ Bindings: Bindings }>) {
    const db = getDB(c.env);

    try {
        const body = await c.req.json<Omit<NewEmail, "id" | "createdAt" | "updatedAt" | "archivedAt">>();
        const [result] = await db.insert(emails).values(body).returning();
        return c.json(result, 201);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: message }, 500);
    }
}

// Phase 1: Archive D1 → VictoriaLogs
export async function triggerArchive(c: Context<{ Bindings: Bindings }>) {
    try {
        const result = await archiveEmails(c.env);
        return c.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: message }, 500);
    }
}

// Phase 2: Verify in VictoriaLogs → Hard-delete from D1
export async function triggerCleanup(c: Context<{ Bindings: Bindings }>) {
    try {
        const result = await cleanupArchived(c.env);
        return c.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: message }, 500);
    }
}
