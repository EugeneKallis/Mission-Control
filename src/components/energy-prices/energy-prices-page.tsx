"use client";

import { useCallback, useEffect, useState } from "react";

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

  const fetchPrices = useCallback(async () => {
    try {
      const res = await fetch("/api/energy-prices");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: EnergyPricesData = await res.json();
      setData(json);
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

  const handleSaveTarget = useCallback(async () => {
    let rate = parseFloat(targetInput);
    if (isNaN(rate) || rate < 0 || rate > 100) return;

    let convertedFromDollars = false;
    if (rate < 1 && rate > 0) {
      rate = rate * 100;
      convertedFromDollars = true;
    }

    try {
      const res = await fetch("/api/energy-prices/target", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTargetRate(rate);
      setEditingTarget(false);
      if (convertedFromDollars) {
        setTargetInput(String(rate));
      }
      fetchPrices();
    } catch (err) {
      console.error("Failed to save target rate:", err);
    }
  }, [targetInput, fetchPrices]);

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

  if (loading) {
    return (
      <div className="flex-1 p-6 flex items-center justify-center">
        <div className="text-on-surface-variant animate-pulse">Loading energy prices&hellip;</div>
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
        <div>
          <h1 className="text-2xl font-bold font-display text-on-surface">Energy Prices</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            Eversource &bull; Residential &bull; 750 kWh/month
            {hasData && <span className="ml-3 text-on-surface-variant">Last updated: {lastScraped}</span>}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-[var(--radius-button)] transition-all duration-200 bg-surface-container text-on-surface hover:bg-surface-container-high disabled:opacity-50 active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-sm">{refreshing ? "sync" : "refresh"}</span>
            {refreshing ? "Scraping…" : "Refresh Now"}
          </button>
        </div>
      </div>

      {/* ── Error ───────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 px-4 py-3 rounded-[var(--radius-button)] text-sm bg-error/10 text-error border border-error/30">
          {error}
        </div>
      )}

      {/* ── Target Rate Card ────────────────────────────────── */}
      <div className="mb-6 p-5 rounded-[var(--radius-card)] border border-outline-variant/30 bg-surface-container-lowest/50">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <label className="text-sm font-medium text-on-surface">My Target Rate</label>
            <p className="text-xs text-on-surface-variant mt-0.5">
              Enter your current supply rate &mdash; offers at or below this are highlighted
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
                  className="w-24 px-3 py-1.5 text-sm text-right font-mono outline-none rounded-[var(--radius-button)] bg-bg border border-outline-variant/40 text-on-surface focus:border-primary transition-colors"
                  onKeyDown={(e) => { if (e.key === "Enter") handleSaveTarget(); }}
                  autoFocus
                />
                <span className="ml-1 text-sm text-on-surface-variant">&cent;/kWh</span>
              </div>
              <button
                onClick={handleSaveTarget}
                className="px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-button)] bg-primary text-on-primary hover:bg-primary-dim transition-all duration-200 active:scale-[0.98]"
              >
                Save
              </button>
              <button
                onClick={() => { setEditingTarget(false); setTargetInput(String(targetRate ?? "")); }}
                className="px-3 py-1.5 text-xs rounded-[var(--radius-button)] text-on-surface-variant hover:text-on-surface transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-lg font-semibold font-mono text-on-surface">
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
              <span className="font-mono font-semibold text-on-surface">
                ${(targetRate * 750 / 100).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-on-surface-variant">Offers beating your rate: </span>
              <span className={`font-mono font-semibold ${data.betterCount > 0 ? "text-success" : "text-on-surface-variant"}`}>
                {data.betterCount}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Table ──────────────────────────────────────────── */}
      {!hasData ? (
        <div className="p-8 text-center rounded-[var(--radius-card)] border border-outline-variant/20 bg-surface-container-lowest/30">
          <p className="text-base mb-2 text-on-surface-variant">No price data yet</p>
          <p className="text-sm text-on-surface-variant">
            Click <strong className="text-on-surface-variant">Refresh Now</strong> to scrape the latest rates from
            EnergizeCT.com (uses Playwright, takes ~20-40s).
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-on-surface-variant border-b border-outline-variant/30">
                <th className="py-3 px-4">Supplier</th>
                <th className="py-3 px-4 text-right">Rate (&cent;/kWh)</th>
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

                const isBetterRow = isBetter;
                const isEvenRow = i % 2 === 0;
                const rowClassName = isBetterRow
                  ? "bg-success/8"
                  : isEvenRow
                    ? "bg-surface-container-lowest/20"
                    : "";

                const savingsStr = offer.savings !== null
                  ? `${offer.savings > 0 ? "+" : ""}$${offer.savings.toFixed(2)}/mo`
                  : "—";

                const isStandard = offer.supplier === "Eversource - Standard Service";

                return (
                  <tr
                    key={offer.id}
                    className={`border-b border-outline-variant/15 transition-colors hover:bg-surface-container/40 ${rowClassName}`}
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        {isBetter && (
                          <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-success/20 text-success border border-success/30">
                            &#10003; Save
                          </span>
                        )}
                        <span className={isStandard ? "font-semibold text-on-surface-variant" : ""}>
                          {offer.supplier}
                        </span>
                      </div>
                    </td>
                    <td className={`py-3 px-4 text-right font-mono ${isBetter ? "text-success font-bold" : ""}`}>
                      {offer.rate.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-on-surface">
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
            Showing {offers.length} offers &bull; Sorted by rate (cheapest first)
            {data?.lastScrapedAt && (
              <span> &bull; Last scraped: {new Date(data.lastScrapedAt).toLocaleString()}</span>
            )}
          </div>
        </div>
      )}

      {/* ── Disclaimer ─────────────────────────────────────── */}
      <div className="mt-6 p-3 text-xs text-on-surface-variant leading-relaxed rounded-[var(--radius-button)] border border-outline-variant/15 bg-surface-container-lowest/20">
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
