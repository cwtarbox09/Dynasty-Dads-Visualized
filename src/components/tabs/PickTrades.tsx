"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from "recharts";
import type { AggregatedData, PickTradeData } from "@/app/api/sleeper/data/route";

interface Props {
  data: AggregatedData;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-xs text-gray-400 uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-bold text-white">{value}</span>
      {sub && <span className="text-xs text-gray-500">{sub}</span>}
    </div>
  );
}

// Build a normalized heatmap grid: rounds 1-5, slots 1-12
function buildHeatmapGrid(heatmap: PickTradeData[]) {
  const grid: Record<string, Record<number, number>> = {};
  let maxCount = 0;

  heatmap.forEach(({ round, slot, tradeCount }) => {
    const r = String(round);
    if (!grid[r]) grid[r] = {};
    grid[r][slot] = tradeCount;
    if (tradeCount > maxCount) maxCount = tradeCount;
  });

  return { grid, maxCount };
}

function getHeatColor(count: number, max: number): string {
  if (count === 0 || max === 0) return "#111827";
  const ratio = count / max;
  if (ratio < 0.2) return "#1e3a5f";
  if (ratio < 0.4) return "#1e40af";
  if (ratio < 0.6) return "#2563eb";
  if (ratio < 0.8) return "#f59e0b";
  return "#ef4444";
}

