import { NextRequest, NextResponse } from "next/server";
import { vl } from "@/providers/victoria";

// GET /api/logs/stats?query=stream:"email-archive" AND to:~ethan
export async function GET(req: NextRequest) {
    const query = req.nextUrl.searchParams.get("query") || "log.level:*";

    try {
        const total = await vl.rawCount(query);
        return NextResponse.json({ total });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
