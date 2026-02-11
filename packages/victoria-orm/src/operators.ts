/**
 * Filter operators for type-safe LogsQL queries.
 *
 * @example
 *   import { eq, contains, not, and, or, after, before } from 'victoria-orm';
 *
 *   eq(emails.status, 'bounced')         // → status:bounced
 *   contains(emails.to, 'school.edu')    // → to:~school.edu
 *   not(emails.status, 'delivered')      // → NOT status:delivered
 *   and(eq(...), contains(...))          // → (...) AND (...)
 *   or(eq(...), eq(...))                 // → (...) OR (...)
 *   after('2h')                          // → _time:>2h
 *   before('2026-01-01')                 // → _time:<2026-01-01
 */

import type { Column } from "./schema";

// ── Filter AST ──

export interface Filter {
    toLogsQL(): string;
}

// ── Helpers ──

function quoteValue(value: string): string {
    if (/[@.\s"\\]/.test(value)) {
        return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }
    return value;
}

// ── Comparison operators ──

/** Exact match — `field:value` */
export function eq<T extends string>(
    column: Column<string, T>,
    value: T
): Filter {
    return {
        toLogsQL: () => `${column.fieldName}:${quoteValue(String(value))}`,
    };
}

/** Substring/contains — `field:~value` */
export function contains(
    column: Column<string, string>,
    value: string
): Filter {
    return {
        toLogsQL: () => `${column.fieldName}:~${quoteValue(value)}`,
    };
}

/** Negation — `NOT field:value` */
export function not<T extends string>(
    column: Column<string, T>,
    value: T
): Filter {
    return {
        toLogsQL: () => `NOT ${column.fieldName}:${quoteValue(String(value))}`,
    };
}

/** Field exists — `field:*` */
export function exists(column: Column): Filter {
    return {
        toLogsQL: () => `${column.fieldName}:*`,
    };
}

/** Regex match — `field:~"pattern"` */
export function regex(
    column: Column<string, string>,
    pattern: string
): Filter {
    return {
        toLogsQL: () => `${column.fieldName}:~"${pattern}"`,
    };
}

// ── Logical combinators ──

/** AND — all filters must match */
export function and(...filters: Filter[]): Filter {
    return {
        toLogsQL: () =>
            filters.map((f) => `(${f.toLogsQL()})`).join(" AND "),
    };
}

/** OR — any filter matches */
export function or(...filters: Filter[]): Filter {
    return {
        toLogsQL: () =>
            filters.map((f) => `(${f.toLogsQL()})`).join(" OR "),
    };
}

// ── Time range filters ──

/**
 * Filter logs after a time — `_time:>value`
 *
 * @param value - Duration like '2h', '30m', '7d' or ISO date '2026-01-01'
 * @example
 *   after('2h')           // last 2 hours
 *   after('2026-01-01')   // after Jan 1 2026
 */
export function after(value: string): Filter {
    return {
        toLogsQL: () => `_time:>${quoteValue(value)}`,
    };
}

/**
 * Filter logs before a time — `_time:<value`
 *
 * @param value - Duration or ISO date
 */
export function before(value: string): Filter {
    return {
        toLogsQL: () => `_time:<${quoteValue(value)}`,
    };
}

/**
 * Filter logs within a time range
 *
 * @example
 *   between('2026-01-01', '2026-02-01')
 */
export function between(start: string, end: string): Filter {
    return and(after(start), before(end));
}

// ── Escape hatch ──

/** Raw LogsQL — for anything the ORM doesn't cover */
export function raw(logsql: string): Filter {
    return {
        toLogsQL: () => logsql,
    };
}
