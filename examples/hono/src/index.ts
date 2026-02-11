/**
 * Hono + victoria-orm on Cloudflare Workers
 *
 * Dev:    npm run dev
 * Deploy: npm run deploy
 *
 * Endpoints:
 *   GET  /                     → health + links
 *   GET  /api/logs?query=*     → query logs
 *   GET  /api/logs/stats       → log count
 *   GET  /api/emails           → query emails
 *   POST /api/logs             → insert a log
 *   POST /api/emails/archive   → manual archive trigger
 */

import { Hono } from "hono";
import { archiveEmails, cleanupArchived } from "@/scheduler/archival";
import { type Bindings } from "@/providers/victoria";
import { logs } from "./features/logs";
import { emails } from "./features/emails";

// ── App ──

const app = new Hono<{ Bindings: Bindings }>();

// Health
app.get("/", (c) =>
    c.json({
        name: "victoria-orm cloudflare workers example",
        endpoints: [
            "GET  /api/logs?query=*&limit=20",
            "GET  /api/logs/stats?query=*",
            "GET  /api/logs/emails?limit=20",
            "POST /api/logs  { level, message }",
            "GET  /api/emails?limit=50&archived=false",
            "GET  /api/emails/:id",
            "POST /api/emails  { to, from, subject }",
            "POST /api/emails/archive  (Phase 1: D1 → VictoriaLogs)",
            "POST /api/emails/cleanup  (Phase 2: verify → hard-delete)",
        ],
    })
);

// Feature routes
app.route("/api/logs", logs);
app.route("/api/emails", emails);

// ── Exports ──

export default {
    fetch: app.fetch,

    // Cron trigger — runs both archival phases on schedule
    async scheduled(event: ScheduledEvent, env: Bindings, ctx: ExecutionContext) {
        ctx.waitUntil(
            (async () => {
                // Phase 1: Archive un-archived emails to VictoriaLogs
                const archiveResult = await archiveEmails(env);
                console.log("[scheduled] Phase 1 (archive):", archiveResult);

                // Phase 2: Verify archived emails in VL, then hard-delete from D1
                const cleanupResult = await cleanupArchived(env);
                console.log("[scheduled] Phase 2 (cleanup):", cleanupResult);
            })()
        );
    },
};
