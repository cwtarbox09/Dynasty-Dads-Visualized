import { NextResponse } from "next/server";
import { LEAGUE_IDS } from "@/lib/constants";
import { aggregateLeagueData } from "@/lib/aggregate";

export const maxDuration = 60;
export const revalidate = 3600;

// Re-export types so existing imports from "@/app/api/sleeper/data/route" still work
export type { PlayerADP, PickTradeData, PositionRoundData, AggregatedData } from "@/lib/aggregate";

export async function GET() {
  try {
    const result = await aggregateLeagueData(LEAGUE_IDS);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Error fetching Sleeper data:", err);
    return NextResponse.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}
