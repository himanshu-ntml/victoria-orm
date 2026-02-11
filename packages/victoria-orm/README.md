# victoria-orm

Drizzle-style typed ORM for [VictoriaLogs](https://victoriametrics.com/products/victorialogs/). Schema-first queries, typed inserts, and structured logging.

No existing npm package provides a query builder for VictoriaLogs — this fills that gap by combining a typed query interface with [loglayer](https://loglayer.dev) for reliable log delivery.

## Install

```bash
npm install victoria-orm
```

## Quick Start

```ts
import { victoriaLogs, stream, text, enm, eq, contains, and, after } from 'victoria-orm';

// 1. Init (like Drizzle)
const vl = victoriaLogs({
  url: 'https://your-instance.victoriametrics.com',
  token: 'your-token',
});

// 2. Define streams (like pgTable)
const emails = stream('email-archive', {
  id: text('id'),
  to: text('to').notNull(),
  from: text('from').notNull(),
  subject: text('subject'),
  status: enm('status', ['delivered', 'bounced', 'deferred', 'opened', 'clicked']),
});

// 3. Query
const bounced = await vl.select().from(emails)
  .where(eq(emails.status, 'bounced'))
  .limit(50)
  .execute();
```

## API

### Select

```ts
// Basic
const results = await vl.select().from(emails).execute();

// With filters — .where() calls chain with AND
const filtered = await vl.select().from(emails)
  .where(eq(emails.status, 'delivered'))
  .where(contains(emails.to, 'school.edu'))
  .where(after('2h'))
  .limit(50)
  .offset(100)
  .execute();

// returns: { logs: T[], count, hasMore, limit, offset }
```

### Count

```ts
const total = await vl.select().from(emails)
  .where(eq(emails.status, 'bounced'))
  .count();
// → 50000
```

### Group By

```ts
const byStatus = await vl.select().from(emails)
  .groupBy(emails.status)
  .count();
// → [{ label: 'delivered', count: 700000 }, { label: 'bounced', count: 50000 }, ...]
```

### Insert

```ts
// Single
await vl.insert(emails).values({
  to: 'a@b.com',
  from: 'noreply@app.com',
  subject: 'Welcome!',
  status: 'delivered',
});

// Bulk
await vl.insert(emails).values([
  { to: 'a@b.com', from: 'noreply@app.com', subject: 'Hello', status: 'delivered' },
  { to: 'b@c.com', from: 'noreply@app.com', subject: 'Hi', status: 'bounced' },
]);
// → { success: true, count: 2 }
```

### Structured Logging

Powered by [loglayer](https://loglayer.dev) with batching, retries, and error serialization:

```ts
vl.log.info('User signed up');
vl.log.withMetadata({ userId: '123', action: 'payment' }).error('Payment failed');
```

### Raw Queries (escape hatch)

```ts
const result = await vl.rawQuery('log.level:error AND stream:"payment-service"', { limit: 50 });
const count = await vl.rawCount('log.level:error');
```

### Health Check

```ts
const ok = await vl.ping(); // → true/false
```

### Debug

```ts
// See generated LogsQL without executing
const sql = vl.select().from(emails)
  .where(eq(emails.status, 'bounced'))
  .toLogsQL();
// → 'stream:"email-archive" AND status:bounced'

// Log all queries
const vl = victoriaLogs({
  url: '...',
  token: '...',
  onQuery: (sql, kind) => console.log(`[${kind}]`, sql),
});
```

## Schema

### Column Types

| Type | Factory | Example |
|------|---------|---------|
| Text | `text('name')` | Any string value |
| Timestamp | `timestamp('date')` | ISO date strings |
| Enum | `enm('status', [...])` | One of known values |

All columns support `.notNull()` which validates inserts:

```ts
const users = stream('users', {
  email: text('email').notNull(),  // required for insert
  name: text('name'),              // optional
});
```

### Operators

| Operator | LogsQL | Example |
|----------|--------|---------|
| `eq(col, val)` | `field:value` | Exact match |
| `contains(col, val)` | `field:~value` | Substring |
| `not(col, val)` | `NOT field:value` | Negation |
| `exists(col)` | `field:*` | Field exists |
| `regex(col, pattern)` | `field:~"pattern"` | Regex match |
| `and(...filters)` | `(...) AND (...)` | All must match |
| `or(...filters)` | `(...) OR (...)` | Any matches |
| `after('2h')` | `_time:>2h` | Time: after |
| `before('2026-01-01')` | `_time:<2026-01-01` | Time: before |
| `between(start, end)` | Combined | Time: range |
| `raw('...')` | Passthrough | Escape hatch |

## Drizzle Comparison

| Drizzle ORM | victoria-orm |
|-------------|-------------|
| `drizzle(env.DB)` | `victoriaLogs({ url, token })` |
| `pgTable('users', {...})` | `stream('users', {...})` |
| `db.select().from(users)` | `vl.select().from(users)` |
| `.where(eq(users.name, 'Dan'))` | `.where(eq(users.name, 'Dan'))` |
| `db.insert(users).values({...})` | `vl.insert(users).values({...})` |
| `text('name')` | `text('name')` |

## Why loglayer?

The ORM uses [@loglayer/transport-victoria-logs](https://www.npmjs.com/package/@loglayer/transport-victoria-logs) internally for sending logs. This gives you:

- **Batching** — groups logs and sends in bulk
- **Retries** — auto-retries with exponential backoff
- **Error serialization** — via `serialize-error`
- **Rate limiting** — respects server rate limits
- **Structured logging** — `.withMetadata()`, `.withError()`

Without loglayer, you'd need to implement all of this yourself. It's a crucial piece that makes the "send" side production-ready.

## License

MIT
