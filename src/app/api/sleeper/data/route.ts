import { NextResponse } from "next/server";

export const maxDuration = 60;
export const revalidate = 3600;
import { LEAGUE_IDS } from "@/lib/constants";
import {
  fetchLeague,
  fetchLeagueDrafts,
  fetchDraftPicks,
  fetchDraftTradedPicks,
  fetchLeagueRosters,
  fetchLeagueUsers,
  fetchLeagueTradedPicks,
  type DraftPick,
  type TradedPick,
  type SleeperLeague,
  type SleeperRoster,
  type SleeperUser,
  type SleeperDraft,
} from "@/lib/sleeper";

export interface PlayerADP {
  player_id: string;
  name: string;
  position: string;
  team: string;
  picks: number[];
  avgPick: number;
  minPick: number;
  maxPick: number;
  stdDev: number;
  timesTop5: number;
  timesTop10: number;
}

export interface PickTradeData {
  label: string;
  round: number;
  slot: number;
  tradeCount: number;
}

export interface PositionRoundData {
  round: number;
  QB: number;
  RB: number;
  WR: number;
  TE: number;
  K: number;
  DEF: number;
  Other: number;
}

export interface LeagueStanding {
  league_id: string;
  league_name: string;
  season: string;
  teams: number;
  rosters: {
    roster_id: number;
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_against: number;
    rank: number;
    owner_name: string;
    team_name: string;
  }[];
}

