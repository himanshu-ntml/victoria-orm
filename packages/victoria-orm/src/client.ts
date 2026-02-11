/**
 * VictoriaLogs ORM — unified client factory.
 *
 * @example
 *   import { victoriaLogs } from 'victoria-orm';
 *
 *   export const vl = victoriaLogs({
 *     url: 'https://...',
 *     token: '...',
 *     onQuery: (sql, kind) => console.log(`[${kind}]`, sql),  // debug hook
 *   });
 *
 *   // SELECT
 *   await vl.select().from(emails).where(eq(emails.status, 'bounced')).execute();
 *
 *   // INSERT
 *   await vl.insert(emails).values({ to: 'a@b.com', status: 'delivered' });
 *
 *   // COUNT
 *   await vl.select().from(emails).count();
 *
 *   // GROUP BY
 *   await vl.select().from(emails).groupBy(emails.status).count();
 *
 *   // PING
 *   const ok = await vl.ping();
 */

import { QueryBuilder, type SelectResult, type GroupByResult } from "./builder";
import type { Stream, StreamFields, InferInsert } from "./schema";
import { vlGet, vlPost } from "./http";
import type { HttpConfig } from "./http";

// ── Config ──

export interface VictoriaLogsConfig {
    /** VictoriaLogs base URL */
    url: string;
    /** Bearer token for auth (empty string for local/no-auth) */
    token: string;
    /**
     * Debug hook — fired before every query.
     *
     * @example
     *   onQuery: (sql, kind) => console.log(`[victoria:${kind}]`, sql)
     */
    onQuery?: (logsql: string, kind: "select" | "count" | "groupBy") => void;
}

// ── Insert builder ──

export class InsertBuilder<TFields extends StreamFields> {
    private _stream: Stream<TFields>;
    private _http: HttpConfig;

    constructor(http: HttpConfig, stream: Stream<TFields>) {
        this._http = http;
        this._stream = stream;
    }

    /**
     * Insert one or many records — typed to the stream's schema.
     *
     * @example
     *   await vl.insert(emails).values({ to: 'a@b.com', status: 'delivered' });
     *   await vl.insert(emails).values([{ ... }, { ... }]);
     */
    async values(
        data: InferInsert<TFields> | InferInsert<TFields>[]
    ): Promise<{ success: true; count: number }> {
        const records = Array.isArray(data) ? data : [data];

        // Validate required fields
        const requiredFields = Object.entries(this._stream.fields)
            .filter(([, col]) => col.required)
            .map(([key]) => key);

        for (const record of records) {
            for (const field of requiredFields) {
                if ((record as Record<string, unknown>)[field] === undefined) {
                    throw new Error(
                        `Missing required field "${field}" in insert to "${this._stream.streamName}"`
                    );
                }
            }
        }

        const body = records
            .map((record) => {
                const { _time, _msg, _stream, ...fields } =
                    record as Record<string, unknown>;
                return JSON.stringify({
                    stream: this._stream.streamName,
                    date: (_time as string) || new Date().toISOString(),
                    ...fields,
                });
            })
            .join("\n");

        await vlPost(this._http, "/insert/jsonline", {
            _stream_fields: "stream",
            _time_field: "date",
            _msg_field: "log.message",
        }, body);

        return { success: true, count: records.length };
    }
}

// ── Main client ──

export interface VictoriaLogsClient extends QueryBuilder {
    /** Start a typed insert chain */
    insert<TFields extends StreamFields>(
        stream: Stream<TFields>
    ): InsertBuilder<TFields>;
    /** Health check — test connection to VictoriaLogs */
    ping(): Promise<boolean>;
}

/**
 * Initialize the VictoriaLogs ORM — like `drizzle()`.
 *
 * @example
 *   export const vl = victoriaLogs({
 *     url: 'https://...',
 *     token: '...',
 *     onQuery: (sql) => console.log(sql),
 *   });
 */
export function victoriaLogs(config: VictoriaLogsConfig): VictoriaLogsClient {
    const { url, token } = config;
    const http: HttpConfig = { baseUrl: url, token };

    // Query builder
    const builder = new QueryBuilder({
        baseUrl: url,
        token,
        onQuery: config.onQuery,
    });

    // Insert factory
    function insert<TFields extends StreamFields>(
        stream: Stream<TFields>
    ): InsertBuilder<TFields> {
        return new InsertBuilder<TFields>(http, stream);
    }

    // Ping — health check
    async function ping(): Promise<boolean> {
        try {
            await vlGet(http, "/select/logsql/query", {
                query: "log.level:*",
                limit: "1",
            });
            return true;
        } catch {
            return false;
        }
    }

    return Object.assign(builder, { insert, ping });
}

// Re-export types
export type { SelectResult, GroupByResult };
