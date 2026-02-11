/**
 * victoria-orm — Complete usage examples
 *
 * Run: npx tsx examples/usage.ts
 */

import {
    victoriaLogs,
    stream,
    text,
    timestamp,
    enm,
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
} from "../src/index";

// ━━━ 1. Initialize ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const vl = victoriaLogs({
    url: process.env.VICTORIA_BASE_URL || "https://your-instance.victoriametrics.com",
    token: process.env.VICTORIA_TOKEN || "your-token",

    // Debug hook — logs every query before execution
    onQuery: (sql, kind) => console.log(`  [${kind}]`, sql),
});

// ━━━ 2. Define Schemas ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Like Drizzle's pgTable()
const emails = stream("email-archive", {
    id: text("id"),
    to: text("to").notNull(), // required for insert
    from: text("from").notNull(),
    subject: text("subject"),
    status: enm("status", ["delivered", "bounced", "deferred", "opened", "clicked"] as const),
    sentAt: timestamp("sent_at"),
});

const appLogs = stream("app-service", {
    message: text("log.message"),
    level: text("log.level"),
});

// ━━━ 3. Querying ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function queryExamples() {
    console.log("\n=== SELECT ===");

    // Basic select — all emails
    const all = await vl.select().from(emails).execute();
    console.log(`Found ${all.count} emails`);

    // With a single filter
    const bounced = await vl.select().from(emails)
        .where(eq(emails.status, "bounced"))
        .execute();

    // Chained .where() — multiple calls AND together
    const filtered = await vl.select().from(emails)
        .where(eq(emails.status, "delivered"))
        .where(contains(emails.to, "school.edu"))
        .limit(50)
        .offset(100)
        .execute();
    // Generated: stream:"email-archive" AND status:delivered AND to:~school.edu

    // Time range — last 2 hours
    const recent = await vl.select().from(emails)
        .where(after("2h"))
        .execute();

    // Between dates
    const janEmails = await vl.select().from(emails)
        .where(between("2026-01-01", "2026-02-01"))
        .execute();

    // Complex filters with and/or
    const complex = await vl.select().from(emails)
        .where(
            and(
                or(eq(emails.status, "bounced"), eq(emails.status, "deferred")),
                contains(emails.to, "school.edu"),
                after("7d")
            )
        )
        .limit(25)
        .execute();

    // Pagination
    const page1 = await vl.select().from(emails).limit(100).offset(0).execute();
    const page2 = await vl.select().from(emails).limit(100).offset(100).execute();
    console.log(`Page 1: ${page1.count} results, hasMore: ${page1.hasMore}`);

    // ━━━ COUNT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log("\n=== COUNT ===");

    const total = await vl.select().from(emails).count();
    console.log(`Total emails: ${total}`);

    const bouncedCount = await vl.select().from(emails)
        .where(eq(emails.status, "bounced"))
        .count();
    console.log(`Bounced: ${bouncedCount}`);

    // ━━━ GROUP BY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log("\n=== GROUP BY ===");

    const byStatus = await vl.select().from(emails)
        .groupBy(emails.status)
        .count();
    // → [{ label: 'delivered', count: 700000 }, { label: 'bounced', count: 50000 }, ...]
    console.log("By status:", byStatus);

    // ━━━ DEBUG (.toLogsQL) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log("\n=== DEBUG ===");

    const sql = vl.select().from(emails)
        .where(eq(emails.status, "bounced"))
        .where(contains(emails.to, "school.edu"))
        .toLogsQL();
    console.log("Generated LogsQL:", sql);
    // → stream:"email-archive" AND status:bounced AND to:~school.edu
}

