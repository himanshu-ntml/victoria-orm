import { describe, it, expect } from "vitest";
import {
    text,
    timestamp,
    enm,
    stream,
} from "../src/schema";

// ━━━ Column Factories ━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("text()", () => {
    it("creates a text column with correct fieldName", () => {
        const col = text("email");
        expect(col.fieldName).toBe("email");
        expect(col.kind).toBe("text");
        expect(col.required).toBe(false);
    });

    it(".notNull() marks as required", () => {
        const col = text("email").notNull();
        expect(col.required).toBe(true);
        expect(col.fieldName).toBe("email");
    });
});

describe("timestamp()", () => {
    it("creates a timestamp column", () => {
        const col = timestamp("created_at");
        expect(col.fieldName).toBe("created_at");
        expect(col.kind).toBe("timestamp");
        expect(col.required).toBe(false);
    });

    it(".notNull() marks as required", () => {
        const col = timestamp("created_at").notNull();
        expect(col.required).toBe(true);
    });
});

describe("enm()", () => {
    it("creates an enum column with values", () => {
        const col = enm("status", ["active", "inactive"] as const);
        expect(col.fieldName).toBe("status");
        expect(col.kind).toBe("enum");
        expect(col.values).toEqual(["active", "inactive"]);
        expect(col.required).toBe(false);
    });

    it(".notNull() marks as required", () => {
        const col = enm("status", ["a", "b"] as const).notNull();
        expect(col.required).toBe(true);
    });
});

// ━━━ Stream ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("stream()", () => {
    const emails = stream("email-archive", {
        id: text("id"),
        to: text("to").notNull(),
        from: text("from").notNull(),
        subject: text("subject"),
        status: enm("status", ["delivered", "bounced"] as const),
    });

    it("has the correct stream name", () => {
        expect(emails.streamName).toBe("email-archive");
    });

    it("exposes fields via proxy", () => {
        expect(emails.to.fieldName).toBe("to");
        expect(emails.status.fieldName).toBe("status");
        expect(emails.status.kind).toBe("enum");
    });

    it("required fields are marked", () => {
        expect(emails.to.required).toBe(true);
        expect(emails.from.required).toBe(true);
        expect(emails.subject.required).toBe(false);
        expect(emails.id.required).toBe(false);
    });

    it("has all fields in .fields", () => {
        expect(Object.keys(emails.fields)).toEqual([
            "id", "to", "from", "subject", "status",
        ]);
    });
});