export interface AggregatedData {
  playerADPs: PlayerADP[];
  pickTradeHeatmap: PickTradeData[];
  tradesByRound: { round: number; count: number; pct: number }[];
  positionByRound: PositionRoundData[];
  leagueStandings: LeagueStanding[];
  totalLeagues: number;
  totalPicks: number;
  totalTrades: number;
  mostTradedPick: string;
  topPicksByPosition: Record<string, { name: string; avgPick: number; pickCount: number }[]>;
  draftCompletionRates: { leagueId: string; name: string; status: string }[];
  roundTradeVolume: { round: number; count: number }[];
  leagueTradedPicksAll: TradedPick[];
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// Sleeper can return null for empty endpoints; coerce to array and swallow failures.
function safeArr<T>(promise: Promise<T[] | null>): Promise<T[]> {
  return promise.then((v) => (Array.isArray(v) ? v : [])).catch(() => []);
}

export async function GET() {
  try {
    // Phase 1: leagues + drafts fire together; individual failures fall back to null/[]
    const [leagueResults, leagueDraftsArrays] = await Promise.all([
      Promise.all(LEAGUE_IDS.map((id) => fetchLeague(id).catch(() => null))),
      Promise.all(LEAGUE_IDS.map((id) => safeArr(fetchLeagueDrafts(id)))),
    ]);

    // Pair each league with its index so we can skip nulls while keeping alignment
    const validLeagues = leagueResults
      .map((league, i) => ({ league, i }))
      .filter((x): x is { league: SleeperLeague; i: number } => x.league !== null);

    // Collect 2026 rookie draft IDs only. Filter by rounds: rookie drafts are 4–5
    // (max 7 for SF formats); startup drafts are 15+. Season alone is insufficient
    // because a league whose startup ran in 2026 would otherwise contaminate the data.
    const isRookieDraft = (d: SleeperDraft) =>
      d.season === '2026' && d.settings?.rounds <= 7;

    const allDraftIds: string[] = [];
    const draftToLeague: Record<string, string> = {};
    leagueDraftsArrays.forEach((drafts, i) => {
      drafts.forEach((d) => {
        if (!isRookieDraft(d)) return;
        allDraftIds.push(d.draft_id);
        draftToLeague[d.draft_id] = LEAGUE_IDS[i];
      });
    });

    // Phase 2: all remaining data fires simultaneously; each fetch is independently resilient
    const [allPickArrays, allTradedPickArrays, leagueTradedPicksArrays, rostersArrays, usersArrays] =
      await Promise.all([
        Promise.all(allDraftIds.map((id) => safeArr(fetchDraftPicks(id)))),
        Promise.all(allDraftIds.map((id) => safeArr(fetchDraftTradedPicks(id)))),
        Promise.all(LEAGUE_IDS.map((id) => safeArr(fetchLeagueTradedPicks(id)))),
        Promise.all(LEAGUE_IDS.map((id) => safeArr(fetchLeagueRosters(id)))),
        Promise.all(LEAGUE_IDS.map((id) => safeArr(fetchLeagueUsers(id)))),
      ]);

    // Flatten all picks
    const allPicks: DraftPick[] = allPickArrays.flat().filter(Boolean);

    // Flatten draft-level traded picks. Sleeper's draft endpoint doesn't always
    // include draft_id on each row, so stamp the source draft_id ourselves —
    // we need it later to resolve roster_id → draft slot per draft.
    const allDraftTradedPicks: TradedPick[] = allTradedPickArrays.flatMap((picks, i) =>
      picks.filter(Boolean).map((p) => ({ ...p, draft_id: p.draft_id ?? allDraftIds[i] }))
    );

    // Flatten all league-level traded picks
    const leagueTradedPicksAll: TradedPick[] = leagueTradedPicksArrays.flat().filter(Boolean);

    // Build roster_id → draft slot map per draft. In Sleeper, TradedPick.roster_id
    // is the original owner's permanent team id, NOT their draft slot. For dynasty
    // rookie drafts the slot comes from previous-season standings (see
    // SleeperDraft.slot_to_roster_id), so we must invert that map per draft.
    const rosterToSlotByDraft: Record<string, Record<number, number>> = {};
    leagueDraftsArrays.forEach((drafts) => {
      drafts.forEach((d) => {
        if (!isRookieDraft(d) || !d.slot_to_roster_id) return;
        const map: Record<number, number> = {};
        Object.entries(d.slot_to_roster_id).forEach(([slot, rosterId]) => {
          if (rosterId != null) map[rosterId] = parseInt(slot);
        });
        rosterToSlotByDraft[d.draft_id] = map;
      });
    });

    // ─── 1. Player ADP ───────────────────────────────────────────────────
    const playerPickMap: Record<string, { name: string; position: string; team: string; picks: number[] }> = {};

    allPicks.forEach((pick) => {
      if (!pick?.player_id || !pick?.metadata) return;
      const { player_id, pick_no, metadata } = pick;
      const name = `${metadata.first_name} ${metadata.last_name}`.trim();
      if (!name || name.trim() === "") return;
      if (!playerPickMap[player_id]) {
        playerPickMap[player_id] = {
          name,
          position: metadata.position || "UNK",
          team: metadata.team || "",
          picks: [],
        };
      }
      playerPickMap[player_id].picks.push(pick_no);
    });

    const playerADPs: PlayerADP[] = Object.entries(playerPickMap)
      .filter(([, d]) => d.picks.length >= 2)
      .map(([player_id, d]) => {
        const sorted = [...d.picks].sort((a, b) => a - b);
        const avg = d.picks.reduce((a, b) => a + b, 0) / d.picks.length;
        return {
          player_id,
          name: d.name,
          position: d.position,
          team: d.team,
          picks: d.picks,
          avgPick: Math.round(avg * 10) / 10,
          minPick: sorted[0],
          maxPick: sorted[sorted.length - 1],
          stdDev: Math.round(stdDev(d.picks) * 10) / 10,
          timesTop5: d.picks.filter((p) => p <= 5).length,
          timesTop10: d.picks.filter((p) => p <= 10).length,
        };
      })
      .sort((a, b) => a.avgPick - b.avgPick);

    // ─── 2. Pick Trade Heatmap ────────────────────────────────────────────
    // Count trades by round and DRAFT SLOT across all draft-level traded picks.
    // Aggregating by roster_id collapses unrelated picks across leagues because
    // the same roster_id sits in different draft slots in each league.
    const tradeMap: Record<string, number> = {};
    allDraftTradedPicks.forEach((tp) => {
      if (!tp?.round || !tp.draft_id) return;
      const slot = rosterToSlotByDraft[tp.draft_id]?.[tp.roster_id];
      if (!slot) return;
      const key = `${tp.round}.${slot}`;
      tradeMap[key] = (tradeMap[key] || 0) + 1;
    });

    const pickTradeHeatmap: PickTradeData[] = Object.entries(tradeMap).map(([key, count]) => {
      const [r, s] = key.split(".");
      const round = parseInt(r);
      const slot = parseInt(s);
      return {
        label: `${round}.${String(slot).padStart(2, "0")}`,
        round,
        slot,
        tradeCount: count,
      };
    }).sort((a, b) => a.round - b.round || a.slot - b.slot);

    // ─── 3. Trades by round ───────────────────────────────────────────────
    // Numerator: distinct picks traded in that round (a pick traded twice = 1).
    // Denominator: total picks that exist in that round across all rookie drafts
    // (teams × 1 per round), independent of draft completion status.
    const distinctTradedPicksByRound: Record<number, Set<string>> = {};
    allDraftTradedPicks.forEach((tp) => {
      if (!tp?.round || !tp.draft_id) return;
      if (!distinctTradedPicksByRound[tp.round]) distinctTradedPicksByRound[tp.round] = new Set();
      distinctTradedPicksByRound[tp.round].add(`${tp.draft_id}-${tp.roster_id}`);
    });
    const totalPicksByRound: Record<number, number> = {};
    leagueDraftsArrays.forEach((drafts) => {
      drafts.forEach((d) => {
        if (!isRookieDraft(d)) return;
        const teams = d.settings?.teams ?? 12;
        const rounds = d.settings?.rounds ?? 0;
        for (let r = 1; r <= rounds; r++) {
          totalPicksByRound[r] = (totalPicksByRound[r] || 0) + teams;
        }
      });
    });
    const tradesByRound = Object.entries(distinctTradedPicksByRound)
      .map(([r, set]) => {
        const round = parseInt(r);
        const count = set.size;
        const total = totalPicksByRound[round] || 1;
        return { round, count, pct: Math.round((count / total) * 100) };
      })
      .sort((a, b) => a.round - b.round);

    // ─── 4. Position by round ─────────────────────────────────────────────
    const positionRoundMap: Record<number, Record<string, number>> = {};
    allPicks.forEach((pick) => {
      if (!pick?.round || !pick?.metadata?.position) return;
      const pos = pick.metadata.position;
      if (!positionRoundMap[pick.round]) positionRoundMap[pick.round] = {};
      const normalized = ["QB", "RB", "WR", "TE", "K", "DEF"].includes(pos) ? pos : "Other";
      positionRoundMap[pick.round][normalized] = (positionRoundMap[pick.round][normalized] || 0) + 1;
    });
    const positionByRound: PositionRoundData[] = Object.entries(positionRoundMap)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([r, positions]) => ({
        round: parseInt(r),
        QB: positions.QB || 0,
        RB: positions.RB || 0,
        WR: positions.WR || 0,
        TE: positions.TE || 0,
        K: positions.K || 0,
        DEF: positions.DEF || 0,
        Other: positions.Other || 0,
      }));

    // ─── 5. League Standings ──────────────────────────────────────────────
    const leagueStandings: LeagueStanding[] = validLeagues.map(({ league, i }) => {
      const rosters = rostersArrays[i] || [];
      const users = usersArrays[i] || [];
      const userMap: Record<string, SleeperUser> = {};
      users.forEach((u) => { userMap[u.user_id] = u; });

      const rosterData = rosters.map((r) => {
        const owner = userMap[r.owner_id];
        return {
          roster_id: r.roster_id,
          wins: r.settings?.wins || 0,
          losses: r.settings?.losses || 0,
          ties: r.settings?.ties || 0,
          fpts: (r.settings?.fpts || 0) + (r.settings?.fpts_decimal || 0) / 100,
          fpts_against: (r.settings?.fpts_against || 0) + (r.settings?.fpts_against_decimal || 0) / 100,
          rank: r.settings?.rank || 0,
          owner_name: owner?.display_name || "Unknown",
          team_name: owner?.metadata?.team_name || owner?.display_name || "Team " + r.roster_id,
        };
      }).sort((a, b) => b.wins - a.wins || b.fpts - a.fpts);

      return {
        league_id: league.league_id,
        league_name: league.name,
        season: league.season,
        teams: league.total_rosters,
        rosters: rosterData,
      };
    });

    // ─── 6. Top picks by position ─────────────────────────────────────────
    const topPicksByPosition: Record<string, { name: string; avgPick: number; pickCount: number }[]> = {};
    ["QB", "RB", "WR", "TE"].forEach((pos) => {
      topPicksByPosition[pos] = playerADPs
        .filter((p) => p.position === pos)
        .slice(0, 15)
        .map((p) => ({ name: p.name, avgPick: p.avgPick, pickCount: p.picks.length }));
    });

    // ─── 7. Round trade volume (league-level, includes future picks) ──────
    const roundTradeVolumeMap: Record<number, number> = {};
    leagueTradedPicksAll.forEach((tp) => {
      if (!tp?.round) return;
      roundTradeVolumeMap[tp.round] = (roundTradeVolumeMap[tp.round] || 0) + 1;
    });
    const roundTradeVolume = Object.entries(roundTradeVolumeMap)
      .map(([r, count]) => ({ round: parseInt(r), count }))
      .sort((a, b) => a.round - b.round);

    // ─── 8. Most traded pick ──────────────────────────────────────────────
    const mostTraded = pickTradeHeatmap.reduce<PickTradeData | null>(
      (best, p) => (!best || p.tradeCount > best.tradeCount ? p : best),
      null,
    );
    const mostTradedPick = mostTraded ? mostTraded.label : "N/A";

    // ─── 9. Draft completion rates ────────────────────────────────────────
    const draftCompletionRates = leagueDraftsArrays.map((drafts, i) => {
      const rookieDraft = drafts.find(isRookieDraft);
      return {
        leagueId: LEAGUE_IDS[i],
        name: leagueResults[i]?.name || LEAGUE_IDS[i],
        status: rookieDraft?.status || "unknown",
      };
    });

    const result: AggregatedData = {
      playerADPs,
      pickTradeHeatmap,
      tradesByRound,
      positionByRound,
      leagueStandings,
      totalLeagues: validLeagues.length,
      totalPicks: allPicks.length,
      totalTrades: allDraftTradedPicks.length,
      mostTradedPick,
      topPicksByPosition,
      draftCompletionRates,
      roundTradeVolume,
      leagueTradedPicksAll,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("Error fetching Sleeper data:", err);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
