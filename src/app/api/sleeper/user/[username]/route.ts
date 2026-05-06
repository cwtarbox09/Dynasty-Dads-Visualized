import { NextResponse } from "next/server";
import { fetchUserByUsername, fetchUserLeagues } from "@/lib/sleeper";
import { aggregateLeagueData, type AggregatedData } from "@/lib/aggregate";

export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  try {
    const { username } = await params;

    const user = await fetchUserByUsername(username);
    if (!user?.user_id) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const leagues = await fetchUserLeagues(user.user_id, "2026");
    const leagueIds = leagues.map((l) => l.league_id).filter(Boolean);

    const aggregated = await aggregateLeagueData(leagueIds);

    const result: AggregatedData = {
      ...aggregated,
      viewingUser: {
        display_name: user.display_name || user.username,
        user_id: user.user_id,
        avatar: user.avatar ?? null,
      },
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("Error fetching user data:", err);
    return NextResponse.json({ error: "Failed to fetch user data" }, { status: 500 });
  }
}
