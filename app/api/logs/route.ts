import { NextRequest, NextResponse } from "next/server";
import { vl } from "@/providers/victoria";

// GET /api/logs?query=log.level:*&limit=100&offset=0
export async function GET(req: NextRequest) {
    const query = req.nextUrl.searchParams.get("query") || "log.level:*";
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100", 10);
    const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0", 10);

    try {
        const result = await vl.rawQuery(query, { limit, offset });
        return NextResponse.json(result);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// POST /api/logs  body: { level, message, stream }
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { level = "info", message, stream = "stream1" } = body;

        vl.log
            .withMetadata({ stream })
        [level as "info" | "warn" | "error" | "debug"](message);

        return NextResponse.json({ success: true });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
