import { NextResponse } from "next/server";

export const maxDuration = 60;
export const revalidate = 3600;
import { LEAGUE_IDS } from "@/lib/constants";
import {
  fetchLeague,
  fetchLeagueDrafts,
  fetchDraftPicks,
  fetchDraftTradedPicks,
  fetchLeagueTradedPicks,
  type DraftPick,
  type TradedPick,
  type SleeperLeague,
  type SleeperDraft,
} from "@/lib/sleeper";

// Cap parallel Sleeper requests so we don't saturate Node's HTTP agent (default
// 6 sockets/origin) or trip Sleeper's rate limiter. Firing ~200 fetches at once
// was causing cold-start gateway timeouts (504).
const SLEEPER_CONCURRENCY = 12;

async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= items.length) return;
        results[idx] = await fn(items[idx]);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

export interface PlayerADP {
  player_id: string;
  name: string;
  position: string;
  team: string;
  picks: number[];
  avgPick: number;
  avgRound: number;
  avgSlot: number;
  minPick: number;
  maxPick: number;
  minLabel: string;
  maxLabel: string;
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

export interface AggregatedData {
  playerADPs: PlayerADP[];
  pickTradeHeatmap: PickTradeData[];
  tradesByRound: { round: number; count: number; pct: number }[];
  positionByRound: PositionRoundData[];
  totalLeagues: number;
  totalPicks: number;
  totalTrades: number;
  mostTradedPick: string;
  topPicksByPosition: Record<string, { name: string; avgPick: number; avgRound: number; avgSlot: number; pickCount: number }[]>;
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
      pMap(LEAGUE_IDS, (id) => fetchLeague(id).catch(() => null), SLEEPER_CONCURRENCY),
      pMap(LEAGUE_IDS, (id) => safeArr(fetchLeagueDrafts(id)), SLEEPER_CONCURRENCY),
    ]);

    // Pair each league with its index so we can skip nulls while keeping alignment
    const validLeagues = leagueResults
      .map((league, i) => ({ league, i }))
      .filter((x): x is { league: SleeperLeague; i: number } => x.league !== null);

    // Collect 2026 rookie draft IDs only. Filter by rounds: rookie drafts are 4–5
    // (max 7 for SF formats); startup drafts are 15+. Season alone is insufficient
    // because a league whose startup ran in 2026 would otherwise contaminate the data.
    // Only include drafts that started on/after April 20, 2026 (or not yet started).
    const APRIL_20_2026_MS = 1776643200000;
    const isRookieDraft = (d: SleeperDraft) =>
      d.season === '2026' &&
      d.settings?.rounds != null &&
      d.settings.rounds <= 7 &&
      (!d.start_time || d.start_time >= APRIL_20_2026_MS);

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
    const [allPickArrays, allTradedPickArrays, leagueTradedPicksArrays] =
      await Promise.all([
        pMap(allDraftIds, (id) => safeArr(fetchDraftPicks(id)), SLEEPER_CONCURRENCY),
        pMap(allDraftIds, (id) => safeArr(fetchDraftTradedPicks(id)), SLEEPER_CONCURRENCY),
        pMap(LEAGUE_IDS, (id) => safeArr(fetchLeagueTradedPicks(id)), SLEEPER_CONCURRENCY),
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

    // Fallback: when slot_to_roster_id is absent, derive roster→slot from actual
    // picks (each DraftPick carries draft_slot directly).
    allPickArrays.forEach((picks, i) => {
      const draftId = allDraftIds[i];
      if (rosterToSlotByDraft[draftId]) return;
      const map: Record<number, number> = {};
      picks.forEach((p) => {
        const rosterId = parseInt(p.roster_id);
        if (rosterId && p.draft_slot) map[rosterId] = p.draft_slot;
      });
      if (Object.keys(map).length > 0) rosterToSlotByDraft[draftId] = map;
    });

    // ─── 1. Player ADP ───────────────────────────────────────────────────
    const playerPickMap: Record<string, { name: string; position: string; team: string; picks: { round: number; slot: number; pick_no: number }[] }> = {};

    allPicks.forEach((pick) => {
      if (!pick?.player_id || !pick?.metadata) return;
      const { player_id, pick_no, round, draft_slot, metadata } = pick;
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
      playerPickMap[player_id].picks.push({ round, slot: draft_slot, pick_no });
    });

    const playerADPs: PlayerADP[] = Object.entries(playerPickMap)
      .filter(([, d]) => d.picks.length >= 2)
      .map(([player_id, d]) => {
        const pickNos = d.picks.map((p) => p.pick_no);
        const sortedByPickNo = [...d.picks].sort((a, b) => a.pick_no - b.pick_no);
        const avg = pickNos.reduce((a, b) => a + b, 0) / pickNos.length;
        const avgRound = Math.round(d.picks.reduce((a, b) => a + b.round, 0) / d.picks.length);
        const avgSlot = Math.round(d.picks.reduce((a, b) => a + b.slot, 0) / d.picks.length);
        const minPickInfo = sortedByPickNo[0];
        const maxPickInfo = sortedByPickNo[sortedByPickNo.length - 1];
        return {
          player_id,
          name: d.name,
          position: d.position,
          team: d.team,
          picks: pickNos,
          avgPick: Math.round(avg * 10) / 10,
          avgRound,
          avgSlot,
          minPick: minPickInfo.pick_no,
          maxPick: maxPickInfo.pick_no,
          minLabel: `${minPickInfo.round}.${String(minPickInfo.slot).padStart(2, "0")}`,
          maxLabel: `${maxPickInfo.round}.${String(maxPickInfo.slot).padStart(2, "0")}`,
          stdDev: Math.round(stdDev(pickNos) * 10) / 10,
          timesTop5: pickNos.filter((p) => p <= 5).length,
          timesTop10: pickNos.filter((p) => p <= 10).length,
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

    // ─── 5. Top picks by position ─────────────────────────────────────────
    const topPicksByPosition: Record<string, { name: string; avgPick: number; avgRound: number; avgSlot: number; pickCount: number }[]> = {};
    ["QB", "RB", "WR", "TE"].forEach((pos) => {
      topPicksByPosition[pos] = playerADPs
        .filter((p) => p.position === pos)
        .slice(0, 15)
        .map((p) => ({ name: p.name, avgPick: p.avgPick, avgRound: p.avgRound, avgSlot: p.avgSlot, pickCount: p.picks.length }));
    });

    // ─── 6. Round trade volume (league-level, includes future picks) ──────
    const roundTradeVolumeMap: Record<number, number> = {};
    leagueTradedPicksAll.forEach((tp) => {
      if (!tp?.round) return;
      roundTradeVolumeMap[tp.round] = (roundTradeVolumeMap[tp.round] || 0) + 1;
    });
    const roundTradeVolume = Object.entries(roundTradeVolumeMap)
      .map(([r, count]) => ({ round: parseInt(r), count }))
      .sort((a, b) => a.round - b.round);

    // ─── 7. Most traded pick ──────────────────────────────────────────────
    const mostTraded = pickTradeHeatmap.reduce<PickTradeData | null>(
      (best, p) => (!best || p.tradeCount > best.tradeCount ? p : best),
      null,
    );
    const mostTradedPick = mostTraded ? mostTraded.label : "N/A";

    // ─── 8. Draft completion rates ────────────────────────────────────────
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
