const BASE = "https://api.sleeper.app/v1";

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  total_rosters: number;
  roster_positions: string[];
  settings: {
    num_teams: number;
    playoff_teams: number;
    playoff_week_start: number;
    leg: number;
  };
  scoring_settings: Record<string, number>;
  status: string;
  draft_id: string;
}

export interface SleeperDraft {
  draft_id: string;
  league_id: string;
  season: string;
  type: string;
  status: string;
  settings: {
    teams: number;
    rounds: number;
    pick_timer: number;
    slots_wr: number;
    slots_rb: number;
    slots_qb: number;
    slots_te: number;
    slots_flex: number;
    slots_super_flex: number;
    slots_k: number;
    slots_def: number;
    slots_bn: number;
  };
  draft_order: Record<string, number> | null;
  slot_to_roster_id: Record<string, number> | null;
  start_time: number;
  created: number;
}

export interface DraftPickMetadata {
  years_exp: string;
  team: string;
  status: string;
  sport: string;
  position: string;
  player_id: string;
  number: string;
  news_updated: string;
  last_name: string;
  injury_status: string;
  first_name: string;
  amount?: string;
}

export interface DraftPick {
  player_id: string;
  picked_by: string;
  roster_id: string;
  round: number;
  draft_slot: number;
  pick_no: number;
  metadata: DraftPickMetadata;
  is_keeper: boolean | null;
  draft_id: string;
}

export interface TradedPick {
  season: string;
  round: number;
  roster_id: number;
  previous_owner_id: number;
  owner_id: number;
  draft_id?: string;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  league_id: string;
  players: string[];
  settings: {
    wins: number;
    losses: number;
    ties: number;
    fpts: number;
    fpts_decimal: number;
    fpts_against: number;
    fpts_against_decimal: number;
    ppts: number;
    ppts_decimal: number;
    waiver_position: number;
    waiver_budget_used: number;
    total_moves: number;
    streak: number;
    rank: number;
  };
  starters: string[];
  reserve: string[];
  taxi: string[];
}

export interface SleeperUser {
  user_id: string;
  display_name: string;
  avatar: string;
  metadata: {
    team_name?: string;
  };
}

async function fetchWithRetry(url: string, retries = 3): Promise<unknown> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { next: { revalidate: 3600 } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
}

export async function fetchLeague(leagueId: string): Promise<SleeperLeague> {
  return fetchWithRetry(`${BASE}/league/${leagueId}`) as Promise<SleeperLeague>;
}

export async function fetchLeagueUsers(leagueId: string): Promise<SleeperUser[]> {
  return fetchWithRetry(`${BASE}/league/${leagueId}/users`) as Promise<SleeperUser[]>;
}

export async function fetchLeagueRosters(leagueId: string): Promise<SleeperRoster[]> {
  return fetchWithRetry(`${BASE}/league/${leagueId}/rosters`) as Promise<SleeperRoster[]>;
}

export async function fetchLeagueDrafts(leagueId: string): Promise<SleeperDraft[]> {
  return fetchWithRetry(`${BASE}/league/${leagueId}/drafts`) as Promise<SleeperDraft[]>;
}

export async function fetchDraftPicks(draftId: string): Promise<DraftPick[]> {
  return fetchWithRetry(`${BASE}/draft/${draftId}/picks`) as Promise<DraftPick[]>;
}

export async function fetchDraftTradedPicks(draftId: string): Promise<TradedPick[]> {
  return fetchWithRetry(`${BASE}/draft/${draftId}/traded_picks`) as Promise<TradedPick[]>;
}

export async function fetchLeagueTradedPicks(leagueId: string): Promise<TradedPick[]> {
  return fetchWithRetry(`${BASE}/league/${leagueId}/traded_picks`) as Promise<TradedPick[]>;
}
