"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/app-shell";
import Link from "next/link";

interface ColumnInfo {
  name: string;
  type: string;
}

interface TableData {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  totalRows: number;
}

export default function TableDetailPage() {
  const params = useParams();
  const table = params.table as string;
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchData = useCallback(async (activeFilters: Record<string, string>) => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams();
      Object.entries(activeFilters).forEach(([col, val]) => {
        if (val.trim()) query.set(col, val.trim());
      });
      const qs = query.toString();
      const res = await fetch(`/api/database/${table}${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const json: TableData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [table]);

  useEffect(() => {
    fetchData({});
  }, [fetchData]);

  const handleFilterChange = (col: string, val: string) => {
    const next = { ...filters, [col]: val };
    setFilters(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData(next), 500);
  };

  if (error) {
    return (
      <AppShell>
        <div className="p-4 md:p-6 max-w-5xl mx-auto">
          <Link href="/database" className="text-[#618B6B] hover:underline mb-4 inline-block">&larr; Back to tables</Link>
          <div className="text-red-400 p-4 rounded-lg" style={{ background: "#201F1F", border: "1px solid rgba(255, 180, 171, 0.3)" }}>
            {error}
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1400px] mx-auto">
        <Link href="/database" className="text-[#618B6B] hover:underline mb-4 inline-block">&larr; Back to tables</Link>

        <h1 className="text-2xl font-bold mb-1 tracking-tight text-[#E5E2E1]" style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
          {table}
        </h1>
        {data && (
          <p className="text-sm text-[#849587] mb-6">(First 100 rows — {data.totalRows.toLocaleString()} total)</p>
        )}

        {loading ? (
          <div className="text-center py-16 text-[#849587]">Loading...</div>
        ) : data && data.columns.length === 0 ? (
          <div className="text-center py-16 text-[#849587]">Table has no columns or is empty.</div>
        ) : data ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {data.columns.map((col) => (
                    <th
                      key={col.name}
                      className="p-2 text-left font-mono text-xs text-[#849587] font-normal"
                      style={{ borderBottom: "1px solid rgba(59, 75, 63, 0.3)" }}
                    >
                      <div className="flex flex-col gap-1">
                        <span>{col.name}</span>
                        <span className="text-[10px] text-[#3B4B3F]">{col.type}</span>
                        <input
                          className="w-full bg-[#131313] border border-[#3B4B3F] rounded px-1.5 py-0.5 text-xs text-[#E5E2E1] outline-none focus:border-[#618B6B]"
                          placeholder="Filter..."
                          value={filters[col.name] || ""}
                          onChange={(e) => handleFilterChange(col.name, e.target.value)}
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr
                    key={i}
                    className="group"
                    style={{ background: i % 2 === 0 ? "transparent" : "rgba(32, 31, 31, 0.5)" }}
                  >
                    {data.columns.map((col) => {
                      const val = row[col.name];
                      const display = val === null ? (
                        <span className="text-[#3B4B3F] italic">NULL</span>
                      ) : typeof val === "object" ? (
                        JSON.stringify(val)
                      ) : (
                        String(val)
                      );
                      return (
                        <td
                          key={col.name}
                          className="p-2 font-mono text-xs text-[#E5E2E1] max-w-[300px] truncate"
                          style={{ borderBottom: "1px solid rgba(59, 75, 63, 0.1)" }}
                          title={typeof display === "string" ? display : undefined}
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
