/**
 * Logs feature — routes
 *
 * Mounted at /api/logs in the main app.
 */

import { Hono } from "hono";
import type { Bindings } from "@/providers/victoria";
import { queryEmails, queryLogs, getStats, insertLog } from "./controller";

const logs = new Hono<{ Bindings: Bindings }>();

// Email archive queries
logs.get("/emails", queryEmails);

// General log operations
logs.get("/", queryLogs);
logs.get("/stats", getStats);
logs.post("/", insertLog);

export { logs };