// ━━━ 4. Inserting ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function insertExamples() {
    console.log("\n=== INSERT ===");

    // Single record
    const result = await vl.insert(emails).values({
        to: "alice@school.edu",
        from: "noreply@app.com",
        subject: "Welcome!",
        status: "delivered",
    });
    console.log("Inserted:", result);
    // → { success: true, count: 1 }

    // Bulk insert
    const bulk = await vl.insert(emails).values([
        { to: "bob@school.edu", from: "noreply@app.com", subject: "Hello", status: "delivered" },
        { to: "carol@school.edu", from: "noreply@app.com", subject: "Hi", status: "bounced" },
        { to: "dan@school.edu", from: "noreply@app.com", subject: "Hey", status: "deferred" },
    ]);
    console.log("Bulk inserted:", bulk);
    // → { success: true, count: 3 }

    // Required field validation — this would throw:
    // await vl.insert(emails).values({ subject: "No recipient!" });
    // → Error: Missing required field "to" in insert to "email-archive"
}

// ━━━ 5. Raw Queries ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function rawExamples() {
    console.log("\n=== RAW ===");

    // Raw select — for arbitrary LogsQL
    const logs = await vl.rawQuery('log.level:error AND stream:"payment-service"', {
        limit: 50,
        offset: 0,
    });
    console.log(`Found ${logs.count} error logs`);

    // Raw count
    const errorCount = await vl.rawCount("log.level:error");
    console.log(`Total errors: ${errorCount}`);
}

// ━━━ 6. Structured Logging ━━━━━━━━━━━━━━━━━━━━━━━━━━

function loggingExamples() {
    console.log("\n=== LOGGING ===");

    // Simple
    vl.log.info("User signed up");
    vl.log.warn("Rate limit approaching");
    vl.log.error("Payment failed");

    // With metadata
    vl.log.withMetadata({ userId: "123", action: "checkout" }).info("Order placed");

    // With error
    try {
        throw new Error("Connection refused");
    } catch (err) {
        vl.log.withError(err as Error).error("Database connection failed");
    }
}

// ━━━ 7. Health Check ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function healthCheck() {
    console.log("\n=== PING ===");

    const ok = await vl.ping();
    console.log(`VictoriaLogs is ${ok ? "✅ reachable" : "❌ unreachable"}`);
}

// ━━━ 8. Operator Reference ━━━━━━━━━━━━━━━━━━━━━━━━━━

function operatorExamples() {
    console.log("\n=== OPERATORS ===");

    // Each operator's toLogsQL() output:
    console.log("eq:      ", eq(emails.status, "bounced").toLogsQL());
    //  → status:bounced

    console.log("contains:", contains(emails.to, "school.edu").toLogsQL());
    //  → to:~school.edu

    console.log("not:     ", not(emails.status, "delivered").toLogsQL());
    //  → NOT status:delivered

    console.log("exists:  ", exists(emails.subject).toLogsQL());
    //  → subject:*

    console.log("regex:   ", regex(emails.to, ".*@school\\.edu").toLogsQL());
    //  → to:~".*@school\.edu"

    console.log("and:     ", and(eq(emails.status, "bounced"), contains(emails.to, "edu")).toLogsQL());
    //  → (status:bounced) AND (to:~edu)

    console.log("or:      ", or(eq(emails.status, "bounced"), eq(emails.status, "deferred")).toLogsQL());
    //  → (status:bounced) OR (status:deferred)

    console.log("after:   ", after("2h").toLogsQL());
    //  → _time:>2h

    console.log("before:  ", before("2026-01-01").toLogsQL());
    //  → _time:<2026-01-01

    console.log("between: ", between("2026-01-01", "2026-02-01").toLogsQL());
    //  → (_time:>2026-01-01) AND (_time:<2026-02-01)

    console.log("raw:     ", raw('stream:"my-stream" AND custom_field:value').toLogsQL());
    //  → stream:"my-stream" AND custom_field:value
}

// ━━━ Run ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function main() {
    operatorExamples();
    loggingExamples();
    await healthCheck();
    // Uncomment to run against a real instance:
    // await queryExamples();
    // await insertExamples();
    // await rawExamples();
}

main().catch(console.error);
