"use client";

import { useEffect, useState } from "react";
import type { AggregatedData } from "@/app/api/sleeper/data/route";
import DraftAnalytics from "@/components/tabs/DraftAnalytics";
import PickTrades from "@/components/tabs/PickTrades";
import FunStats from "@/components/tabs/FunStats";

const TABS = [
  { id: "draft", label: "Draft Analytics" },
  { id: "picks", label: "Pick Trades" },
  { id: "fun", label: "Fun Stats" },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function Home() {
  const [tab, setTab] = useState<Tab>("draft");
  const [data, setData] = useState<AggregatedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [usernameInput, setUsernameInput] = useState("");
  const [userData, setUserData] = useState<AggregatedData | null>(null);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sleeper/data")
      .then((r) => {
        if (!r.ok) throw new Error(`API error ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function handleUsernameSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = usernameInput.trim();
    if (!trimmed) return;

    setUserLoading(true);
    setUserError(null);
    setUserData(null);

    fetch(`/api/sleeper/user/${encodeURIComponent(trimmed)}`)
      .then((r) => {
        if (r.status === 404) throw new Error(`User "${trimmed}" not found on Sleeper`);
        if (!r.ok) throw new Error(`API error ${r.status}`);
        return r.json();
      })
      .then(setUserData)
      .catch((e: Error) => setUserError(e.message))
      .finally(() => setUserLoading(false));
  }

  function clearUser() {
    setUserData(null);
    setUserError(null);
    setUsernameInput("");
  }

  const activeData = userData ?? data;
  const isUserMode = userData !== null;

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-4">
            {/* Logo + title */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex-shrink-0 flex items-center justify-center text-sm font-bold text-white">
                DD
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-white leading-tight">Dynasty Dads Analytics</h1>
                <p className="text-xs text-gray-500 truncate">
                  {userLoading
                    ? "Loading your leagues…"
                    : activeData
                      ? `${activeData.totalLeagues} leagues · ${activeData.totalPicks.toLocaleString()} picks · ${activeData.totalTrades} pick trades`
                      : "Loading data…"}
                </p>
              </div>
            </div>

            {/* Username search + nav */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:ml-auto">
              <form onSubmit={handleUsernameSearch} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Your Sleeper username"
                  disabled={userLoading}
                  className="bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-500 text-sm rounded-lg px-3 py-1.5 w-44 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={userLoading || !usernameInput.trim()}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm rounded-lg transition-colors font-medium"
                >
                  {userLoading ? "…" : "Search"}
                </button>
                {isUserMode && (
                  <button
                    type="button"
                    onClick={clearUser}
                    title="Back to Dynasty Dads stats"
                    className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 text-sm rounded-lg transition-colors"
                  >
                    ✕
                  </button>
                )}
              </form>

              <nav className="flex gap-1 flex-wrap">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      tab === t.id
                        ? "bg-blue-600 text-white"
                        : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* User mode banner */}
          {isUserMode && (
            <div className="border-t border-gray-800 py-2 flex items-center gap-2">
              <span className="text-xs bg-blue-900/50 border border-blue-700 text-blue-300 px-2 py-0.5 rounded-full font-medium">
                Your Leagues
              </span>
              <span className="text-xs text-gray-400">
                Showing stats for{" "}
                <span className="text-white font-medium">
                  {activeData?.viewingUser?.display_name ?? usernameInput}
                </span>
                {" "}· {activeData?.totalLeagues ?? 0} leagues with 2026 rookie drafts
              </span>
            </div>
          )}

          {/* User search error */}
          {userError && (
            <div className="border-t border-gray-800 py-2">
              <p className="text-xs text-red-400">{userError}</p>
            </div>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Initial page load */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-6">
            <div className="w-16 h-16 border-4 border-gray-800 border-t-blue-500 rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-gray-300 font-medium">Fetching data from Sleeper API…</p>
              <p className="text-gray-500 text-sm mt-1">
                Aggregating 34 leagues — this may take 15–30 seconds on first load
              </p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center max-w-sm">
              {["League info", "Draft picks", "ADP calculation", "Trade analysis", "Visualizations"].map((step) => (
                <span
                  key={step}
                  className="text-xs bg-gray-900 border border-gray-800 text-gray-500 px-2 py-1 rounded-full"
                >
                  {step}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* User leagues loading */}
        {userLoading && !loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-12 h-12 border-4 border-gray-800 border-t-blue-500 rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-gray-300 font-medium">Fetching leagues for {usernameInput}…</p>
              <p className="text-gray-500 text-sm mt-1">
                Aggregating draft picks and trades — may take up to 30 seconds
              </p>
            </div>
          </div>
        )}

        {/* Initial load error */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-4">
            <div className="w-12 h-12 bg-red-900/30 border border-red-800 rounded-full flex items-center justify-center text-red-400 text-xl font-bold">
              !
            </div>
            <div className="text-center">
              <p className="text-red-400 font-medium">Failed to load data</p>
              <p className="text-gray-500 text-sm mt-1">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="mt-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Tab content */}
        {!loading && !userLoading && !error && activeData && (
          <>
            {tab === "draft" && <DraftAnalytics data={activeData} />}
            {tab === "picks" && <PickTrades data={activeData} />}
            {tab === "fun" && <FunStats data={activeData} />}
          </>
        )}
      </main>

      {!loading && !error && (
        <footer className="border-t border-gray-800 mt-16 py-6">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-xs text-gray-600">
              Data sourced from the Sleeper API · Dynasty Dads Analytics · {new Date().getFullYear()}
            </p>
          </div>
        </footer>
      )}
    </div>
  );
}
