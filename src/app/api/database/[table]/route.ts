import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ table: string }> }
) {
  const { table } = await params;

  // Validate table name to prevent injection
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
    return NextResponse.json({ error: "Invalid table name" }, { status: 400 });
  }

  try {
    // Get column info
    const columns = await db.$queryRawUnsafe<
      { cid: number; name: string; type: string; notnull: number; dflt_value: string | null; pk: number }[]
    >(`PRAGMA table_info("${table}")`);

    // Get row count
    const countResult = await db.$queryRawUnsafe<{ cnt: number }[]>(
      `SELECT COUNT(*) as cnt FROM "${table}"`
    );
    const totalRows = countResult[0]?.cnt ?? 0;

    // Build query with optional filters
    const searchParams = _request.nextUrl.searchParams;
    const filters: { col: string; val: string }[] = [];
    searchParams.forEach((val, key) => {
      const col = columns.find((c) => c.name === key);
      if (col && val.trim()) {
        filters.push({ col: key, val: val.trim() });
      }
    });

    let query = `SELECT * FROM "${table}"`;
    const queryParams: string[] = [];

    if (filters.length > 0) {
      const whereClauses = filters.map((f) => {
        queryParams.push(`%${f.val}%`);
        return `"${f.col}" LIKE ?`;
      });
      query += ` WHERE ${whereClauses.join(" AND ")}`;
    }

    query += ` LIMIT 100`;

    const rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(query, ...queryParams);

    return NextResponse.json({
      columns: columns.map((c) => ({ name: c.name, type: c.type })),
      rows,
      totalRows,
    });
  } catch (error) {
    console.error(`Failed to query table "${table}":`, error);
    return NextResponse.json({ error: "Failed to query table" }, { status: 500 });
  }
}
