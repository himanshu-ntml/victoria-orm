import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const emails = sqliteTable("emails", {
    id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
    to: text("to").notNull(),
    from: text("from").notNull(),
    subject: text("subject").notNull(),
    sentAt: integer("sent_at", { mode: "timestamp" })
        .notNull()
        .default(sql`(unixepoch())`),
    dataSent: text("data_sent"),
    createdAt: integer("created_at", { mode: "timestamp" })
        .notNull()
        .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
        .notNull()
        .$onUpdateFn(() => new Date())
        .$type<Date>(),
    archivedAt: integer("archived_at", { mode: "timestamp" }),
});

export type Email = typeof emails.$inferSelect;
export type NewEmail = typeof emails.$inferInsert;
