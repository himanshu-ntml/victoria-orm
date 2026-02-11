/**
 * VictoriaLogs stream schemas
 */

import { stream, text } from "victoria-orm";

// Email archive stream
export const vlEmails = stream("email-archive", {
    id: text("id"),
    to: text("to").notNull(),
    from: text("from").notNull(),
    subject: text("subject").notNull(),
    dataSent: text("dataSent"),
    sentAt: text("sentAt"),
    createdAt: text("createdAt"),
});

// Application logs stream
export const appLogs = stream("stream1", {
    message: text("log.message"),
    level: text("log.level"),
});
