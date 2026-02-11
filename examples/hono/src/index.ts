/**
 * Hono + victoria-orm on Cloudflare Workers
 *
 * Dev:    npm run dev
 * Deploy: npm run deploy
 *
 * Endpoints:
 *   GET  /                     → health + links
 *   GET  /api/logs?query=*     → query logs
 *   GET  /api/emails           → query emails
 *   GET  /api/stats?query=*    → log count
 *   POST /api/logs             → insert a log
 */

import { Hono } from "hono";
import { victoriaLogs, stream, text, enm, eq } from "victoria-orm";
import { archiveEmails } from "./archival";

// ── Types ──

type Bindings = {
    VICTORIA_BASE_URL: string;
    VICTORIA_TOKEN: string;
    DB: D1Database;
};

// ── Schemas ──

const vlEmails = stream("email-archive", {
    id: text("id"),
    to: text("to").notNull(),
    from: text("from").notNull(),
    subject: text("subject").notNull(),
    status: enm("status", [
        "delivered",
        "bounced",
        "deferred",
        "opened",
        "clicked",
    ] as const),
});

const appLogs = stream("stream1", {
    message: text("log.message"),
    level: text("log.level"),
});

// ── App ──

const app = new Hono<{ Bindings: Bindings }>();

// Helper: init ORM from worker env
function getVL(env: Bindings) {
    return victoriaLogs({
        url: env.VICTORIA_BASE_URL,
        token: env.VICTORIA_TOKEN || "",
        logger: true,
    });
}

// Health
app.get("/", (c) =>
    c.json({
        name: "victoria-orm cloudflare workers example",
        endpoints: [
            "GET  /api/logs?query=*&limit=20",
            "GET  /api/emails?limit=20",
            "GET  /api/stats?query=*",
            "POST /api/logs  { level, message }",
            "POST /api/archive  (manual trigger)",
        ],
    })
);

// Query logs
app.get("/api/logs", async (c) => {
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
});

// Query emails (typed — from VictoriaLogs)
app.get("/api/emails", async (c) => {
    const vl = getVL(c.env);
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const status = c.req.query("status");

    try {
        let query = vl.select().from(vlEmails).limit(limit);
        if (status) {
            query = query.where(eq(vlEmails.status, status));
        }
        const result = await query.execute();
        return c.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: message }, 500);
    }
});

// Stats
app.get("/api/stats", async (c) => {
    const vl = getVL(c.env);
    const query = c.req.query("query") || "*";

    try {
        const count = await vl.rawCount(query);
        return c.json({ query, count });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: message }, 500);
    }
});

// Insert log
app.post("/api/logs", async (c) => {
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
});

// Manual archive trigger (for testing — same logic as cron)
app.post("/api/archive", async (c) => {
    try {
        const result = await archiveEmails(c.env);
        return c.json(result);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: message }, 500);
    }
});

// ── Exports ──

export default {
    fetch: app.fetch,

    // Cron trigger — runs archival on schedule
    async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
        ctx.waitUntil(
            archiveEmails(env).then((result) => {
                console.log("[scheduled] Archival complete:", result);
            })
        );
    },
};

