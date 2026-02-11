#!/usr/bin/env node

/**
 * Seed script for VictoriaLogs
 *
 * Usage:
 *   node scripts/seed.mjs
 *   node scripts/seed.mjs --count 200
 */

const BASE_URL = process.env.VICTORIA_BASE_URL || "http://localhost:9428";
const TOKEN = process.env.VICTORIA_TOKEN || "";

const COUNT = parseInt(process.argv.find((a) => a.startsWith("--count="))?.split("=")[1] || "50", 10);

// ── Sample data pools ──

const STREAMS = ["api-gateway", "auth-service", "payment-service", "user-service", "notification-service"];

const MESSAGES = {
    info: [
        "Request processed successfully",
        "User logged in",
        "Cache hit for session token",
        "Health check passed",
        "Database connection pool refreshed",
        "Scheduled job completed",
        "Email notification queued",
        "Configuration reloaded",
        "New user registered",
        "Order created successfully",
    ],
    warn: [
        "Slow query detected: 2340ms",
        "Rate limit approaching threshold",
        "Deprecated API endpoint called: /v1/users",
        "Connection pool nearing capacity: 85%",
        "Retry attempt 2/3 for payment webhook",
        "JWT token expires in 5 minutes",
        "Disk usage at 78%",
        "Memory usage spike detected",
    ],
    error: [
        "Failed to connect to database: ECONNREFUSED",
        "Payment processing failed: card declined",
        "Unhandled exception in request handler",
        "S3 upload timeout after 30s",
        "Authentication token invalid",
        "Rate limit exceeded for IP 192.168.1.45",
        "Circuit breaker tripped for payment-service",
        "Out of memory: heap allocation failed",
    ],
    debug: [
        "Parsing request body: 1.2KB",
        "SQL query: SELECT * FROM users WHERE id=$1",
        "Redis PING response: 0.3ms",
        "Middleware chain: [auth, cors, rateLimit, handler]",
        "Response serialized in 0.8ms",
        "Cache TTL set to 3600s for key user:42",
    ],
};

const LEVELS = Object.keys(MESSAGES);

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomDate(daysBack = 7) {
    const now = Date.now();
    const offset = Math.floor(Math.random() * daysBack * 24 * 60 * 60 * 1000);
    return new Date(now - offset).toISOString();
}

function weightedLevel() {
    const r = Math.random();
    if (r < 0.45) return "info";
    if (r < 0.65) return "warn";
    if (r < 0.80) return "error";
    return "debug";
}

// ── Build NDJSON payload ──

const lines = [];
for (let i = 0; i < COUNT; i++) {
    const level = weightedLevel();
    const stream = pick(STREAMS);
    const message = pick(MESSAGES[level]);
    // Add some variation with request IDs and user IDs
    const extra =
        Math.random() > 0.5
            ? ` [req:${Math.random().toString(36).slice(2, 10)}]`
            : "";
    const userId = Math.random() > 0.6 ? ` user_id=${Math.floor(Math.random() * 1000)}` : "";

    lines.push(
        JSON.stringify({
            log: { level, message: message + extra + userId },
            date: randomDate(),
            stream,
        })
    );
}

const body = lines.join("\n");

// ── Send to VictoriaLogs ──

async function seed() {
    const url = new URL(`${BASE_URL}/insert/jsonline`);
    url.searchParams.set("_stream_fields", "stream");
    url.searchParams.set("_time_field", "date");
    url.searchParams.set("_msg_field", "log.message");

    console.log(`\n🌱 Seeding ${COUNT} logs across ${STREAMS.length} streams...\n`);

    const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
            ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }),
            "Content-Type": "application/stream+json",
        },
        body,
    });

    if (!res.ok) {
        const text = await res.text();
        console.error(`❌ Failed (${res.status}): ${text}`);
        process.exit(1);
    }

    console.log(`✅ Inserted ${COUNT} logs successfully!\n`);
    console.log("Level distribution (approximate):");
    console.log("  info  ~45%");
    console.log("  warn  ~20%");
    console.log("  error ~15%");
    console.log("  debug ~20%");
    console.log(`\nStreams: ${STREAMS.join(", ")}`);
    console.log("\n── Try these LogsQL queries ──\n");
    console.log("  log.level:error");
    console.log('  log.level:error AND stream:"payment-service"');
    console.log("  log.level:warn AND log.message:~slow");
    console.log("  log.message:~user_id");
    console.log('  stream:"api-gateway" AND log.level:info');
    console.log("  log.message:~timeout OR log.message:~ECONNREFUSED");
    console.log('  log.level:!info   (everything except info)');
    console.log("");
}

seed();
