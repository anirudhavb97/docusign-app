"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";

const REPORT_TYPES = [
  { label: "All", count: 21 },
  { label: "Envelope", count: 8 },
  { label: "Recipient", count: 2 },
  { label: "Usage", count: 11 },
  { label: "Document Data", count: 1 },
  { label: "Custom", count: 0 },
];

// Bar chart data: dates Mar 8 → Apr 7
const BAR_DATA = (() => {
  const labels: string[] = [];
  const values: number[] = [];
  const start = new Date("2026-03-08");
  for (let i = 0; i < 31; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const mon = d.toLocaleString("en-US", { month: "short" });
    const day = d.getDate();
    // Only show label every 4 days to match screenshot
    labels.push(i % 4 === 0 ? `${mon} ${day}` : "");
    // Place the bar on Mar 28 (index 20)
    values.push(i === 20 ? 1 : 0);
  }
  return { labels, values };
})();

const CHART_HEIGHT = 200;
const MAX_VAL = 4;

export default function ReportsPage() {
  const [activeNav, setActiveNav] = useState("Administrator dashboard");
  const [activeType, setActiveType] = useState("All");

  return (
    <div className="flex h-full bg-white">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-gray-200 flex flex-col overflow-y-auto py-4">
        {/* Dashboards */}
        <div className="px-3 mb-2">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-2 mb-1">Dashboards</p>
          {["My dashboard", "Administrator dashboard"].map((item) => (
            <button
              key={item}
              onClick={() => setActiveNav(item)}
              className={`w-full text-left flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors mb-0.5 ${
                activeNav === item
                  ? "bg-blue-50 text-[#1a56db] font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 opacity-60">
                  <rect x="1" y="1" width="6" height="6" rx="1"/>
                  <rect x="9" y="1" width="6" height="6" rx="1"/>
                  <rect x="1" y="9" width="6" height="6" rx="1"/>
                  <rect x="9" y="9" width="6" height="6" rx="1"/>
                </svg>
              </span>
              {item}
            </button>
          ))}
        </div>

        <div className="border-t border-gray-200 mx-3 my-2" />

        {/* Report Types */}
        <div className="px-3">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-2 mb-1">Report Type</p>
          {REPORT_TYPES.map((rt) => (
            <button
              key={rt.label}
              onClick={() => setActiveType(rt.label)}
              className={`w-full text-left flex items-center justify-between px-3 py-1.5 rounded text-sm transition-colors mb-0.5 ${
                activeType === rt.label
                  ? "bg-blue-50 text-[#1a56db] font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <ChevronRight size={13} className="text-gray-400" />
                {rt.label}
              </span>
              <span className="text-xs text-gray-500">({rt.count})</span>
            </button>
          ))}

          <div className="border-t border-gray-100 my-2" />
          {["Custom (0)", "Downloads"].map((item) => (
            <button
              key={item}
              className="w-full text-left px-3 py-1.5 rounded text-sm text-gray-700 hover:bg-gray-100 mb-0.5"
            >
              {item}
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="flex items-center gap-2 mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Administrator dashboard</h1>
          <Info size={18} className="text-gray-400" />
        </div>

        {/* Envelope Usage Card */}
        <div className="border border-gray-200 rounded-lg p-6 mb-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">Envelope Usage</h2>

          {/* Filters row */}
          <div className="flex flex-wrap gap-3 mb-6">
            {[
              { label: "Time Period", value: "Last 30 Days" },
              { label: "Time Bucket", value: "Daily" },
              { label: "Envelope Status", value: "2 Selected" },
              { label: "Group", value: "Everyone" },
            ].map((f) => (
              <div key={f.label} className="flex flex-col gap-1">
                <label className="text-xs text-gray-500">{f.label}</label>
                <button className="flex items-center gap-2 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white hover:bg-gray-50 min-w-[130px]">
                  {f.value}
                  <ChevronDown size={13} className="text-gray-500 ml-auto" />
                </button>
              </div>
            ))}
          </div>

          {/* Metric */}
          <div className="mb-2">
            <p className="text-4xl font-bold text-[#1a56db]">1</p>
            <p className="text-sm text-gray-600 mt-0.5">Total Envelopes</p>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#1e3a8a]" />
              <span className="text-xs text-gray-600">Completed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-sm bg-[#6b7280]" />
              <span className="text-xs text-gray-600">In Progress</span>
            </div>
          </div>

          {/* Bar chart */}
          <div className="relative">
            {/* Y-axis labels */}
            <div className="flex">
              <div className="w-6 shrink-0 flex flex-col justify-between text-right pr-1" style={{ height: CHART_HEIGHT }}>
                {[MAX_VAL, 3, 2, 1, 0].map((v) => (
                  <span key={v} className="text-[10px] text-gray-400 leading-none">{v}</span>
                ))}
              </div>

              {/* Chart area */}
              <div className="flex-1 relative border-b border-l border-gray-200" style={{ height: CHART_HEIGHT }}>
                {/* Grid lines */}
                {[0, 1, 2, 3].map((g) => (
                  <div
                    key={g}
                    className="absolute w-full border-t border-gray-100"
                    style={{ bottom: `${(g / MAX_VAL) * 100}%` }}
                  />
                ))}

                {/* Bars */}
                <div className="absolute inset-0 flex items-end">
                  {BAR_DATA.values.map((v, i) => (
                    <div
                      key={i}
                      className="flex-1 flex items-end justify-center px-px"
                    >
                      {v > 0 && (
                        <div
                          className="w-full bg-[#1e3a8a] rounded-t relative"
                          style={{ height: `${(v / MAX_VAL) * CHART_HEIGHT}px` }}
                        >
                          <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] text-gray-600 font-medium">
                            {v}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* X-axis labels */}
            <div className="flex mt-1 ml-6">
              {BAR_DATA.labels.map((label, i) => (
                <div key={i} className="flex-1 text-center">
                  {label && <span className="text-[10px] text-gray-400 whitespace-nowrap">{label}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Zero-value rows below chart (matching screenshot) */}
        <div className="text-xs text-gray-400 text-center mt-1">
          Showing data for the last 30 days · Auto-refreshes daily
        </div>
      </div>
    </div>
  );
}
