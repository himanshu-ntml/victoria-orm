"use client";

import { useState, useCallback } from "react";

interface LogEntry {
  _time?: string;
  _msg?: string;
  _stream?: string;
  log?: { level?: string; message?: string };
  stream?: string;
  date?: string;
  id?: string;
  to?: string;
  from?: string;
  subject?: string;
  status?: string;
  [key: string]: unknown;
}

interface StatsResponse {
  total?: number;
  rows?: { label: string; count: number }[];
  error?: string;
}

const LEVEL_OPTIONS = ["info", "warn", "error", "debug", "trace"];
const PAGE_SIZE = 100;

const QUERY_GROUPS = [
  {
    title: "General",
    items: [
      { label: "All logs", query: "log.level:*" },
      { label: "Errors", query: "log.level:error" },
      { label: "Warnings", query: "log.level:warn" },
      { label: "Not info", query: "log.level:!info" },
    ],
  },
  {
    title: "Services",
    items: [
      { label: "Payment svc", query: 'log.level:error AND stream:"payment-service"' },
      { label: "Auth svc", query: 'stream:"auth-service"' },
      { label: "API gateway", query: 'stream:"api-gateway" AND log.level:info' },
      { label: "Slow queries", query: "log.message:~slow" },
      { label: "Timeouts", query: "log.message:~timeout OR log.message:~ECONNREFUSED" },
    ],
  },
  {
    title: "📧 Emails",
    items: [
      { label: "All emails", query: 'stream:"email-archive"' },
      { label: "Failed", query: 'stream:"email-archive" AND log.level:error' },
      { label: "Bounced", query: 'stream:"email-archive" AND status:bounced' },
      { label: "→ school.edu", query: 'stream:"email-archive" AND to:~school.edu' },
      { label: "From billing", query: 'stream:"email-archive" AND from:~billing' },
      { label: "Payment subj", query: 'stream:"email-archive" AND subject:~payment' },
      { label: "Trial ending", query: 'stream:"email-archive" AND subject:~trial' },
      { label: "Opened", query: 'stream:"email-archive" AND status:opened' },
      { label: "Name: Ethan", query: 'stream:"email-archive" AND to:~ethan' },
    ],
  },
];

