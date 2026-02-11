#!/usr/bin/env node

/**
 * Email-archive seed script for VictoriaLogs
 *
 * Inserts structured email records with UUIDs for correlation.
 * Sends in batches of 10,000 NDJSON lines per request for throughput.
 *
 * Usage:
 *   node scripts/seed-emails.mjs                   # 1 million (default)
 *   node scripts/seed-emails.mjs --count=5000000   # 5 million
 *   node scripts/seed-emails.mjs --count=100000 --batch=5000
 */

import crypto from "node:crypto";

const BASE_URL = process.env.VICTORIA_BASE_URL || "http://localhost:9428";
const TOKEN = process.env.VICTORIA_TOKEN || "";

function arg(name, fallback) {
    const found = process.argv.find((a) => a.startsWith(`--${name}=`));
    return found ? found.split("=")[1] : fallback;
}

const TOTAL = parseInt(arg("count", "1000000"), 10);
const BATCH = parseInt(arg("batch", "10000"), 10);

// ── Realistic data pools ──

const DOMAINS_TO = [
    "school.edu", "district.org", "parent.gmail.com", "homeschool.co",
    "academy.net", "charter.edu", "tutor.io", "learning.com",
];

const DOMAINS_FROM = [
    "noreply@nicolethemathlady.com",
    "billing@nicolethemathlady.com",
    "support@nicolethemathlady.com",
    "notifications@nicolethemathlady.com",
];

const FIRST_NAMES = [
    "Emma", "Liam", "Olivia", "Noah", "Ava", "James", "Sophia", "William",
    "Isabella", "Oliver", "Mia", "Benjamin", "Charlotte", "Elijah", "Amelia",
    "Lucas", "Harper", "Mason", "Evelyn", "Logan", "Abigail", "Alexander",
    "Emily", "Ethan", "Elizabeth", "Jacob", "Sofia", "Michael", "Avery", "Daniel",
];

const LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller",
    "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez",
    "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
];

const SUBJECTS = [
    { tpl: "Welcome to Nicole the Math Lady!", level: "info" },
    { tpl: "Your subscription has been confirmed", level: "info" },
    { tpl: "Password reset requested", level: "warn" },
    { tpl: "Payment receipt for order #${orderId}", level: "info" },
    { tpl: "Your free trial ends in 3 days", level: "warn" },
    { tpl: "New grade level unlocked: Grade ${grade}", level: "info" },
    { tpl: "Weekly progress report for ${name}", level: "info" },
    { tpl: "Failed payment – please update your card", level: "error" },
    { tpl: "Account suspended due to inactivity", level: "error" },
    { tpl: "Invoice #${invoiceId} is ready", level: "info" },
    { tpl: "Referral bonus applied to your account", level: "info" },
    { tpl: "Login from new device detected", level: "warn" },
    { tpl: "Your coupon code has been applied", level: "info" },
    { tpl: "Subscription renewed successfully", level: "info" },
    { tpl: "Unable to process refund #${refundId}", level: "error" },
];

const STATUSES = ["delivered", "bounced", "deferred", "opened", "clicked"];
const STATUS_WEIGHTS = [0.70, 0.05, 0.05, 0.15, 0.05];

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function weightedPick(items, weights) {
    const r = Math.random();
    let sum = 0;
    for (let i = 0; i < items.length; i++) {
        sum += weights[i];
        if (r < sum) return items[i];
    }
    return items[items.length - 1];
}

function randomDate(daysBack = 90) {
    const now = Date.now();
    const offset = Math.floor(Math.random() * daysBack * 24 * 60 * 60 * 1000);
    return new Date(now - offset).toISOString();
}

function generateEmail() {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const toDomain = pick(DOMAINS_TO);
    const to = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${toDomain}`;
    const from = pick(DOMAINS_FROM);
    const subjectEntry = pick(SUBJECTS);

    const orderId = Math.floor(Math.random() * 900000 + 100000);
    const invoiceId = `INV-${Math.floor(Math.random() * 90000 + 10000)}`;
    const refundId = `REF-${Math.floor(Math.random() * 9000 + 1000)}`;
    const grade = Math.floor(Math.random() * 8 + 1);

    const subject = subjectEntry.tpl
        .replace("${orderId}", orderId)
        .replace("${invoiceId}", invoiceId)
        .replace("${refundId}", refundId)
        .replace("${grade}", grade)
        .replace("${name}", `${firstName} ${lastName}`);

    const status = weightedPick(STATUSES, STATUS_WEIGHTS);
    const level = status === "bounced" || status === "deferred"
        ? "error"
        : subjectEntry.level;

    return JSON.stringify({
        id: crypto.randomUUID(),
        stream: "email-archive",
        date: randomDate(),
        to,
        from,
        subject,
        status,
        log: {
            level,
            message: `Email ${status}: "${subject}" → ${to}`,
        },
    });
}

// ── Batch sender ──

async function sendBatch(lines) {
    const url = new URL(`${BASE_URL}/insert/jsonline`);
    url.searchParams.set("_stream_fields", "stream");
    url.searchParams.set("_time_field", "date");
    url.searchParams.set("_msg_field", "log.message");

    const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
            ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }),
            "Content-Type": "application/stream+json",
        },
        body: lines.join("\n"),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
}

// ── Main ──

async function main() {
    const batches = Math.ceil(TOTAL / BATCH);
    console.log(`\n📧 Seeding ${TOTAL.toLocaleString()} email records`);
    console.log(`   ${batches} batches × ${BATCH.toLocaleString()} records\n`);

    const start = Date.now();
    let sent = 0;

    for (let b = 0; b < batches; b++) {
        const size = Math.min(BATCH, TOTAL - sent);
        const lines = [];
        for (let i = 0; i < size; i++) {
            lines.push(generateEmail());
        }

        await sendBatch(lines);
        sent += size;

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        const rate = Math.round(sent / ((Date.now() - start) / 1000));
        const pct = ((sent / TOTAL) * 100).toFixed(1);
        process.stdout.write(
            `\r   ✅ ${sent.toLocaleString()} / ${TOTAL.toLocaleString()} (${pct}%) — ${rate.toLocaleString()} rec/s — ${elapsed}s`
        );
    }

    const totalTime = ((Date.now() - start) / 1000).toFixed(1);
    const finalRate = Math.round(TOTAL / ((Date.now() - start) / 1000));

    console.log(`\n\n🎉 Done! ${TOTAL.toLocaleString()} emails seeded in ${totalTime}s (${finalRate.toLocaleString()} rec/s)\n`);
    console.log("── Query examples ──\n");
    console.log('  stream:"email-archive"                         — all emails');
    console.log('  stream:"email-archive" AND log.level:error     — failed emails');
    console.log('  stream:"email-archive" AND to:~school.edu      — emails to school.edu');
    console.log('  stream:"email-archive" AND subject:~payment    — payment-related');
    console.log('  stream:"email-archive" AND status:bounced      — bounced emails');
    console.log('  stream:"email-archive" AND from:~billing       — from billing');
    console.log("");
}

main();
