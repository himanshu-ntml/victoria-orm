import { NextRequest, NextResponse } from "next/server";
import { vl } from "@/providers/victoria";
import { emails } from "@/providers/victoria/schema";
import { eq, contains, and, raw } from "victoria-orm";

/**
 * /api/emails — fully typed ORM endpoint
 *
 * GET /api/emails                          → all emails
 * GET /api/emails?status=bounced           → by status (typed enum)
 * GET /api/emails?to=school.edu            → by recipient (substring)
 * GET /api/emails?status=delivered&to=ethan → combined
 * GET /api/emails?q=subject:~payment       → raw filter (escape hatch)
 * GET /api/emails?count=true               → count instead of rows
 *
 * POST /api/emails                         → insert email(s)
 */
export async function GET(req: NextRequest) {
    const status = req.nextUrl.searchParams.get("status");
    const to = req.nextUrl.searchParams.get("to");
    const rawFilter = req.nextUrl.searchParams.get("q");
    const wantCount = req.nextUrl.searchParams.get("count") === "true";
    const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100", 10);
    const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0", 10);

    try {
        let query = vl.select().from(emails);

        const filters = [];
        if (status) filters.push(eq(emails.status, status as typeof emails.status._type));
        if (to) filters.push(contains(emails.to, to));
        if (rawFilter) filters.push(raw(rawFilter));

        if (filters.length === 1) query = query.where(filters[0]);
        else if (filters.length > 1) query = query.where(and(...filters));

        if (wantCount) {
            return NextResponse.json({ total: await query.count() });
        }

        return NextResponse.json(await query.limit(limit).offset(offset).execute());
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

// POST /api/emails — typed insert
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const result = await vl.insert(emails).values(body);
        return NextResponse.json(result);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
