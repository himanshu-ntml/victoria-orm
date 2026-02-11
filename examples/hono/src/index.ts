/**
 * Hono + victoria-orm example
 *
 * Start:
 *   docker compose up -d victorialogs   # from repo root
 *   npm run dev                          # in this directory
 *
 * Endpoints:
 *   GET  /                     → health + links
 *   GET  /api/logs?query=*     → query logs
 *   GET  /api/emails           → query emails
 *   GET  /api/stats?query=*    → log count
 *   POST /api/logs             → insert a log
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { victoriaLogs, stream, text, enm, eq } from "victoria-orm";

// ── Init ORM ──

const vl = victoriaLogs({
    url: process.env.VICTORIA_BASE_URL || "http://localhost:9428",
    token: process.env.VICTORIA_TOKEN || "",
    logger: true,
});

// ── Schemas ──

const emails = stream("email-archive", {
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

const app = new Hono();

// Health
app.get("/", (c) =>
    c.json({
        name: "victoria-orm hono example",
        endpoints: [
            "GET  /api/logs?query=*&limit=20",
            "GET  /api/emails?limit=20",
            "GET  /api/stats?query=*",
            "POST /api/logs  { level, message }",
        ],
    })
);

// Query logs
app.get("/api/logs", async (c) => {
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

// Query emails (typed)
app.get("/api/emails", async (c) => {
    const limit = parseInt(c.req.query("limit") || "50", 10);
    const status = c.req.query("status");

    try {
        let query = vl.select().from(emails).limit(limit);
        if (status) {
            query = query.where(eq(emails.status, status));
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

// ── Start ──

const port = parseInt(process.env.PORT || "3001", 10);
console.log(`🔥 Hono + victoria-orm listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
