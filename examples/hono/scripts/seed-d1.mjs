/**
 * Seed D1 with test emails for archival testing.
 *
 * Usage:
 *   npm run db:seed              # 50 emails (default)
 *   npm run db:seed -- --count 200
 *
 * Requires: wrangler (uses D1 local)
 */

const count = parseInt(
    process.argv.find((a) => a.startsWith("--count"))?.split("=")[1] ||
    process.argv[process.argv.indexOf("--count") + 1] ||
    "50",
    10
);

const domains = [
    "gmail.com",
    "school.edu",
    "company.org",
    "tutor.io",
    "student.net",
];

const senders = [
    "notifications@nicolethemathlady.com",
    "billing@nicolethemathlady.com",
    "support@nicolethemathlady.com",
    "no-reply@nicolethemathlady.com",
];

const subjects = [
    "Welcome to Nicole the Math Lady!",
    "Your subscription has been renewed",
    "Password reset requested",
    "Weekly math progress report",
    "New course available: Algebra 2",
    "Payment receipt #INV-",
    "Account verification needed",
    "Your child completed a lesson!",
    "Upcoming maintenance window",
    "Special holiday discount inside",
];

const firstNames = [
    "Emma",
    "Liam",
    "Olivia",
    "Noah",
    "Ava",
    "Ethan",
    "Sophia",
    "Mason",
    "Isabella",
    "James",
];

const lastNames = [
    "Smith",
    "Johnson",
    "Williams",
    "Brown",
    "Jones",
    "Garcia",
    "Miller",
    "Davis",
    "Wilson",
    "Anderson",
];

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomEmail() {
    const first = pick(firstNames).toLowerCase();
    const last = pick(lastNames).toLowerCase();
    return `${first}.${last}@${pick(domains)}`;
}

function randomDate(daysBack = 30) {
    const now = Date.now();
    const offset = Math.floor(Math.random() * daysBack * 24 * 60 * 60 * 1000);
    return Math.floor((now - offset) / 1000); // unix epoch seconds
}

// Build SQL insert statements (batched for D1 limits)
const BATCH_SIZE = 50;
const batches = [];

for (let i = 0; i < count; i += BATCH_SIZE) {
    const batchCount = Math.min(BATCH_SIZE, count - i);
    const values = [];

    for (let j = 0; j < batchCount; j++) {
        const to = randomEmail();
        const from = pick(senders);
        const subject = pick(subjects) + (Math.random() > 0.5 ? Math.floor(Math.random() * 9999) : "");
        const sentAt = randomDate(30);
        const dataSent = JSON.stringify({ to, from, subject, timestamp: sentAt });

        // Escape single quotes in strings
        const esc = (s) => s.replace(/'/g, "''");

        values.push(
            `('${esc(to)}', '${esc(from)}', '${esc(subject)}', ${sentAt}, '${esc(dataSent)}', ${sentAt}, ${sentAt * 1000})`
        );
    }

    batches.push(
        `INSERT INTO emails ("to", "from", subject, sent_at, data_sent, created_at, updated_at) VALUES\n${values.join(",\n")};`
    );
}

// Write to a temp SQL file and execute via wrangler
import { writeFileSync, unlinkSync } from "fs";
import { execSync } from "child_process";

const tmpFile = `/tmp/seed-d1-${Date.now()}.sql`;
writeFileSync(tmpFile, batches.join("\n\n"));

console.log(`\n📧 Seeding ${count} emails into D1 (local)...\n`);

try {
    execSync(
        `npx wrangler d1 execute emails-db --local --file=${tmpFile}`,
        { cwd: import.meta.dirname, stdio: "inherit" }
    );
    console.log(`\n✅ Seeded ${count} emails into D1\n`);
} catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
} finally {
    unlinkSync(tmpFile);
}
