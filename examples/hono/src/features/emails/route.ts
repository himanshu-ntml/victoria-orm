/**
 * Emails feature — routes
 */

import { Hono } from "hono";
import type { Bindings } from "@/providers/victoria";
import { listEmails, getEmail, createEmail, triggerArchive, triggerCleanup, getEmailCount } from "./controller";

const emails = new Hono<{ Bindings: Bindings }>();

emails.get("/", listEmails);
emails.get("/count", getEmailCount);
emails.get("/:id", getEmail);
emails.post("/", createEmail);
emails.post("/archive", triggerArchive);
emails.post("/cleanup", triggerCleanup);

export { emails };
