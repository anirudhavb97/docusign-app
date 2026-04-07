"use client";
import { useState } from "react";
import { Search, Star, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";

const SIDEBAR_SECTIONS = [
  {
    label: "ENVELOPE TEMPLATES",
    items: [
      { label: "My Templates", active: true },
      { label: "Shared with Me" },
      { label: "Favorites" },
      { label: "Show More", isLink: true },
    ],
  },
];

const SIDEBAR_BOTTOM = [
  { label: "Document Templ...", badge: "NEW" },
  { label: "Workflow Templ...", badge: "NEW" },
];

const WEBFORMS = [
  { label: "My Web Forms" },
  { label: "Shared with Me" },
  { label: "All Web Forms" },
];

const TEMPLATES = [
  { name: "Excluded from matching", owner: "Bharadwaj", created: "11:12", changed: "11:12", powerforms: false, starred: false },
  { name: "2024 Employees Withholding Certificate W-4", owner: "Anirudha\nBharadwaj", created: "22-05-25\n11:11", changed: "22-05-25\n11:11", powerforms: false, starred: false },
  { name: "Domestic Wire Transfer", owner: "Anirudha\nBharadwaj", created: "22-05-25\n11:10", changed: "22-05-25\n11:10", powerforms: false, starred: false },
  { name: "SMS Auth test webform", owner: "Anirudha\nBharadwaj", created: "24-07-24\n09:10", changed: "22-01-25\n12:04", powerforms: false, starred: false },
  { name: "Test CFR envelope type template", owner: "Anirudha\nBharadwaj", created: "31-12-24\n15:22", changed: "31-12-24\n15:23", powerforms: false, starred: false },
  { name: "Clinical Trial enrollment", owner: "Anirudha\nBharadwaj", created: "25-06-24\n09:42", changed: "30-12-24\n09:09", powerforms: false, starred: false },
  { name: "[Untitled]", owner: "Anirudha\nBharadwaj", created: "31-07-24\n14:11", changed: "31-07-24\n14:11", powerforms: false, starred: false },
  { name: "Andy's test template", owner: "Anirudha\nBharadwaj", created: "29-01-24\n13:18", changed: "07-02-24\n13:54", powerforms: false, starred: false },
];

export default function TemplatesPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [starred, setStarred] = useState<Set<number>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [activeSection, setActiveSection] = useState("My Templates");

  const filtered = TEMPLATES.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  function toggleAll() {
    if (selectAll) {
      setSelected(new Set());
      setSelectAll(false);
    } else {
      setSelected(new Set(filtered.map((_, i) => i)));
      setSelectAll(true);
    }
  }

  function toggleRow(i: number) {
    const next = new Set(selected);
    next.has(i) ? next.delete(i) : next.add(i);
    setSelected(next);
    setSelectAll(next.size === filtered.length);
  }

  function toggleStar(i: number) {
    const next = new Set(starred);
    next.has(i) ? next.delete(i) : next.add(i);
    setStarred(next);
  }

  return (
    <div className="flex h-full bg-white">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-gray-200 flex flex-col overflow-y-auto">
        {/* Start button */}
        <div className="px-4 pt-4 pb-2">
          <button className="flex items-center gap-1.5 bg-[#1a56db] hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-md w-full justify-center transition-colors">
            Start
            <ChevronDown size={14} />
          </button>
        </div>

        {/* Envelope Templates */}
        <div className="px-3 pt-3">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-2 mb-1">Envelope Templates</p>
          {SIDEBAR_SECTIONS[0].items.map((item) => (
            <button
              key={item.label}
              onClick={() => !item.isLink && setActiveSection(item.label)}
              className={`w-full text-left flex items-center px-3 py-1.5 rounded text-sm transition-colors mb-0.5 ${
                activeSection === item.label && !item.isLink
                  ? "bg-blue-50 text-[#1a56db] font-medium"
                  : item.isLink
                  ? "text-[#1a56db] hover:underline font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Document / Workflow template new items */}
        <div className="px-3 pt-2 pb-2">
          {SIDEBAR_BOTTOM.map((item) => (
            <button
              key={item.label}
              className="w-full text-left flex items-center justify-between px-3 py-1.5 rounded text-sm text-gray-700 hover:bg-gray-100 mb-0.5"
            >
              <span className="truncate">{item.label}</span>
              <span className="ml-2 text-[9px] font-bold bg-orange-400 text-white px-1.5 py-0.5 rounded">NEW</span>
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200 mx-3 my-2" />

        {/* Web Forms */}
        <div className="px-3">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-2 mb-1">Web Forms</p>
          {WEBFORMS.map((item) => (
            <button
              key={item.label}
              onClick={() => setActiveSection(item.label)}
              className={`w-full text-left flex items-center px-3 py-1.5 rounded text-sm transition-colors mb-0.5 ${
                activeSection === item.label
                  ? "bg-blue-50 text-[#1a56db] font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Sub-tabs */}
        <div className="border-b border-gray-200 px-6 flex gap-6">
          {["Templates", "Elastic Templates"].map((tab) => (
            <button
              key={tab}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "Templates"
                  ? "border-[#1a56db] text-[#1a56db]"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <h1 className="text-2xl font-semibold text-gray-900 mb-4">My Templates</h1>

          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex items-center gap-2 border border-gray-300 rounded px-3 py-1.5 bg-white min-w-[240px]">
              <Search size={14} className="text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Search My Templates"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="text-sm text-gray-700 placeholder-gray-400 outline-none flex-1 bg-transparent"
              />
            </div>
            <button className="flex items-center gap-1.5 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white hover:bg-gray-50">
              Date <ChevronDown size={13} className="text-gray-500" />
            </button>
            <button className="flex items-center gap-1.5 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white hover:bg-gray-50">
              Advanced search <ChevronDown size={13} className="text-gray-500" />
            </button>
            <button className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 bg-white hover:bg-gray-50">
              Clear
            </button>
            <div className="ml-auto">
              <button className="p-2 border border-gray-300 rounded text-gray-500 hover:bg-gray-50">
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[40px_40px_1fr_160px_110px_130px_120px] bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 px-2">
              <div className="flex items-center justify-center py-3">
                <input type="checkbox" checked={selectAll} onChange={toggleAll} className="rounded" />
              </div>
              <div className="py-3" />
              <div className="flex items-center gap-1 py-3 cursor-pointer hover:text-gray-900">
                Name
                <span className="text-gray-400">↑↓</span>
              </div>
              <div className="flex items-center gap-1 py-3 cursor-pointer hover:text-gray-900">
                Owner
                <span className="text-gray-400">↑↓</span>
              </div>
              <div className="py-3">Powerforms</div>
              <div className="flex items-center gap-1 py-3 cursor-pointer hover:text-gray-900">
                Created Date
                <span className="text-gray-400">↑↓</span>
              </div>
              <div className="py-3">Last Change</div>
            </div>

            {/* Rows */}
            {filtered.map((t, i) => (
              <div
                key={i}
                className={`grid grid-cols-[40px_40px_1fr_160px_110px_130px_120px] border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors items-center px-2 ${
                  selected.has(i) ? "bg-blue-50" : ""
                }`}
              >
                <div className="flex items-center justify-center py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(i)}
                    onChange={() => toggleRow(i)}
                    className="rounded"
                  />
                </div>
                <div className="flex items-center justify-center py-3">
                  <button onClick={() => toggleStar(i)}>
                    <Star
                      size={15}
                      className={starred.has(i) ? "fill-yellow-400 text-yellow-400" : "text-gray-300 hover:text-yellow-400"}
                    />
                  </button>
                </div>
                <div className="py-3 min-w-0">
                  <p className="text-sm font-medium text-[#1a56db] hover:underline cursor-pointer truncate">{t.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Excluded from matching</p>
                </div>
                <div className="py-3">
                  {t.owner.split("\n").map((line, j) => (
                    <p key={j} className="text-sm text-gray-700 leading-tight">{line}</p>
                  ))}
                </div>
                <div className="py-3 text-sm text-gray-500">—</div>
                <div className="py-3">
                  {t.created.split("\n").map((line, j) => (
                    <p key={j} className="text-sm text-gray-700 leading-tight">{line}</p>
                  ))}
                </div>
                <div className="py-3">
                  {t.changed.split("\n").map((line, j) => (
                    <p key={j} className="text-sm text-gray-700 leading-tight">{line}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pagination footer */}
        <div className="border-t border-gray-200 px-6 py-3 flex items-center justify-between bg-white shrink-0">
          <button className="flex items-center gap-1.5 border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            25 / Page <ChevronDown size={12} className="text-gray-500" />
          </button>
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
    </div>
  );
}
