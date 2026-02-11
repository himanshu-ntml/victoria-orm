/**
 * Fluent query builder — Drizzle-style chainable API.
 *
 * @example
 *   // Chained .where() calls AND together
 *   const results = await vl.select().from(emails)
 *     .where(eq(emails.status, 'bounced'))
 *     .where(contains(emails.to, 'school.edu'))
 *     .limit(50).execute();
 *
 *   // Group by
 *   const byStatus = await vl.select().from(emails).groupBy(emails.status).count();
 *   // → [{ status: 'delivered', count: 700000 }, ...]
 *
 *   // Debug
 *   const sql = vl.select().from(emails).where(eq(emails.status, 'bounced')).toLogsQL();
 */

import type { Stream, StreamFields, InferStream, Column } from "./schema";
import type { Filter } from "./operators";

// ── Config ──

export interface QueryConfig {
    baseUrl: string;
    token: string;
    /** Optional callback fired before every query — for logging/debugging */
    onQuery?: (logsql: string, kind: "select" | "count" | "groupBy") => void;
}

// ── Result types ──

export interface SelectResult<T> {
    logs: T[];
    count: number;
    hasMore: boolean;
    limit: number;
    offset: number;
}

export interface GroupByResult {
    label: string;
    count: number;
    [key: string]: unknown;
}

// ── Builder chain ──

export class StreamQuery<TFields extends StreamFields> {
    private _stream: Stream<TFields>;
    private _filters: Filter[] = [];
    private _limit: number = 100;
    private _offset: number = 0;
    private _groupByColumn: Column | null = null;
    private config: QueryConfig;

    constructor(config: QueryConfig, stream: Stream<TFields>) {
        this.config = config;
        this._stream = stream;
    }

    /**
     * Add a filter — multiple `.where()` calls AND together.
     *
     * @example
     *   vl.select().from(emails)
     *     .where(eq(emails.status, 'bounced'))
     *     .where(contains(emails.to, 'school.edu'))
     */
    where(filter: Filter): this {
        this._filters.push(filter);
        return this;
    }

    /** Set result limit (default 100) */
    limit(n: number): this {
        this._limit = n;
        return this;
    }

    /** Set result offset for pagination */
    offset(n: number): this {
        this._offset = n;
        return this;
    }

    /**
     * Group results by a column — use with `.count()`.
     *
     * @example
     *   const byStatus = await vl.select().from(emails)
     *     .groupBy(emails.status)
     *     .count();
     *   // → [{ label: 'delivered', count: 700000 }, ...]
     */
    groupBy(column: Column): this {
        this._groupByColumn = column;
        return this;
    }

    /** Generate the LogsQL query string (for debugging) */
    toLogsQL(): string {
        const parts: string[] = [];

        // Stream filter (if stream has a name)
        if (this._stream.streamName) {
            parts.push(`stream:"${this._stream.streamName}"`);
        }

        // Where filters — AND together
        for (const filter of this._filters) {
            parts.push(filter.toLogsQL());
        }

        return parts.join(" AND ");
    }

