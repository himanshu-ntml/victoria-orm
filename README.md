# victoria-orm

Drizzle-style typed ORM for [VictoriaLogs](https://victoriametrics.com/products/victorialogs/) — **zero dependencies**.

```bash
npm install victoria-orm
```

```ts
import { victoriaLogs, stream, text, enm, eq } from 'victoria-orm';

const vl = victoriaLogs({ url: 'http://localhost:9428', token: '', logger: true });

const emails = stream('email-archive', {
  to: text('to').notNull(),
  status: enm('status', ['delivered', 'bounced']),
});

// Query
const bounced = await vl.select().from(emails)
  .where(eq(emails.status, 'bounced'))
  .execute();

// Insert
await vl.insert(emails).values({ to: 'a@b.com', status: 'delivered' });

// Count
const total = await vl.select().from(emails).count();
```

📖 **Full docs:** [packages/victoria-orm/README.md](packages/victoria-orm/README.md)

## Quick Start (Local)

```bash
# 1. Start VictoriaLogs
docker compose up -d victorialogs

# 2. Seed test data
node scripts/seed.mjs --count=200
node scripts/seed-emails.mjs --count=500

# 3. Run an example
npm run dev:hono     # → http://localhost:3001
npm run dev:nextjs   # → http://localhost:3000
```

## Examples

| Example | Dir | Description |
|---------|-----|-------------|
| **Next.js** | [examples/nextjs/](examples/nextjs/) | Full-stack app with API routes |
| **Hono** | [examples/hono/](examples/hono/) | Lightweight API server |

## Project Structure

```
├── packages/victoria-orm/   ← ORM package (npm: victoria-orm)
├── examples/
│   ├── nextjs/              ← Next.js example
│   └── hono/                ← Hono example
├── scripts/                 ← Seed scripts
└── docker-compose.yml       ← Local VictoriaLogs
```

## License

MIT
