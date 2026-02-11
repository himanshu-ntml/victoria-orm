/**
 * VictoriaLogs connection helper
 */

import { victoriaLogs } from "victoria-orm";

// ── Types ──

export type Bindings = {
    VICTORIA_BASE_URL: string;
    VICTORIA_TOKEN: string;
    DB: D1Database;
};

// ── Connection ──

export function getVL(env: Bindings) {
    return victoriaLogs({
        url: env.VICTORIA_BASE_URL,
        token: env.VICTORIA_TOKEN || "",
        logger: true,
    });
}
