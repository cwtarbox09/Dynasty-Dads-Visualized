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

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-sm font-bold text-white">
                DD
              </div>
              <div>
                <h1 className="text-lg font-bold text-white leading-tight">Dynasty Dads Analytics</h1>
                <p className="text-xs text-gray-500">
                  {data
                    ? `${data.totalLeagues} leagues · ${data.totalPicks.toLocaleString()} picks · ${data.totalTrades} pick trades`
                    : "Loading data…"}
                </p>
              </div>
            </div>
            {/* Nav */}
            <nav className="sm:ml-auto flex gap-1 flex-wrap">
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
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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
              {[
                "League info",
                "Draft picks",
                "ADP calculation",
                "Trade analysis",
                "Visualizations",
              ].map((step) => (
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

        {error && (
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

        {!loading && !error && data && (
          <>
            {tab === "draft" && <DraftAnalytics data={data} />}
            {tab === "picks" && <PickTrades data={data} />}
            {tab === "fun" && <FunStats data={data} />}
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
