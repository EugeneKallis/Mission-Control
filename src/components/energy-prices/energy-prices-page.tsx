"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SupplierOffer {
  id: number;
  supplier: string;
  rate: number;
  monthlyCost: number;
  savings: number | null;
  plan: string;
  billingCycles: number | null;
  recs: number | null;
  phone: string;
  isActive: boolean;
  fetchedAt: string;
}

interface EnergyPricesData {
  offers: SupplierOffer[];
  targetRate: number | null;
  hasBetter: boolean;
  betterCount: number;
  lastScrapedAt: string | null;
}

export function EnergyPricesPage() {
  const [data, setData] = useState<EnergyPricesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [targetInput, setTargetInput] = useState("");
  const [targetRate, setTargetRate] = useState<number | null>(null);
  const [editingTarget, setEditingTarget] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch data ────────────────────────────────────────────────────

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch("/api/energy-prices");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: EnergyPricesData = await res.json();
      setData(json);
      // If this is the first load, seed the target input
      if (json.targetRate !== null) {
        setTargetRate(json.targetRate);
        setTargetInput(String(json.targetRate));
      }
    } catch (err) {
      console.error("Failed to fetch energy prices:", err);
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPrices(); }, [fetchPrices]);

  // ── Poll for badge count ───────────────────────────────────────────
  // (sidebar handles its own poll via /api/energy-prices)

  // ── Set target rate ────────────────────────────────────────────────

  const handleSaveTarget = useCallback(async () => {
    const rate = parseFloat(targetInput);
    if (isNaN(rate) || rate < 0 || rate > 100) return;
    try {
      const res = await fetch("/api/energy-prices/target", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTargetRate(rate);
      setEditingTarget(false);
      // Refresh data to update badge status
      fetchPrices();
    } catch (err) {
      console.error("Failed to save target rate:", err);
    }
  }, [targetInput, fetchPrices]);

  // ── Manual refresh ─────────────────────────────────────────────────

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const res = await fetch("/api/energy-prices/refresh", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      await fetchPrices();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, [fetchPrices]);

  // ── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="text-on-surface-variant animate-pulse">Loading energy prices…</div>
      </div>
    );
  }

  const offers = data?.offers ?? [];
  const hasData = offers.length > 0;
  const lastScraped = data?.lastScrapedAt
    ? new Date(data.lastScrapedAt).toLocaleString()
    : "Never";

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Energy Prices</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Eversource • Residential • 750 kWh/month
            {hasData && <span className="ml-3">Last updated: {lastScraped}</span>}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-4 py-2 text-sm font-medium rounded-none transition-colors disabled:opacity-50"
            style={{
              background: "rgba(59, 75, 63, 0.2)",
              color: "var(--color-on-surface)",
              border: "1px solid rgba(59, 75, 63, 0.3)",
            }}
          >
            {refreshing ? "Scraping…" : "Refresh Now"}
          </button>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────── */}
      {error && (
        <div
          className="mb-4 px-4 py-3 text-sm"
          style={{
            background: "rgba(255, 180, 171, 0.1)",
            border: "1px solid rgba(255, 180, 171, 0.3)",
            color: "#FFB4AB",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Target Rate Card ────────────────────────────────── */}
      <div
        className="mb-6 p-4"
        style={{
          background: "rgba(59, 75, 63, 0.15)",
          border: "1px solid rgba(59, 75, 63, 0.3)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-on-surface">My Target Rate</label>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Enter your current supply rate — offers at or below this are highlighted
            </p>
          </div>

          {editingTarget ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  className="w-24 px-3 py-1.5 text-sm text-right font-mono outline-none"
                  style={{
                    background: "rgba(0, 0, 0, 0.2)",
                    color: "var(--color-on-surface)",
                    border: "1px solid rgba(59, 75, 63, 0.4)",
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveTarget(); }}
                  autoFocus
                />
                <span className="ml-1 text-sm text-on-surface-variant">¢/kWh</span>
              </div>
              <button
                onClick={handleSaveTarget}
                className="px-3 py-1.5 text-sm font-medium rounded-none transition-colors"
                style={{
                  background: "rgba(59, 75, 63, 0.3)",
                  color: "var(--color-on-surface)",
                }}
              >
                Save
              </button>
              <button
                onClick={() => { setEditingTarget(false); setTargetInput(String(targetRate ?? "")); }}
                className="px-3 py-1.5 text-sm rounded-none text-on-surface-variant hover:text-on-surface transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold font-mono">
                {targetRate !== null ? `${targetRate.toFixed(2)}¢/kWh` : "Not set"}
              </span>
              <button
                onClick={() => setEditingTarget(true)}
                className="text-xs text-primary hover:underline transition-colors"
              >
                {targetRate !== null ? "Change" : "Set rate"}
              </button>
            </div>
          )}
        </div>

        {/* Summary stats when target rate is set */}
        {targetRate !== null && data && (
          <div className="mt-3 flex gap-6 text-sm">
            <div>
              <span className="text-on-surface-variant">Monthly budget: </span>
              <span className="font-mono font-semibold">
                ${(targetRate * 750 / 100).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-on-surface-variant">Offers beating your rate: </span>
              <span
                className={`font-mono font-semibold ${data.betterCount > 0 ? "text-green-400" : "text-on-surface-variant"}`}
              >
                {data.betterCount}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────── */}
      {!hasData ? (
        <div
          className="p-8 text-center text-on-surface-variant"
          style={{
            border: "1px solid rgba(59, 75, 63, 0.3)",
            background: "rgba(59, 75, 63, 0.05)",
          }}
        >
          <p className="text-lg mb-2">No price data yet</p>
          <p className="text-sm">
            Click <strong>Refresh Now</strong> to scrape the latest rates from
            EnergizeCT.com (uses Playwright, takes ~20-40s).
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table
            className="w-full text-sm"
            style={{ borderCollapse: "collapse" }}
          >
            <thead>
              <tr
                className="text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant"
                style={{ borderBottom: "1px solid rgba(59, 75, 63, 0.3)" }}
              >
                <th className="py-3 px-4">Supplier</th>
                <th className="py-3 px-4 text-right">Rate (¢/kWh)</th>
                <th className="py-3 px-4 text-right">Monthly Cost</th>
                <th className="py-3 px-4 text-right">vs Standard</th>
                <th className="py-3 px-4">Plan</th>
                <th className="py-3 px-4">Term</th>
                <th className="py-3 px-4 text-right">RECs</th>
                <th className="py-3 px-4">Phone</th>
              </tr>
            </thead>
            <tbody>
              {offers.map((offer, i) => {
                const isBetter =
                  targetRate !== null &&
                  offer.rate <= targetRate &&
                  offer.supplier !== "Eversource - Standard Service";

                const rowBg = isBetter
                  ? "rgba(81, 207, 102, 0.08)"
                  : i % 2 === 0
                    ? "rgba(59, 75, 63, 0.05)"
                    : "transparent";

                const savingsStr = offer.savings !== null
                  ? `${offer.savings > 0 ? "+" : ""}$${offer.savings.toFixed(2)}/mo`
                  : "—";

                const isStandard = offer.supplier === "Eversource - Standard Service";

                return (
                  <tr
                    key={offer.id}
                    style={{
                      borderBottom: "1px solid rgba(59, 75, 63, 0.15)",
                      background: rowBg,
                    }}
                    className="hover:bg-surface-container-high transition-colors"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {isBetter && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                            style={{
                              background: "rgba(81, 207, 102, 0.2)",
                              color: "#51CF66",
                              border: "1px solid rgba(81, 207, 102, 0.4)",
                            }}
                          >
                            ✓ Save
                          </span>
                        )}
                        <span className={isStandard ? "font-semibold text-on-surface-variant" : ""}>
                          {offer.supplier}
                        </span>
                      </div>
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono ${
                        isBetter ? "text-green-400 font-bold" : ""
                      }`}
                    >
                      {offer.rate.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      ${offer.monthlyCost.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-on-surface-variant">
                      {savingsStr}
                    </td>
                    <td className="py-3 px-4 text-on-surface-variant max-w-[200px] truncate" title={offer.plan}>
                      {offer.plan || "—"}
                    </td>
                    <td className="py-3 px-4 text-on-surface-variant">
                      {offer.billingCycles ? `${offer.billingCycles} billing cycles` : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-on-surface-variant">
                      {offer.recs !== null ? `${offer.recs}%` : "—"}
                    </td>
                    <td className="py-3 px-4 text-on-surface-variant text-xs">
                      {offer.phone || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-3 text-xs text-on-surface-variant">
            Showing {offers.length} offers • Sorted by rate (cheapest first)
            {data?.lastScrapedAt && (
              <span> • Last scraped: {new Date(data.lastScrapedAt).toLocaleString()}</span>
            )}
          </div>
        </div>
      )}

      {/* ── Disclaimer ─────────────────────────────────────── */}
      <div
        className="mt-6 p-3 text-xs text-on-surface-variant/60 leading-relaxed"
        style={{
          border: "1px solid rgba(59, 75, 63, 0.2)",
          background: "rgba(59, 75, 63, 0.05)",
        }}
      >
        Data sourced from{" "}
        <a
          href="https://www.energizect.com/rate-board/compare-energy-supplier-rates"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          EnergizeCT.com
        </a>
        . Standard service rate is set by Eversource and updated semi-annually.
        Supplier rates and terms are subject to change. Always verify with the
        supplier before enrolling.
      </div>
    </div>
  );
}
