/**
 * VictoriaLogs connection — like Drizzle's db init.
 *
 * @example
 *   import { vl } from '@/providers/victoria/db';
 */

import { victoriaLogs } from "victoria-orm";

export const vl = victoriaLogs({
    url: process.env.VICTORIA_BASE_URL!,
    token: process.env.VICTORIA_TOKEN!,
});