    /** Execute the query and return typed results */
    async execute(): Promise<SelectResult<InferStream<TFields>>> {
        const logsql = this.toLogsQL();
        this.config.onQuery?.(logsql, "select");

        const url = new URL(`${this.config.baseUrl}/select/logsql/query`);
        url.searchParams.set("query", logsql);
        url.searchParams.set("limit", String(this._limit));
        if (this._offset > 0) {
            url.searchParams.set("offset", String(this._offset));
        }

        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${this.config.token}` },
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Query failed (${res.status}): ${text}`);
        }

        const text = await res.text();
        const logs = text
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => {
                try {
                    return JSON.parse(line) as InferStream<TFields>;
                } catch {
                    return { _raw: line } as unknown as InferStream<TFields>;
                }
            });

        return {
            logs,
            count: logs.length,
            hasMore: logs.length === this._limit,
            limit: this._limit,
            offset: this._offset,
        };
    }

    /**
     * Count matching records.
     *
     * If `.groupBy()` was called, returns grouped results.
     * Otherwise returns a single number.
     */
    async count(): Promise<number>;
    async count(): Promise<number | GroupByResult[]>;
    async count(): Promise<number | GroupByResult[]> {
        const baseQuery = this.toLogsQL();

        // Group by — returns array of { label, count }
        if (this._groupByColumn) {
            const field = this._groupByColumn.fieldName;
            const logsql = `${baseQuery} | stats by(${field}) count() as hits`;
            this.config.onQuery?.(logsql, "groupBy");

            const url = new URL(
                `${this.config.baseUrl}/select/logsql/stats_query`
            );
            url.searchParams.set("query", logsql);

            const res = await fetch(url.toString(), {
                headers: { Authorization: `Bearer ${this.config.token}` },
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(`GroupBy failed (${res.status}): ${text}`);
            }

            const text = await res.text();
            const data = JSON.parse(text.trim().split("\n")[0]);

            if (data?.status === "success" && data?.data?.result) {
                return data.data.result.map(
                    (r: { metric: Record<string, string>; value: [number, string] }) => ({
                        label:
                            r.metric[field] ||
                            Object.values(r.metric).join(" "),
                        count: parseInt(r.value[1], 10),
                    })
                );
            }

            return [];
        }

        // Simple count
        const logsql = `${baseQuery} | stats count() as total`;
        this.config.onQuery?.(logsql, "count");

        const url = new URL(
            `${this.config.baseUrl}/select/logsql/stats_query`
        );
        url.searchParams.set("query", logsql);

        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${this.config.token}` },
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Count failed (${res.status}): ${text}`);
        }

        const text = await res.text();
        const data = JSON.parse(text.trim().split("\n")[0]);

        if (data?.status === "success" && data?.data?.result?.[0]) {
            return parseInt(data.data.result[0].value[1], 10);
        }

        return 0;
    }
}

/** Entry point — starts the select chain */
export class QueryBuilder {
    protected config: QueryConfig;

    constructor(config: QueryConfig) {
        this.config = config;
    }

    /** Start a select query */
    select() {
        const config = this.config;
        return {
            from<TFields extends StreamFields>(
                stream: Stream<TFields>
            ): StreamQuery<TFields> {
                return new StreamQuery<TFields>(config, stream);
            },
        };
    }

    /** Execute a raw LogsQL query */
    async rawQuery(
        logsql: string,
        opts: { limit?: number; offset?: number } = {}
    ): Promise<SelectResult<Record<string, unknown>>> {
        const limit = opts.limit ?? 100;
        const offset = opts.offset ?? 0;
        this.config.onQuery?.(logsql, "select");

        const url = new URL(`${this.config.baseUrl}/select/logsql/query`);
        url.searchParams.set("query", logsql);
        url.searchParams.set("limit", String(limit));
        if (offset > 0) url.searchParams.set("offset", String(offset));

        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${this.config.token}` },
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Query failed (${res.status}): ${text}`);
        }

        const text = await res.text();
        const logs = text
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => {
                try {
                    return JSON.parse(line);
                } catch {
                    return { _raw: line };
                }
            });

        return { logs, count: logs.length, hasMore: logs.length === limit, limit, offset };
    }

    /** Count matching records for a raw LogsQL query */
    async rawCount(logsql: string): Promise<number> {
        const statsQuery = `${logsql} | stats count() as total`;
        this.config.onQuery?.(statsQuery, "count");

        const url = new URL(
            `${this.config.baseUrl}/select/logsql/stats_query`
        );
        url.searchParams.set("query", statsQuery);

        const res = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${this.config.token}` },
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Count failed (${res.status}): ${text}`);
        }

        const text = await res.text();
        const data = JSON.parse(text.trim().split("\n")[0]);

        if (data?.status === "success" && data?.data?.result?.[0]) {
            return parseInt(data.data.result[0].value[1], 10);
        }

        return 0;
    }
}
