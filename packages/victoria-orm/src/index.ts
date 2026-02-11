/**
 * Victoria ORM — Drizzle-style typed queries for VictoriaLogs.
 *
 * @example
 *   import { victoriaLogs, stream, text, enm, eq, contains } from 'victoria-orm';
 *
 *   const vl = victoriaLogs({ url: '...', token: '...' });
 *   const emails = stream('email-archive', {
 *     to: text('to').notNull(),
 *     status: enm('status', ['delivered', 'bounced']),
 *   });
 *
 *   await vl.select().from(emails).where(eq(emails.status, 'bounced')).execute();
 *   await vl.insert(emails).values({ to: 'a@b.com', status: 'delivered' });
 *
 * @module
 */

// Factory
export { victoriaLogs } from "./client";
export type { VictoriaLogsConfig, VictoriaLogsClient, InsertBuilder } from "./client";

// Schema
export { stream, text, timestamp, enm } from "./schema";
export type {
    Column,
    TextColumn,
    TimestampColumn,
    EnumColumn,
    Stream,
    StreamFields,
    InferStream,
    InferInsert,
} from "./schema";

// Operators
export {
    eq,
    contains,
    not,
    exists,
    regex,
    and,
    or,
    after,
    before,
    between,
    raw,
} from "./operators";
export type { Filter } from "./operators";

// Builder
export { QueryBuilder, StreamQuery } from "./builder";
export type { QueryConfig, SelectResult, GroupByResult } from "./builder";
