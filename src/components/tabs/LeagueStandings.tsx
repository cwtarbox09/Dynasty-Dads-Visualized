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
  ScatterChart,
  Scatter,
  ReferenceLine,
} from "recharts";
import type { AggregatedData } from "@/app/api/sleeper/data/route";
import { useState } from "react";

interface Props {
  data: AggregatedData;
}

export default function LeagueStandings({ data }: Props) {
  const { leagueStandings } = data;
  const [selected, setSelected] = useState<string>(leagueStandings[0]?.league_id || "");

  const league = leagueStandings.find((l) => l.league_id === selected) || leagueStandings[0];

  // Cross-league win rate distribution
  const allRosters = leagueStandings.flatMap((l) =>
    l.rosters.map((r) => {
      const total = r.wins + r.losses + r.ties;
      return {
        ...r,
        total,
        winPct: total > 0 ? Math.round((r.wins / total) * 1000) / 10 : 0,
        leagueName: l.league_name,
        fpts: Math.round(r.fpts),
      };
    })
  );

  // Points distribution
  const fptsData = [...allRosters]
    .filter((r) => r.fpts > 0)
    .sort((a, b) => b.fpts - a.fpts)
    .slice(0, 30);

  // Win% distribution buckets
  const buckets: Record<string, number> = {
    "0–20%": 0, "21–40%": 0, "41–60%": 0, "61–80%": 0, "81–100%": 0,
  };
  allRosters.filter((r) => r.total > 0).forEach((r) => {
    if (r.winPct <= 20) buckets["0–20%"]++;
    else if (r.winPct <= 40) buckets["21–40%"]++;
    else if (r.winPct <= 60) buckets["41–60%"]++;
    else if (r.winPct <= 80) buckets["61–80%"]++;
    else buckets["81–100%"]++;
  });
  const winPctDist = Object.entries(buckets).map(([range, count]) => ({ range, count }));

  // Avg wins by standing rank
  const rankMap: Record<number, number[]> = {};
  leagueStandings.forEach((l) => {
    l.rosters.forEach((r) => {
      const total = r.wins + r.losses + r.ties;
      if (total === 0) return;
      const pct = r.wins / total;
      if (!rankMap[r.rank]) rankMap[r.rank] = [];
      rankMap[r.rank].push(pct);
    });
  });

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Total Leagues</span>
          <p className="text-2xl font-bold text-white mt-1">{leagueStandings.length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Total Teams</span>
          <p className="text-2xl font-bold text-white mt-1">{allRosters.length}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Highest Scorer</span>
          <p className="text-lg font-bold text-white mt-1 truncate">{fptsData[0]?.owner_name || "—"}</p>
          <p className="text-xs text-gray-500">{fptsData[0]?.fpts?.toLocaleString()} pts · {fptsData[0]?.leagueName}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Avg Win Rate</span>
          <p className="text-2xl font-bold text-white mt-1">
            {Math.round(allRosters.filter((r) => r.total > 0).reduce((a, b) => a + b.winPct, 0) / allRosters.filter((r) => r.total > 0).length)}%
          </p>
        </div>
      </div>

      {/* League selector + standings table */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <h2 className="text-lg font-semibold text-white">League Standings</h2>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
          >
            {leagueStandings.map((l) => (
              <option key={l.league_id} value={l.league_id}>
                {l.league_name}
              </option>
            ))}
          </select>
        </div>

        {league && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2 pr-4 w-8">Rank</th>
                  <th className="text-left py-2 pr-4">Team</th>
                  <th className="text-left py-2 pr-4">Owner</th>
                  <th className="text-right py-2 pr-4">W</th>
                  <th className="text-right py-2 pr-4">L</th>
                  <th className="text-right py-2 pr-4">T</th>
                  <th className="text-right py-2 pr-4">Win%</th>
                  <th className="text-right py-2 pr-4">PF</th>
                  <th className="text-right py-2">PA</th>
                </tr>
              </thead>
              <tbody>
                {league.rosters.map((r, i) => {
                  const total = r.wins + r.losses + r.ties;
                  const winPct = total > 0 ? Math.round((r.wins / total) * 1000) / 10 : 0;
                  return (
                    <tr key={r.roster_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                      <td className="py-2 pr-4">
                        <span className={`text-xs font-bold ${i === 0 ? "text-yellow-400" : i < 3 ? "text-blue-400" : "text-gray-500"}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-200 font-medium">{r.team_name}</td>
                      <td className="py-2 pr-4 text-gray-400">{r.owner_name}</td>
                      <td className="py-2 pr-4 text-right text-green-400 font-semibold">{r.wins}</td>
                      <td className="py-2 pr-4 text-right text-red-400 font-semibold">{r.losses}</td>
                      <td className="py-2 pr-4 text-right text-gray-500">{r.ties}</td>
                      <td className="py-2 pr-4 text-right text-gray-300">{winPct}%</td>
                      <td className="py-2 pr-4 text-right text-blue-300">{r.fpts.toLocaleString()}</td>
                      <td className="py-2 text-right text-gray-500">{r.fpts_against.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Win pct distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-2 text-white">Win Rate Distribution</h2>
          <p className="text-xs text-gray-400 mb-4">How many teams across all leagues fall into each win percentage bucket.</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={winPctDist} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="range" tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} tickLine={false} />
              <Tooltip
                cursor={{ fill: "#1f2937" }}
                contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                formatter={(v) => [v, "Teams"]}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {winPctDist.map((_, i) => (
                  <Cell key={i} fill={["#ef4444", "#f97316", "#22c55e", "#3b82f6", "#a855f7"][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-2 text-white">Top Scorers Across All Leagues</h2>
          <p className="text-xs text-gray-400 mb-4">Highest scoring teams across every league.</p>
          <div className="space-y-2 overflow-y-auto max-h-64">
            {fptsData.map((r, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-gray-600 text-xs w-5 shrink-0">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-200 truncate">{r.team_name}</p>
                    <p className="text-xs text-gray-500 truncate">{r.leagueName}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-sm font-semibold text-blue-400">{r.fpts.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">{r.wins}–{r.losses}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