export default function PickTrades({ data }: Props) {
  const { pickTradeHeatmap, tradesByRound, roundTradeVolume, leagueTradedPicksAll, totalTrades, mostTradedPick } = data;

  // Top 20 most traded specific picks
  const top20Traded = [...pickTradeHeatmap]
    .sort((a, b) => b.tradeCount - a.tradeCount)
    .slice(0, 20);

  // Build heatmap grid
  const maxSlot = Math.max(...pickTradeHeatmap.map((p) => p.slot), 12);
  const maxRound = Math.max(...pickTradeHeatmap.map((p) => p.round), 5);
  const slots = Array.from({ length: Math.min(maxSlot, 14) }, (_, i) => i + 1);
  const rounds = Array.from({ length: Math.min(maxRound, 7) }, (_, i) => i + 1);

  const heatLookup: Record<string, number> = {};
  pickTradeHeatmap.forEach(({ round, slot, tradeCount }) => {
    heatLookup[`${round}-${slot}`] = tradeCount;
  });
  const heatMax = Math.max(...Object.values(heatLookup), 1);

  // League-level round trade volume
  const roundVolume = roundTradeVolume.filter((r) => r.round <= 7);

  // Trade count by season (from league traded picks)
  const seasonMap: Record<string, number> = {};
  leagueTradedPicksAll.forEach((tp) => {
    if (!tp?.season) return;
    seasonMap[tp.season] = (seasonMap[tp.season] || 0) + 1;
  });
  const bySeason = Object.entries(seasonMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([season, count]) => ({ season, count }));

  // Percent of picks traded per round (from tradesByRound)
  const pctByRound = tradesByRound.filter((r) => r.round <= 7);

  return (
    <div className="space-y-8">
      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Pick Trades" value={totalTrades.toLocaleString()} sub="draft-level transactions" />
        <StatCard label="Most Traded Pick" value={mostTradedPick} sub="round.slot combo" />
        <StatCard
          label="Total League-Level Trades"
          value={leagueTradedPicksAll.length.toLocaleString()}
          sub="incl. future pick trades"
        />
        <StatCard
          label="Most Traded Round"
          value={roundVolume.sort((a, b) => b.count - a.count)[0]?.round
            ? `Round ${roundVolume.sort((a, b) => b.count - a.count)[0].round}`
            : "—"}
          sub={`${roundVolume.sort((a, b) => b.count - a.count)[0]?.count || 0} trades`}
        />
      </div>

      {/* Heatmap */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-2 text-white">Pick Trade Heatmap</h2>
        <p className="text-xs text-gray-400 mb-5">
          How many times each specific pick (Round.Slot) was traded across all leagues during their drafts. Darker red = more trades.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr>
                <th className="text-left text-xs text-gray-500 w-16 pb-2">Round</th>
                {slots.map((s) => (
                  <th key={s} className="text-center text-xs text-gray-500 pb-2 px-1">
                    .{String(s).padStart(2, "0")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rounds.map((r) => (
                <tr key={r}>
                  <td className="text-xs text-gray-400 font-semibold pr-3 py-1">Rd {r}</td>
                  {slots.map((s) => {
                    const count = heatLookup[`${r}-${s}`] || 0;
                    const color = getHeatColor(count, heatMax);
                    return (
                      <td key={s} className="px-0.5 py-0.5">
                        <div
                          title={`${r}.${String(s).padStart(2, "0")}: ${count} trade${count !== 1 ? "s" : ""}`}
                          className="w-8 h-8 rounded flex items-center justify-center text-xs cursor-default transition-transform hover:scale-110"
                          style={{ background: color, color: count > 0 ? "#fff" : "#374151" }}
                        >
                          {count || ""}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Color legend */}
        <div className="flex items-center gap-2 mt-4">
          <span className="text-xs text-gray-500">Less traded</span>
          {["#1e3a5f", "#1e40af", "#2563eb", "#f59e0b", "#ef4444"].map((c) => (
            <div key={c} className="w-5 h-4 rounded" style={{ background: c }} />
          ))}
          <span className="text-xs text-gray-500">Most traded</span>
        </div>
      </section>

      {/* Top 20 traded picks bar chart */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-2 text-white">Top 20 Most Traded Picks</h2>
        <p className="text-xs text-gray-400 mb-4">Specific round.slot combinations traded most often during drafts.</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={top20Traded} margin={{ left: 0, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: "#1f2937" }}
              contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
              labelStyle={{ color: "#d1d5db" }}
              formatter={(v) => [v, "Times Traded"]}
            />
            <Bar dataKey="tradeCount" name="Times Traded" radius={[4, 4, 0, 0]}>
              {top20Traded.map((entry, i) => {
                const roundColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#6b7280"];
                return <Cell key={i} fill={roundColors[(entry.round - 1) % roundColors.length]} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* Two-column: by round and pct by round */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-2 text-white">Total Picks Traded by Round</h2>
          <p className="text-xs text-gray-400 mb-4">
            League-level traded picks (including future picks) aggregated by round.
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={roundVolume} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis
                dataKey="round"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                tickFormatter={(v) => `Rd ${v}`}
                tickLine={false}
              />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} />
              <Tooltip
                cursor={{ fill: "#1f2937" }}
                contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                formatter={(v) => [v, "Traded Picks"]}
                labelFormatter={(v) => `Round ${v}`}
              />
              <Bar dataKey="count" name="Traded Picks" radius={[4, 4, 0, 0]} fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-2 text-white">% of Picks Traded Per Round</h2>
          <p className="text-xs text-gray-400 mb-4">
            Percentage of picks in each round that changed hands during the draft.
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={pctByRound} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis
                dataKey="round"
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                tickFormatter={(v) => `Rd ${v}`}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#9ca3af", fontSize: 11 }}
                tickLine={false}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
              />
              <Tooltip
                cursor={{ fill: "#1f2937" }}
                contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                formatter={(v) => [`${v}%`, "% Traded"]}
                labelFormatter={(v) => `Round ${v}`}
              />
              <Bar dataKey="pct" name="% Traded" radius={[4, 4, 0, 0]} fill="#a855f7" />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      {/* Picks traded by season (future picks) */}
      {bySeason.length > 1 && (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-2 text-white">Future Pick Trades by Season</h2>
          <p className="text-xs text-gray-400 mb-4">
            How many draft picks from each future season were traded across all leagues.
          </p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={bySeason} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="season" tick={{ fill: "#9ca3af", fontSize: 12 }} tickLine={false} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} />
              <Tooltip
                cursor={{ fill: "#1f2937" }}
                contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                formatter={(v) => [v, "Traded Picks"]}
              />
              <Bar dataKey="count" name="Traded Picks" radius={[4, 4, 0, 0]} fill="#22c55e" />
            </BarChart>
          </ResponsiveContainer>
        </section>
      )}

    </div>
  );
}
