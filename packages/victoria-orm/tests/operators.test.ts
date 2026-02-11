import { describe, it, expect } from "vitest";
import { text, enm, stream } from "../src/schema";
import {
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
} from "../src/operators";

// Shared schema
const emails = stream("email-archive", {
    to: text("to").notNull(),
    from: text("from").notNull(),
    subject: text("subject"),
    status: enm("status", ["delivered", "bounced", "deferred"] as const),
});

// ━━━ Comparison Operators ━━━━━━━━━━━━━━━━━━━━━━

describe("eq()", () => {
    it("generates exact match", () => {
        expect(eq(emails.status, "bounced").toLogsQL()).toBe("status:bounced");
    });

    it("quotes values with special characters", () => {
        expect(eq(emails.to, "a@b.com").toLogsQL()).toBe('to:"a@b.com"');
    });
});

describe("contains()", () => {
    it("generates substring match", () => {
        expect(contains(emails.to, "school").toLogsQL()).toBe("to:~school");
    });

    it("quotes values with dots", () => {
        expect(contains(emails.to, "school.edu").toLogsQL()).toBe('to:~"school.edu"');
    });
});

describe("not()", () => {
    it("generates negation", () => {
        expect(not(emails.status, "delivered").toLogsQL()).toBe("NOT status:delivered");
    });
});

describe("exists()", () => {
    it("generates wildcard match", () => {
        expect(exists(emails.subject).toLogsQL()).toBe("subject:*");
    });
});

describe("regex()", () => {
    it("generates regex match", () => {
        expect(regex(emails.to, ".*@school\\.edu").toLogsQL()).toBe('to:~".*@school\\.edu"');
    });
});

// ━━━ Logical Combinators ━━━━━━━━━━━━━━━━━━━━━━

describe("and()", () => {
    it("combines with AND", () => {
        const f = and(
            eq(emails.status, "bounced"),
            contains(emails.to, "school")
        );
        expect(f.toLogsQL()).toBe("(status:bounced) AND (to:~school)");
    });

    it("handles 3+ filters", () => {
        const f = and(
            eq(emails.status, "bounced"),
            contains(emails.to, "edu"),
            exists(emails.subject)
        );
        expect(f.toLogsQL()).toBe("(status:bounced) AND (to:~edu) AND (subject:*)");
    });
});

describe("or()", () => {
    it("combines with OR", () => {
        const f = or(
            eq(emails.status, "bounced"),
            eq(emails.status, "deferred")
        );
        expect(f.toLogsQL()).toBe("(status:bounced) OR (status:deferred)");
    });
});

// ━━━ Time Filters ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("after()", () => {
    it("generates time filter", () => {
        expect(after("2h").toLogsQL()).toBe("_time:>2h");
    });

    it("handles ISO dates", () => {
        expect(after("2026-01-01").toLogsQL()).toBe("_time:>2026-01-01");
    });
});

describe("before()", () => {
    it("generates time filter", () => {
        expect(before("2026-01-01").toLogsQL()).toBe("_time:>2026-01-01".replace(">", "<"));
    });
});

describe("between()", () => {
    it("generates AND of after + before", () => {
        expect(between("2026-01-01", "2026-02-01").toLogsQL()).toBe(
            "(_time:>2026-01-01) AND (_time:<2026-02-01)"
        );
    });
});

// ━━━ Raw ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("raw()", () => {
    it("passes through verbatim", () => {
        const q = raw('stream:"my-stream" AND custom:value');
        expect(q.toLogsQL()).toBe('stream:"my-stream" AND custom:value');
    });
});
