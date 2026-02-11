/**
 * Shared HTTP helper — single place for auth headers and error handling.
 *
 * All VictoriaLogs HTTP calls go through this module.
 */

export interface HttpConfig {
    baseUrl: string;
    token: string;
}

function authHeaders(token: string): Record<string, string> {
    return token ? { Authorization: `Bearer ${token}` } : {};
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

    const res = await fetch(url.toString(), {
        headers: authHeaders(config.token),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`VictoriaLogs ${path} failed (${res.status}): ${text}`);
    }

    return res.text();
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

    const res = await fetch(url.toString(), {
        method: "POST",
        headers: {
            ...authHeaders(config.token),
            "Content-Type": "application/stream+json",
        },
        body,
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`VictoriaLogs ${path} failed (${res.status}): ${text}`);
    }
}
