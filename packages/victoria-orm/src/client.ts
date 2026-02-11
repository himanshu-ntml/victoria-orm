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
 *
 *   // LOG
 *   vl.log.info("Something happened");
 */

import { LogLayer } from "loglayer";
import { VictoriaLogsTransport } from "@loglayer/transport-victoria-logs";
import { serializeError } from "serialize-error";
import { QueryBuilder, type SelectResult, type GroupByResult } from "./builder";
import type { Stream, StreamFields, InferInsert } from "./schema";

// ── Config ──

export interface VictoriaLogsConfig {
    /** VictoriaLogs base URL */
    url: string;
    /** Bearer token for auth */
    token: string;
    /** Stream fields for structured logging (optional) */
    streamFields?: () => Record<string, string>;
    /** Batch size for log sending (default: 100) */
    batchSize?: number;
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
    private _config: { url: string; token: string };

    constructor(config: { url: string; token: string }, stream: Stream<TFields>) {
        this._config = config;
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

        const url = new URL(`${this._config.url}/insert/jsonline`);
        url.searchParams.set("_stream_fields", "stream");
        url.searchParams.set("_time_field", "date");
        url.searchParams.set("_msg_field", "log.message");

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

        const res = await fetch(url.toString(), {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this._config.token}`,
                "Content-Type": "application/stream+json",
            },
            body,
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Insert failed (${res.status}): ${text}`);
        }

        return { success: true, count: records.length };
    }
}

// ── Main client ──

export interface VictoriaLogsClient extends QueryBuilder {
    /** Structured logger (loglayer) */
    log: LogLayer;
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
        return new InsertBuilder<TFields>({ url, token }, stream);
    }

    // Ping — health check
    async function ping(): Promise<boolean> {
        try {
            const pingUrl = new URL(`${url}/select/logsql/query`);
            pingUrl.searchParams.set("query", "log.level:*");
            pingUrl.searchParams.set("limit", "1");

            const res = await fetch(pingUrl.toString(), {
                headers: { Authorization: `Bearer ${token}` },
            });

            return res.ok;
        } catch {
            return false;
        }
    }

    // Logger (loglayer)
    const log = new LogLayer({
        errorSerializer: serializeError,
        transport: new VictoriaLogsTransport({
            url,
            headers: { Authorization: `Bearer ${token}` },
            streamFields:
                config.streamFields ??
                (() => ({
                    service: "victoria-orm",
                    environment: process.env.NODE_ENV || "development",
                })),
            httpParameters: {
                _time_field: "date",
                _msg_field: "log.message",
            },
            enableBatchSend: true,
            batchSize: config.batchSize ?? 100,
            batchSendTimeout: 5000,
            maxRetries: 3,
            retryDelay: 1000,
            onError: (err) => {
                console.error("[victoria-orm] Send failed:", err);
            },
        }),
    });

    return Object.assign(builder, { log, insert, ping });
}

// Re-export types
export type { SelectResult, GroupByResult };
