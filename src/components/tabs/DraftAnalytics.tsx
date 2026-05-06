"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import type { AggregatedData } from "@/app/api/sleeper/data/route";
import { POSITION_COLORS } from "@/lib/constants";

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

const POSITION_ORDER = ["QB", "RB", "WR", "TE"];

export default function DraftAnalytics({ data }: Props) {
  const { playerADPs, positionByRound, topPicksByPosition } = data;

  // Top 40 players by ADP
  const top40 = playerADPs.slice(0, 40);

  // High variance players (most volatile picks) — must appear in >=5 leagues
  const highVariance = [...playerADPs]
    .filter((p) => p.picks.length >= 5)
    .sort((a, b) => b.stdDev - a.stdDev)
    .slice(0, 15);

  // Low variance (most consensus) — must appear in >=10 leagues
  const consensus = [...playerADPs]
    .filter((p) => p.picks.length >= 10)
    .sort((a, b) => a.stdDev - b.stdDev)
    .slice(0, 15);

  // For scatter: pick variance (min vs max pick)
  const varianceScatter = playerADPs
    .filter((p) => p.picks.length >= 5)
    .slice(0, 60)
    .map((p) => ({ name: p.name, avgPick: p.avgPick, stdDev: p.stdDev, position: p.position }));

  // Total picks by position
  const posTotals: Record<string, number> = {};
  playerADPs.forEach((p) => {
    posTotals[p.position] = (posTotals[p.position] || 0) + p.picks.length;
  });
  const posBreakdown = Object.entries(posTotals)
    .sort((a, b) => b[1] - a[1])
    .map(([pos, count]) => ({ pos, count }));

  return (
    <div className="space-y-8">
      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Draft Picks" value={data.totalPicks.toLocaleString()} sub="across all leagues" />
        <StatCard label="Unique Players Drafted" value={playerADPs.length.toLocaleString()} />
        <StatCard
          label="Most Picked Player"
          value={playerADPs[0]?.name || "—"}
          sub={`ADP ${playerADPs[0]?.avgPick} · ${playerADPs[0]?.picks.length} leagues`}
        />
        <StatCard
          label="Most Consensus Pick"
          value={consensus[0]?.name || "—"}
          sub={`σ = ${consensus[0]?.stdDev} picks`}
        />
      </div>

      {/* ADP Top 40 */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-1 text-white">
          Average Draft Position — Top 40 Players
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Average pick number across all leagues where the player was drafted (min 2 leagues).
        </p>
        {/* Column headers */}
        <div className="grid grid-cols-[2rem_3rem_1fr_auto_auto_auto] gap-x-3 text-xs text-gray-500 uppercase tracking-wide pb-2 border-b border-gray-800 mb-1 pr-1">
          <span>#</span>
          <span>Pos</span>
          <span>Player</span>
          <span className="text-right">ADP</span>
          <span className="text-right hidden sm:block">Range</span>
          <span className="text-right hidden md:block">Leagues</span>
        </div>
        <div className="divide-y divide-gray-800">
          {top40.map((p, i) => (
            <div
              key={p.player_id}
              className="grid grid-cols-[2rem_3rem_1fr_auto_auto_auto] gap-x-3 items-center py-2 pr-1 hover:bg-gray-800/50 rounded transition-colors"
            >
              <span className="text-xs text-gray-500 tabular-nums">{i + 1}</span>
              <span
                className="text-xs font-bold px-1.5 py-0.5 rounded text-center"
                style={{
                  background: (POSITION_COLORS[p.position] || "#6b7280") + "33",
                  color: POSITION_COLORS[p.position] || "#9ca3af",
                }}
              >
                {p.position}
              </span>
              <div className="min-w-0">
                <span className="text-sm text-gray-100 font-medium truncate block">{p.name}</span>
                <span className="text-xs text-gray-500">{p.team}</span>
              </div>
              <span
                className="text-sm font-bold tabular-nums text-right"
                style={{ color: POSITION_COLORS[p.position] || "#9ca3af" }}
              >
                {p.avgPick}
              </span>
              <span className="text-xs text-gray-500 tabular-nums text-right hidden sm:block">
                {p.minPick}–{p.maxPick}
              </span>
              <span className="text-xs text-gray-500 tabular-nums text-right hidden md:block">
                {p.picks.length}
              </span>
            </div>
          ))}
        </div>
        {/* Position legend */}
        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-gray-800">
          {Object.entries(POSITION_COLORS).map(([pos, color]) => (
            <div key={pos} className="flex items-center gap-1.5 text-xs text-gray-400">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ background: color }} />
              {pos}
            </div>
          ))}
        </div>
      </section>

      {/* Position by round stacked bar */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-2 text-white">Positions Drafted by Round</h2>
        <p className="text-xs text-gray-400 mb-4">
          How many of each position were taken in each round, aggregated across all leagues.
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={positionByRound} margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
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
              labelStyle={{ color: "#d1d5db" }}
              itemStyle={{ color: "#d1d5db" }}
              labelFormatter={(v) => `Round ${v}`}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
            <Bar dataKey="QB" stackId="a" fill={POSITION_COLORS.QB} />
            <Bar dataKey="RB" stackId="a" fill={POSITION_COLORS.RB} />
            <Bar dataKey="WR" stackId="a" fill={POSITION_COLORS.WR} />
            <Bar dataKey="TE" stackId="a" fill={POSITION_COLORS.TE} />
            <Bar dataKey="K" stackId="a" fill={POSITION_COLORS.K} />
            <Bar dataKey="DEF" stackId="a" fill={POSITION_COLORS.DEF} />
            <Bar dataKey="Other" stackId="a" fill="#374151" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* Two columns: variance and consensus */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Most volatile players */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-1 text-white">Most Polarizing Players</h2>
          <p className="text-xs text-gray-400 mb-4">Highest standard deviation in draft position — biggest disagreements between leagues.</p>
          <div className="space-y-2">
            {highVariance.map((p, i) => (
              <div key={p.player_id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-xs w-5">{i + 1}</span>
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{ background: POSITION_COLORS[p.position] + "33", color: POSITION_COLORS[p.position] }}
                  >
                    {p.position}
                  </span>
                  <span className="text-sm text-gray-200">{p.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-amber-400">σ {p.stdDev}</p>
                  <p className="text-xs text-gray-500">Rng {p.minPick}–{p.maxPick}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Most consensus */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-1 text-white">Most Consensus Picks</h2>
          <p className="text-xs text-gray-400 mb-4">Lowest standard deviation — all leagues agreed on these players' value.</p>
          <div className="space-y-2">
            {consensus.map((p, i) => (
              <div key={p.player_id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-xs w-5">{i + 1}</span>
                  <span
                    className="text-xs font-bold px-1.5 py-0.5 rounded"
                    style={{ background: POSITION_COLORS[p.position] + "33", color: POSITION_COLORS[p.position] }}
                  >
                    {p.position}
                  </span>
                  <span className="text-sm text-gray-200">{p.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-green-400">σ {p.stdDev}</p>
                  <p className="text-xs text-gray-500">ADP {p.avgPick}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Top players by position */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 text-white">Top Drafted Players by Position</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {POSITION_ORDER.map((pos) => {
            const players = topPicksByPosition[pos] || [];
            return (
              <div key={pos}>
                <h3
                  className="text-sm font-bold mb-3 pb-2 border-b"
                  style={{ color: POSITION_COLORS[pos], borderColor: POSITION_COLORS[pos] + "44" }}
                >
                  {pos}
                </h3>
                <div className="space-y-1.5">
                  {players.map((p, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600 text-xs w-4">{i + 1}</span>
                        <span className="text-xs text-gray-300">{p.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-gray-400">ADP {p.avgPick}</span>
                        <span className="text-xs text-gray-600 ml-2">({p.pickCount})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Overall position breakdown */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 text-white">Total Picks by Position</h2>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={posBreakdown} margin={{ left: 0, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="pos" tick={{ fill: "#9ca3af", fontSize: 12 }} tickLine={false} />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} />
            <Tooltip
              cursor={{ fill: "#1f2937" }}
              contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
              labelStyle={{ color: "#d1d5db" }}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Total Picks">
              {posBreakdown.map((entry) => (
                <Cell key={entry.pos} fill={POSITION_COLORS[entry.pos] || "#6b7280"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}
