-- D1 emails table
CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    "to" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    subject TEXT NOT NULL,
    sent_at INTEGER NOT NULL DEFAULT (unixepoch()),
    data_sent TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    archived_at INTEGER
);