export default function Home() {
  // — Insert state —
  const [level, setLevel] = useState("info");
  const [message, setMessage] = useState("");
  const [stream, setStream] = useState("stream1");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  // — Query state —
  const [query, setQuery] = useState("log.level:*");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [querying, setQuerying] = useState(false);
  const [queryError, setQueryError] = useState("");

  // — Pagination state —
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // — Stats state —
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const handleInsert = useCallback(async () => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level, message, stream }),
      });
      const data = await res.json();
      if (data.success) {
        setSendResult({ ok: true, text: "Log inserted successfully" });
        setMessage("");
      } else {
        setSendResult({ ok: false, text: data.error || "Unknown error" });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSendResult({ ok: false, text: msg });
    } finally {
      setSending(false);
    }
  }, [level, message, stream]);

  const fetchLogs = useCallback(async (q: string, pageOffset: number) => {
    setQuerying(true);
    setQueryError("");
    try {
      const params = new URLSearchParams({
        query: q,
        limit: String(PAGE_SIZE),
        offset: String(pageOffset),
      });
      const res = await fetch(`/api/logs?${params}`);
      const data = await res.json();
      if (data.error) {
        setQueryError(data.error);
        setLogs([]);
        setHasMore(false);
      } else {
        setLogs(data.logs || []);
        setHasMore(data.hasMore || false);
        setOffset(pageOffset);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setQueryError(msg);
    } finally {
      setQuerying(false);
    }
  }, []);

  const handleQuery = useCallback(() => {
    setOffset(0);
    setStats(null);
    fetchLogs(query, 0);
  }, [query, fetchLogs]);

  const handleNextPage = useCallback(() => {
    fetchLogs(query, offset + PAGE_SIZE);
  }, [query, offset, fetchLogs]);

  const handlePrevPage = useCallback(() => {
    fetchLogs(query, Math.max(0, offset - PAGE_SIZE));
  }, [query, offset, fetchLogs]);

  const handleStats = useCallback(async () => {
    setLoadingStats(true);
    setStats(null);
    try {
      const res = await fetch(`/api/logs/stats?query=${encodeURIComponent(query)}`);
      const data: StatsResponse = await res.json();
      if (data.error) {
        setQueryError(data.error);
      } else {
        setStats(data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setQueryError(msg);
    } finally {
      setLoadingStats(false);
    }
  }, [query]);

  // — Auto-detect if results contain email fields —
  const isEmailView = logs.length > 0 && logs.some((e) => e.to || e.subject);

  const getLevelClass = (entry: LogEntry) => {
    const lvl = entry.log?.level || entry._stream || "";
    if (lvl.includes("error")) return "level-error";
    if (lvl.includes("warn")) return "level-warn";
    if (lvl.includes("debug")) return "level-debug";
    return "level-info";
  };

  const getLogMessage = (entry: LogEntry): string => {
    return entry._msg || entry.log?.message || JSON.stringify(entry);
  };

  const getLogLevel = (entry: LogEntry): string => {
    return entry.log?.level || "—";
  };

  const getLogTime = (entry: LogEntry): string => {
    if (entry._time) {
      try {
        return new Date(entry._time).toLocaleString();
      } catch {
        return entry._time;
      }
    }
    if (entry.date) return entry.date;
    return "—";
  };

  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="dashboard">
      <header className="header">
        <div className="logo">
          <span className="logo-icon">◉</span>
          <h1>VictoriaLogs</h1>
        </div>
        <p className="subtitle">Log Ingestion &amp; Query Dashboard</p>
      </header>

      <div className="panels">
        {/* ——— Insert Panel ——— */}
        <section className="panel insert-panel">
          <div className="panel-header">
            <h2>
              <span className="panel-icon">⬆</span> Insert Log
            </h2>
          </div>
          <div className="panel-body">
            <div className="form-group">
              <label htmlFor="level">Level</label>
              <select
                id="level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              >
                {LEVEL_OPTIONS.map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="stream">Stream</label>
              <input
                id="stream"
                type="text"
                value={stream}
                onChange={(e) => setStream(e.target.value)}
                placeholder="stream1"
              />
            </div>

            <div className="form-group">
              <label htmlFor="message">Message</label>
              <textarea
                id="message"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Enter your log message…"
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={handleInsert}
              disabled={sending || !message.trim()}
            >
              {sending ? "Sending…" : "Send Log"}
            </button>

            {sendResult && (
              <div
                className={`toast ${sendResult.ok ? "toast-success" : "toast-error"}`}
              >
                {sendResult.text}
              </div>
            )}
          </div>
        </section>

        {/* ——— Query Panel ——— */}
        <section className="panel query-panel">
          <div className="panel-header">
            <h2>
              <span className="panel-icon">⬇</span> Query Logs
            </h2>
          </div>
          <div className="panel-body">
            <div className="query-bar">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="log.level:info"
                onKeyDown={(e) => e.key === "Enter" && handleQuery()}
              />
              <button
                className="btn btn-secondary"
                onClick={handleQuery}
                disabled={querying}
              >
                {querying ? "Querying…" : "Run Query"}
              </button>
              <button
                className="btn btn-stats"
                onClick={handleStats}
                disabled={loadingStats}
                title="Get count for current query"
              >
                {loadingStats ? "…" : "Count"}
              </button>
            </div>

            {/* ——— Stats Results ——— */}
            {stats && (
              <div className="stats-result">
                {stats.total !== undefined && (
                  <div className="stats-row">
                    <span className="stats-item">
                      <span className="stats-key">Total</span>
                      <span className="stats-value">{stats.total.toLocaleString()}</span>
                    </span>
                  </div>
                )}
                {stats.rows && stats.rows.map((row, i) => (
                  <div key={i} className="stats-row">
                    <span className="stats-item">
                      <span className="stats-key">{row.label}</span>
                      <span className="stats-value">{row.count.toLocaleString()}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* ——— Grouped Query Chips ——— */}
            {QUERY_GROUPS.map((group) => (
              <div key={group.title} className="query-examples">
                <span className="query-examples-label">{group.title}</span>
                {group.items.map((ex) => (
                  <button
                    key={ex.label}
                    className={`query-chip ${query === ex.query ? "query-chip-active" : ""}`}
                    onClick={() => setQuery(ex.query)}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            ))}

            {queryError && (
              <div className="toast toast-error">{queryError}</div>
            )}

            <div className="log-viewer">
              {logs.length === 0 && !querying && (
                <div className="empty-state">
                  <span className="empty-icon">⊘</span>
                  <p>No logs yet. Run a query above.</p>
                </div>
              )}

              {/* ——— Email table view ——— */}
              {logs.length > 0 && isEmailView && (
                <div className="log-table-wrap">
                  <table className="log-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Status</th>
                        <th>To</th>
                        <th>Subject</th>
                        <th>ID</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((entry, i) => (
                        <tr key={i} className={getLevelClass(entry)}>
                          <td className="cell-time">{getLogTime(entry)}</td>
                          <td className="cell-level">
                            <span className={`status-badge status-${entry.status || "unknown"}`}>
                              {entry.status || "—"}
                            </span>
                          </td>
                          <td className="cell-to">{(entry.to as string) || "—"}</td>
                          <td className="cell-subject">{(entry.subject as string) || "—"}</td>
                          <td className="cell-id" title={(entry.id as string) || ""}>
                            {(entry.id as string)?.slice(0, 8) || "—"}…
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ——— Generic log table view ——— */}
              {logs.length > 0 && !isEmailView && (
                <div className="log-table-wrap">
                  <table className="log-table">
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Level</th>
                        <th>Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((entry, i) => (
                        <tr key={i} className={getLevelClass(entry)}>
                          <td className="cell-time">{getLogTime(entry)}</td>
                          <td className="cell-level">
                            <span className="level-badge">
                              {getLogLevel(entry)}
                            </span>
                          </td>
                          <td className="cell-msg">{getLogMessage(entry)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ——— Pagination ——— */}
              {logs.length > 0 && (
                <div className="pagination-bar">
                  <div className="log-count">
                    {logs.length} log{logs.length !== 1 ? "s" : ""} · Page {currentPage}
                  </div>
                  <div className="pagination-controls">
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handlePrevPage}
                      disabled={offset === 0 || querying}
                    >
                      ← Prev
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={handleNextPage}
                      disabled={!hasMore || querying}
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
