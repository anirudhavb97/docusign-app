"use client";
import { useState } from "react";
import { Search, ChevronDown, X, Settings2 } from "lucide-react";

const ACCOUNT_SETTINGS = [
  "Plan and Billing",
  "Account Profile",
  "Security Settings",
  "Regional Settings",
  "Brands",
  "Updates",
  "Value Calculator",
  "AI Control Settings",
];

const USERS_AND_GROUPS = [
  "Users",
  "Groups",
  "Permission Profiles",
  "Identity Providers",
];

const INTEGRATIONS = [
  "Apps and Keys",
  "Connect",
  "DocuSign Payments",
];

const NOTIFICATIONS: {type: string; age: string; title: string; body: string; linkLabel?: string}[] = [
  {
    type: "Product Update",
    age: "11 days",
    title: "New Admin Release",
    body: "A new version of DocuSign Admin is available. Visit the release notes page to learn more about the latest changes.",
    linkLabel: "Admin Release Notes",
  },
  {
    type: "Product Update",
    age: "18 days",
    title: "Feature Update",
    body: "New features are available in your DocuSign account. Check the release notes for details.",
    linkLabel: "Release Notes",
  },
];

export default function AdminPage() {
  const [activeSection, setActiveSection] = useState("Plan and Billing");
  const [settingSearch, setSettingSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [userSearchBy, setUserSearchBy] = useState("Name");

  return (
    <div className="flex h-full bg-white">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-gray-200 flex flex-col overflow-y-auto">
        {/* Account selector */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-gray-200 rounded flex items-center justify-center shrink-0">
              <Settings2 size={14} className="text-gray-500" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 leading-tight">Andy&apos;s test account Demo</p>
              <p className="text-xs text-gray-500">Workspaces</p>
              <p className="text-xs text-gray-500">Account ID: 37267583</p>
            </div>
          </div>
          <div className="mt-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">Accounts</p>
            <button className="flex items-center justify-between w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm text-gray-700 bg-white hover:bg-gray-50">
              <span className="truncate">Andy&apos;s te... (37267583)</span>
              <ChevronDown size={13} className="text-gray-500 shrink-0 ml-1" />
            </button>
          </div>
        </div>

        {/* Nav */}
        <div className="flex-1 px-3 py-3 overflow-y-auto">
          {/* Overview */}
          <button
            onClick={() => setActiveSection("Overview")}
            className={`w-full text-left px-3 py-1.5 rounded text-sm font-medium mb-1 transition-colors ${
              activeSection === "Overview"
                ? "bg-blue-50 text-[#1a56db]"
                : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Overview
          </button>

          <div className="border-b border-gray-100 mb-2" />

          {/* Account section */}
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-2 mb-1">Account</p>
          {ACCOUNT_SETTINGS.map((item) => (
            <button
              key={item}
              onClick={() => setActiveSection(item)}
              className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors mb-0.5 ${
                activeSection === item
                  ? "bg-blue-50 text-[#1a56db] font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {item}
            </button>
          ))}

          <div className="border-b border-gray-100 my-2" />

          {/* Users and Groups */}
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-2 mb-1">Users and Groups</p>
          {USERS_AND_GROUPS.map((item) => (
            <button
              key={item}
              onClick={() => setActiveSection(item)}
              className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors mb-0.5 ${
                activeSection === item
                  ? "bg-blue-50 text-[#1a56db] font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {item}
            </button>
          ))}

          <div className="border-b border-gray-100 my-2" />

          {/* Integrations */}
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-2 mb-1">Integrations</p>
          {INTEGRATIONS.map((item) => (
            <button
              key={item}
              onClick={() => setActiveSection(item)}
              className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors mb-0.5 ${
                activeSection === item
                  ? "bg-blue-50 text-[#1a56db] font-medium"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* Find a Setting or User card */}
        <div className="border border-gray-200 rounded-lg p-6 mb-6 max-w-2xl">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Find a Setting or User</h2>

          {/* Find a Setting */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Find a Setting</label>
            <div className="flex items-center gap-2 border border-gray-300 rounded px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-blue-200 focus-within:border-blue-400 transition">
              <Search size={15} className="text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="Enter keyword"
                value={settingSearch}
                onChange={(e) => setSettingSearch(e.target.value)}
                className="text-sm text-gray-700 placeholder-gray-400 outline-none flex-1 bg-transparent"
              />
            </div>
          </div>

          {/* Find a User */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Find a User</label>
            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 bg-white hover:bg-gray-50 shrink-0">
                {userSearchBy}
                <ChevronDown size={13} className="text-gray-500" />
              </button>
              <input
                type="text"
                placeholder="Enter name"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition"
              />
              <button
                disabled={!userSearch.trim()}
                className="border border-gray-300 rounded px-4 py-2 text-sm font-medium text-gray-500 bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Search
              </button>
            </div>
          </div>
        </div>

        {/* Notifications card */}
        <div className="border border-gray-200 rounded-lg overflow-hidden max-w-2xl">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
          </div>

          {/* Filters */}
          <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2">
            <div className="flex items-center gap-1.5 border border-gray-300 rounded px-2.5 py-1 text-xs text-gray-700 bg-white">
              Date: Last 3 Months
              <button className="text-gray-400 hover:text-gray-600 ml-1">
                <X size={11} />
              </button>
            </div>
            <button className="flex items-center gap-1 border border-gray-300 rounded px-2.5 py-1 text-xs text-gray-700 bg-white hover:bg-gray-50">
              Type <ChevronDown size={11} className="text-gray-500" />
            </button>
            <button className="text-xs text-gray-600 hover:text-gray-900 ml-1">Clear All</button>
            <button className="ml-auto p-1.5 border border-gray-200 rounded text-gray-500 hover:bg-gray-50">
              <Settings2 size={14} />
            </button>
          </div>

          {/* Notification items */}
          {NOTIFICATIONS.map((n, i) => (
            <div key={i} className="px-6 py-4 border-b border-gray-100 last:border-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500 mb-1">{n.type}</p>
                  <p className="text-sm font-semibold text-gray-900 mb-1">{n.title}</p>
                  <p className="text-sm text-gray-600 mb-2 leading-relaxed">{n.body}</p>
                  {n.linkLabel && (
                    <button className="text-xs font-medium border border-gray-300 rounded px-3 py-1.5 text-gray-700 hover:bg-gray-50 transition-colors">
                      {n.linkLabel}
                    </button>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0 whitespace-nowrap">{n.age}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
