"use client";
import { ChevronDown, CheckCircle2, Download } from "lucide-react";

const recentActivity = [
  { name: "Complete with Docusign: DME Order.pdf", time: "2 days ago", status: "Completed" },
  { name: "Complete with Docusign: Hubli_hotel.pdf", time: "1 week ago", status: "Completed" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero — dark purple */}
      <div style={{ backgroundColor: "#26154a" }} className="w-full px-8 py-8">
        <div className="max-w-5xl mx-auto flex items-start justify-between gap-8">
          {/* Welcome */}
          <div className="flex items-center gap-4 shrink-0 pt-1">
            <div className="w-10 h-10 rounded-full bg-teal-400 flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold">AB</span>
            </div>
            <div>
              <p className="text-white/60 text-xs uppercase tracking-widest mb-0.5">Welcome back</p>
              <p className="text-white text-xl font-semibold whitespace-nowrap">Andy Bharadwaj</p>
            </div>
          </div>

          {/* Stats */}
          <div className="shrink-0">
            <p className="text-white/60 text-xs mb-3 text-right">Last 6 Months</p>
            <div className="flex items-end gap-8">
              {[
                { label: "Action Required", value: "0" },
                { label: "Waiting for Others", value: "0" },
                { label: "Expiring Soon", value: "0" },
                { label: "Completed", value: "2" },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-white text-3xl font-light">{value}</p>
                  <p className="text-white/60 text-xs mt-1 whitespace-nowrap">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CTA band */}
      <div className="bg-gray-100 py-7 px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-center gap-6">
          <p className="text-gray-700 text-sm font-medium">Sign or get signatures</p>
          <button
            style={{ backgroundColor: "#26154a" }}
            className="flex items-center gap-2 text-white text-sm font-medium px-5 py-2 rounded hover:opacity-90 transition-opacity"
          >
            Start <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Agreement activity */}
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Agreement activity</h2>
          <button className="text-gray-400 hover:text-gray-600">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </button>
        </div>

        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
          {recentActivity.map((doc) => (
            <div key={doc.name} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm text-gray-900">{doc.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{doc.time}</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-1.5 text-green-600">
                  <CheckCircle2 size={15} />
                  <span className="text-sm">{doc.status}</span>
                </div>
                <button className="border border-gray-300 text-gray-700 text-sm px-4 py-1.5 rounded hover:bg-gray-50 flex items-center gap-1.5">
                  <Download size={13} /> Download
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Promo cards */}
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="border border-gray-200 rounded-lg p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center shrink-0">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Save time with bulk send</p>
              <p className="text-xs text-gray-500 mt-1">
                No need to send separate envelopes. Import a bulk list and each recipient receives a unique copy.{" "}
                <a href="#" className="text-blue-600 hover:underline">Learn More</a>
              </p>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-5 flex items-center gap-4">
            <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-yellow-300 to-orange-400 flex items-center justify-center shrink-0">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Need help getting started?</p>
              <p className="text-xs text-gray-500 mt-1">
                Get help with basic questions.{" "}
                <a href="#" className="text-blue-600 hover:underline">View Our Guide</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
