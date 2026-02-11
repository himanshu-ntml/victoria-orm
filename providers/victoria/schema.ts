/**
 * Stream schemas — your data models.
 *
 * @example
 *   import { emails, appLogs } from '@/providers/victoria/schema';
 */

import { stream, text, enm } from "victoria-orm";

export const emails = stream("email-archive", {
    id: text("id"),
    to: text("to").notNull(),
    from: text("from").notNull(),
    subject: text("subject").notNull(),
    status: enm("status", [
        "delivered",
        "bounced",
        "deferred",
        "opened",
        "clicked",
    ] as const),
});

export const appLogs = stream("stream1", {
    message: text("log.message"),
    level: text("log.level"),
});

export const paymentService = stream("payment-service", {
    message: text("log.message"),
    level: text("log.level"),
});

export const authService = stream("auth-service", {
    message: text("log.message"),
    level: text("log.level"),
});

export const apiGateway = stream("api-gateway", {
    message: text("log.message"),
    level: text("log.level"),
});
