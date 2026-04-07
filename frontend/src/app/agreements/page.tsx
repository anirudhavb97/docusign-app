"use client";
import { useState } from "react";
import { Search, X, ChevronDown, SlidersHorizontal, Bookmark, BarChart2, ChevronLeft, ChevronRight } from "lucide-react";

export default function AgreementsPage() {
  const [search, setSearch] = useState("");

  return (
    <div className="flex flex-col h-full">
      {/* Main content */}
      <div className="flex-1 px-8 py-6">
        {/* Header row */}
        <div className="flex items-center justify-between mb-6 min-w-0">
          <h1 className="text-[28px] font-normal text-gray-900 shrink-0">Requests</h1>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button className="border border-gray-300 rounded p-2 hover:bg-gray-50 text-gray-600">
              <BarChart2 size={18} />
            </button>
            <button className="border border-gray-300 rounded px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 font-medium whitespace-nowrap">
              Settings
            </button>
            <button
              style={{ backgroundColor: "#26154a" }}
              className="text-white text-sm font-semibold px-4 py-2 rounded hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              Create Request
            </button>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex items-center gap-2 mb-8 flex-wrap">
          {/* Search */}
          <div className="flex items-center gap-2 border border-gray-300 rounded px-3 py-1.5 bg-white min-w-[220px] flex-1 max-w-xs">
            <Search size={14} className="text-gray-400 shrink-0" />
            <input
              type="text"
              placeholder="Search Request Titles or IDs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm text-gray-700 placeholder-gray-400 outline-none flex-1 bg-transparent"
            />
          </div>

          {/* Status filter chip */}
          <div className="flex items-center gap-1.5 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white cursor-pointer hover:bg-gray-50 whitespace-nowrap">
            <span>Status Type: Open</span>
            <X size={13} className="text-gray-400 hover:text-gray-600" />
          </div>

          {/* Created At */}
          <button className="flex items-center gap-1.5 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white hover:bg-gray-50 whitespace-nowrap">
            Created At <ChevronDown size={13} className="text-gray-500" />
          </button>

          {/* Due Date */}
          <button className="flex items-center gap-1.5 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white hover:bg-gray-50 whitespace-nowrap">
            Due Date <ChevronDown size={13} className="text-gray-500" />
          </button>

          {/* All Filters */}
          <button className="flex items-center gap-1.5 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white hover:bg-gray-50 whitespace-nowrap">
            <SlidersHorizontal size={14} className="text-gray-500" />
            All Filters
          </button>

          {/* Save/bookmark */}
          <button className="border border-gray-300 rounded p-1.5 text-gray-500 hover:bg-gray-50 bg-white">
            <Bookmark size={15} />
          </button>
        </div>

        {/* Empty state */}
        <div className="flex items-center justify-center pt-24">
          <p className="text-gray-500 text-sm">There are no requests that fit the active filters.</p>
        </div>
      </div>

      {/* Pagination footer */}
      <div className="border-t border-gray-200 px-8 py-3 flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            25 / Page <ChevronDown size={12} className="text-gray-500" />
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Page 1</span>
          <button className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" disabled>
            <ChevronLeft size={16} />
          </button>
          <button className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30" disabled>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
