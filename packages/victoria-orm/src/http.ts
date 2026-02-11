/**
 * Shared HTTP helper — single place for auth headers, timeouts, and error handling.
 *
 * All VictoriaLogs HTTP calls go through this module.
 */

export interface HttpConfig {
    baseUrl: string;
    token: string;
    /** Request timeout in ms (default: 10000) */
    timeout?: number;
    /** Log requests to console like Drizzle's logger */
    logger?: boolean;
}

function authHeaders(token: string): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function logRequest(config: HttpConfig, method: string, path: string, params: Record<string, string>): void {
    if (!config.logger) return;

    const query = params.query || "";
    const limit = params.limit || "";
    const ts = new Date().toISOString().slice(11, 23);

    console.log(
        `\x1b[36m[victoria-orm]\x1b[0m \x1b[33m${ts}\x1b[0m ${method} ${path}${query ? ` → \x1b[32m${query}\x1b[0m` : ""}${limit ? ` (limit: ${limit})` : ""}`
    );
}

function logResult(config: HttpConfig, startTime: number, resultSize: number): void {
    if (!config.logger) return;

    const duration = Date.now() - startTime;
    console.log(
        `\x1b[36m[victoria-orm]\x1b[0m ✓ ${resultSize} bytes in ${duration}ms`
    );
}

function logError(config: HttpConfig, path: string, error: unknown): void {
    if (!config.logger) return;

    const msg = error instanceof Error ? error.message : String(error);
    console.log(
        `\x1b[36m[victoria-orm]\x1b[0m \x1b[31m✗ ${path}: ${msg}\x1b[0m`
    );
}

/** GET request to VictoriaLogs */
export async function vlGet(
    config: HttpConfig,
    path: string,
    params: Record<string, string>
): Promise<string> {
    const url = new URL(`${config.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }

    logRequest(config, "GET", path, params);
    const startTime = Date.now();

    try {
        const res = await fetch(url.toString(), {
            headers: authHeaders(config.token),
            signal: AbortSignal.timeout(config.timeout ?? 10_000),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`VictoriaLogs ${path} failed (${res.status}): ${text}`);
        }

        const text = await res.text();
        logResult(config, startTime, text.length);
        return text;
    } catch (error) {
        logError(config, path, error);

        if (error instanceof DOMException && error.name === "TimeoutError") {
            throw new Error(
                `VictoriaLogs ${path} timed out after ${config.timeout ?? 10_000}ms — is the server running at ${config.baseUrl}?`
            );
        }

        if (error instanceof TypeError && (error.message.includes("fetch") || error.message.includes("connect"))) {
            throw new Error(
                `Cannot connect to VictoriaLogs at ${config.baseUrl} — is the server running? (${error.message})`
            );
        }

        throw error;
    }
}

/** POST request to VictoriaLogs */
export async function vlPost(
    config: HttpConfig,
    path: string,
    params: Record<string, string>,
    body: string
): Promise<void> {
    const url = new URL(`${config.baseUrl}${path}`);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }

    logRequest(config, "POST", path, params);
    const startTime = Date.now();

    try {
        const res = await fetch(url.toString(), {
            method: "POST",
            headers: {
                ...authHeaders(config.token),
                "Content-Type": "application/stream+json",
            },
            body,
            signal: AbortSignal.timeout(config.timeout ?? 10_000),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`VictoriaLogs ${path} failed (${res.status}): ${text}`);
        }

        logResult(config, startTime, body.length);
    } catch (error) {
        logError(config, path, error);

        if (error instanceof DOMException && error.name === "TimeoutError") {
            throw new Error(
                `VictoriaLogs ${path} timed out after ${config.timeout ?? 10_000}ms — is the server running at ${config.baseUrl}?`
            );
        }

        if (error instanceof TypeError && (error.message.includes("fetch") || error.message.includes("connect"))) {
            throw new Error(
                `Cannot connect to VictoriaLogs at ${config.baseUrl} — is the server running? (${error.message})`
            );
        }

        throw error;
    }
}
