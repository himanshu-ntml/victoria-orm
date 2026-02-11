import { describe, it, expect } from "vitest";
import { text, enm, stream } from "../src/schema";
import { eq, contains, and, after } from "../src/operators";
import { StreamQuery } from "../src/builder";
import type { QueryConfig } from "../src/builder";

// Shared fixtures
const config: QueryConfig = {
    baseUrl: "https://example.com",
    token: "test-token",
};

const emails = stream("email-archive", {
    to: text("to").notNull(),
    from: text("from").notNull(),
    subject: text("subject"),
    status: enm("status", ["delivered", "bounced", "deferred"] as const),
});

// ━━━ Query Builder ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("StreamQuery", () => {
    it("generates stream-only query", () => {
        const q = new StreamQuery(config, emails);
        expect(q.toLogsQL()).toBe('stream:"email-archive"');
    });

    it("single .where() adds filter", () => {
        const q = new StreamQuery(config, emails)
            .where(eq(emails.status, "bounced"));
        expect(q.toLogsQL()).toBe('stream:"email-archive" AND status:bounced');
    });

    it("multiple .where() calls AND together", () => {
        const q = new StreamQuery(config, emails)
            .where(eq(emails.status, "bounced"))
            .where(contains(emails.to, "school"));
        expect(q.toLogsQL()).toBe(
            'stream:"email-archive" AND status:bounced AND to:~school'
        );
    });

    it("chaining .limit() does not affect query string", () => {
        const q = new StreamQuery(config, emails).limit(50);
        expect(q.toLogsQL()).toBe('stream:"email-archive"');
    });

    it("complex nested filters", () => {
        const q = new StreamQuery(config, emails)
            .where(
                and(
                    eq(emails.status, "bounced"),
                    contains(emails.to, "school")
                )
            )
            .where(after("2h"));
        expect(q.toLogsQL()).toBe(
            'stream:"email-archive" AND (status:bounced) AND (to:~school) AND _time:>2h'
        );
    });
});

// ━━━ onQuery Hook ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("onQuery hook", () => {
    it("fires before toLogsQL (via execute path)", () => {
        const calls: string[] = [];

        const hookConfig: QueryConfig = {
            ...config,
            onQuery: (sql, kind) => calls.push(`${kind}:${sql}`),
        };

        const q = new StreamQuery(hookConfig, emails)
            .where(eq(emails.status, "bounced"));

        // toLogsQL itself doesn't trigger the hook
        q.toLogsQL();
        expect(calls).toHaveLength(0);
    });
});

// ━━━ Exports work correctly ━━━━━━━━━━━━━━━━━━━━

describe("barrel exports", () => {
    it("all public APIs are importable", async () => {
        const mod = await import("../src/index");

        // Core factory
        expect(typeof mod.victoriaLogs).toBe("function");

        // Schema
        expect(typeof mod.stream).toBe("function");
        expect(typeof mod.text).toBe("function");
        expect(typeof mod.timestamp).toBe("function");
        expect(typeof mod.enm).toBe("function");

        // Operators
        expect(typeof mod.eq).toBe("function");
        expect(typeof mod.contains).toBe("function");
        expect(typeof mod.not).toBe("function");
        expect(typeof mod.exists).toBe("function");
        expect(typeof mod.regex).toBe("function");
        expect(typeof mod.and).toBe("function");
        expect(typeof mod.or).toBe("function");
        expect(typeof mod.after).toBe("function");
        expect(typeof mod.before).toBe("function");
        expect(typeof mod.between).toBe("function");
        expect(typeof mod.raw).toBe("function");
    });
});
