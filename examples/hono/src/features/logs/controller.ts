/**
 * Logs feature — controller
 *
 * All VictoriaLogs query handlers live here.
 * Grouped by domain: email archive queries first, then general log operations.
 */

import type { Context } from "hono";
import { type Bindings, getVL } from "@/providers/victoria";
import { vlEmails, appLogs } from "@/providers/victoria/schema";

// ── Email Archive (VictoriaLogs) ──

/**
 * Query archived emails from VictoriaLogs.
 *
 * Emails older than one month are archived from D1 into VictoriaLogs.
 * This endpoint powers the "Archived Emails" tab in the UI, allowing
 * the team to search historical emails that are no longer in D1.
 */
export async function queryEmails(c: Context<{ Bindings: Bindings }>) {
    const vl = getVL(c.env);
    const limit = parseInt(c.req.query("limit") || "50", 10);

    try {
        const result = await vl.select().from(vlEmails).limit(limit).execute();
        return c.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: message }, 500);
    }
}






// ── General Logs (VictoriaLogs) ──

/** Raw query logs by LogsQL expression */
export async function queryLogs(c: Context<{ Bindings: Bindings }>) {
    const vl = getVL(c.env);
    const query = c.req.query("query") || "log.level:*";
    const limit = parseInt(c.req.query("limit") || "100", 10);
    const offset = parseInt(c.req.query("offset") || "0", 10);

    try {
        const result = await vl.rawQuery(query, { limit, offset });
        return c.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: message }, 500);
    }
}

/** Get total log count for a query */
export async function getStats(c: Context<{ Bindings: Bindings }>) {
    const vl = getVL(c.env);
    const query = c.req.query("query") || "*";

    try {
        const count = await vl.rawCount(query);
        return c.json({ query, count });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: message }, 500);
    }
}

/** Insert a structured log entry */
export async function insertLog(c: Context<{ Bindings: Bindings }>) {
    const vl = getVL(c.env);

    try {
        const { level = "info", message } = await c.req.json();
        await vl.insert(appLogs).values({
            message,
            level,
        });
        return c.json({ success: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: message }, 500);
    }
}
