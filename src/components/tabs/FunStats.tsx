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
  PieChart,
  Pie,
  Legend,
} from "recharts";
import type { AggregatedData } from "@/app/api/sleeper/data/route";
import { POSITION_COLORS } from "@/lib/constants";

interface Props {
  data: AggregatedData;
}

export default function FunStats({ data }: Props) {
  const { playerADPs, leagueStandings, totalPicks, totalLeagues } = data;

  // Longest player names
  const longestNames = [...playerADPs]
    .sort((a, b) => b.name.length - a.name.length)
    .slice(0, 10);

  // Most popular first names
  const firstNameMap: Record<string, number> = {};
  playerADPs.forEach((p) => {
    const firstName = p.name.split(" ")[0];
    firstNameMap[firstName] = (firstNameMap[firstName] || 0) + p.picks.length;
  });
  const topFirstNames = Object.entries(firstNameMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }));

  // Most popular last names
  const lastNameMap: Record<string, number> = {};
  playerADPs.forEach((p) => {
    const parts = p.name.split(" ");
    const lastName = parts[parts.length - 1];
    lastNameMap[lastName] = (lastNameMap[lastName] || 0) + p.picks.length;
  });
  const topLastNames = Object.entries(lastNameMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }));

  // Picks per league avg
  const picksPerLeague = Math.round(totalPicks / totalLeagues);

  // Position breakdown for pie
  const posCounts: Record<string, number> = {};
  playerADPs.forEach((p) => {
    posCounts[p.position] = (posCounts[p.position] || 0) + 1;
  });
  const pieData = Object.entries(posCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([pos, count]) => ({ name: pos, value: count, fill: POSITION_COLORS[pos] || "#6b7280" }));

  // Player appearing in most leagues
  const ubiquitous = playerADPs.filter((p) => p.picks.length >= totalLeagues * 0.8).slice(0, 10);

  // Biggest underdogs (drafted way lower than expected — appear in many leagues but low ADP)
  // Biggest reaches: drafted higher than their baseline
  // We define "reach" as a player drafted early (avgPick < 30) with high std dev
  const biggestReaches = [...playerADPs]
    .filter((p) => p.picks.length >= 5 && p.avgPick < 50)
    .sort((a, b) => b.stdDev / b.avgPick - a.stdDev / a.avgPick)
    .slice(0, 10);

  // Sleepers: players with high std dev but drafted late on average
  const sleepers = [...playerADPs]
    .filter((p) => p.picks.length >= 5 && p.avgPick >= 40)
    .sort((a, b) => b.stdDev - a.stdDev)
    .slice(0, 10);

  // Draft pick efficiency: leagues with most picks per roster slot
  const draftEfficiency = leagueStandings
    .map((l) => ({
      name: l.league_name.length > 20 ? l.league_name.slice(0, 20) + "…" : l.league_name,
      teams: l.teams,
    }))
    .sort((a, b) => b.teams - a.teams)
    .slice(0, 15);

  // Best value picks: lowest average pick for players who rarely go in top 10 but sometimes do
  const hiddenGems = [...playerADPs]
    .filter((p) => p.picks.length >= 3 && p.minPick <= 10 && p.avgPick > 25)
    .sort((a, b) => a.minPick - b.minPick)
    .slice(0, 10);

  return (
    <div className="space-y-8">
      {/* Stat row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Avg Picks / League</span>
          <p className="text-2xl font-bold text-white mt-1">{picksPerLeague}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Most Popular Name</span>
          <p className="text-xl font-bold text-white mt-1">{topFirstNames[0]?.name}</p>
          <p className="text-xs text-gray-500">{topFirstNames[0]?.count} picks total</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Longest Name Drafted</span>
          <p className="text-sm font-bold text-white mt-1">{longestNames[0]?.name}</p>
          <p className="text-xs text-gray-500">{longestNames[0]?.name.length} characters</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <span className="text-xs text-gray-400 uppercase tracking-wide">Omnipresent Players</span>
          <p className="text-2xl font-bold text-white mt-1">{ubiquitous.length}</p>
          <p className="text-xs text-gray-500">drafted in 80%+ of leagues</p>
        </div>
      </div>

      {/* Pie: unique players by position */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 text-white">Unique Players Drafted by Position</h2>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={{ stroke: "#4b5563" }}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                formatter={(v) => [v, "Unique Players"]}
              />
            </PieChart>
          </ResponsiveContainer>
        </section>

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 text-white">Most Common First Names</h2>
          <p className="text-xs text-gray-400 mb-3">By total picks (not unique players).</p>
          <div className="space-y-1.5">
            {topFirstNames.map((n, i) => (
              <div key={n.name} className="flex items-center gap-3">
                <span className="text-gray-600 text-xs w-5">{i + 1}</span>
                <span className="text-sm text-gray-300 w-24">{n.name}</span>
                <div className="flex-1 bg-gray-800 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${(n.count / topFirstNames[0].count) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-8 text-right">{n.count}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Hidden gems, reaches, sleepers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-base font-semibold mb-1 text-white">Hidden Gems</h2>
          <p className="text-xs text-gray-400 mb-4">Avg draft position 25+ but have been a top-10 pick somewhere.</p>
          <div className="space-y-2">
            {hiddenGems.map((p, i) => (
              <div key={p.player_id} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 text-xs">{i + 1}</span>
                  <span
                    className="text-xs px-1 rounded"
                    style={{ background: POSITION_COLORS[p.position] + "33", color: POSITION_COLORS[p.position] }}
                  >
                    {p.position}
                  </span>
                  <span className="text-xs text-gray-300">{p.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-green-400">Best: #{p.minPick}</p>
                  <p className="text-xs text-gray-500">Avg: {p.avgPick}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-base font-semibold mb-1 text-white">Biggest Reaches</h2>
          <p className="text-xs text-gray-400 mb-4">Players drafted early but with the most variance relative to their ADP.</p>
          <div className="space-y-2">
            {biggestReaches.map((p, i) => (
              <div key={p.player_id} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 text-xs">{i + 1}</span>
                  <span
                    className="text-xs px-1 rounded"
                    style={{ background: POSITION_COLORS[p.position] + "33", color: POSITION_COLORS[p.position] }}
                  >
                    {p.position}
                  </span>
                  <span className="text-xs text-gray-300">{p.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-amber-400">ADP {p.avgPick}</p>
                  <p className="text-xs text-gray-500">σ {p.stdDev}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h2 className="text-base font-semibold mb-1 text-white">Late-Round Sleepers</h2>
          <p className="text-xs text-gray-400 mb-4">High variance players drafted late — big disagreement on their value.</p>
          <div className="space-y-2">
            {sleepers.map((p, i) => (
              <div key={p.player_id} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-gray-600 text-xs">{i + 1}</span>
                  <span
                    className="text-xs px-1 rounded"
                    style={{ background: POSITION_COLORS[p.position] + "33", color: POSITION_COLORS[p.position] }}
                  >
                    {p.position}
                  </span>
                  <span className="text-xs text-gray-300">{p.name}</span>
                </div>
                <div className="text-right">
                  <p className="text-xs text-purple-400">ADP {p.avgPick}</p>
                  <p className="text-xs text-gray-500">σ {p.stdDev}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Ubiquitous players */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-2 text-white">Must-Have Players</h2>
        <p className="text-xs text-gray-400 mb-4">
          Players drafted in 80%+ of all {totalLeagues} leagues — everyone wants them.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          {ubiquitous.map((p) => (
            <div key={p.player_id} className="bg-gray-800 rounded-lg p-3 text-center">
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{ background: POSITION_COLORS[p.position] + "33", color: POSITION_COLORS[p.position] }}
              >
                {p.position}
              </span>
              <p className="text-sm font-semibold text-white mt-2">{p.name}</p>
              <p className="text-xs text-gray-400 mt-1">ADP {p.avgPick}</p>
              <p className="text-xs text-gray-500">{p.picks.length}/{totalLeagues} leagues</p>
            </div>
          ))}
        </div>
      </section>

      {/* Longest names */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4 text-white">Longest Player Names Drafted</h2>
        <div className="space-y-2">
          {longestNames.map((p, i) => (
            <div key={p.player_id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-gray-600 text-xs w-5">{i + 1}</span>
                <span
                  className="text-xs px-1 rounded"
                  style={{ background: POSITION_COLORS[p.position] + "33", color: POSITION_COLORS[p.position] }}
                >
                  {p.position}
                </span>
                <span className="text-sm text-gray-300">{p.name}</span>
              </div>
              <span className="text-xs text-gray-500">{p.name.length} chars</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
