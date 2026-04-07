"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileText,
  Folder,
  MoreHorizontal,
  Zap,
  LayoutGrid,
  Send,
  GitBranch,
  Lock,
  Inbox,
} from "lucide-react";

const mainNav = [
  { href: "/agreements", label: "All Agreements", icon: null },
  { href: "/agreements/drafts", label: "Drafts", icon: null },
  { href: "/agreements/in-progress", label: "In Progress", icon: null },
  { href: "/agreements/completed", label: "Completed", icon: null },
  { href: "/agreements/deleted", label: "Deleted", icon: null },
];

const toolsNav = [
  { href: "/agreements/requests", label: "Requests", icon: GitBranch, badge: null },
  { href: "/agreements/maestro", label: "Maestro Workflows", icon: LayoutGrid, badge: "New" },
  { href: "/agreements/powerforms", label: "PowerForms", icon: Zap, badge: null },
  { href: "/agreements/bulk-send", label: "Bulk Send", icon: Send, badge: null },
];

export default function AgreementsSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[270px] shrink-0 border-r border-gray-200 flex flex-col bg-white">
      {/* Start button */}
      <div className="p-4">
        <button
          style={{ backgroundColor: "#26154a" }}
          className="w-full flex items-center justify-center gap-2 text-white text-sm font-semibold py-2.5 px-4 rounded hover:opacity-90 transition-opacity"
        >
          Start
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      </div>

      {/* Main nav */}
      <nav className="px-2">
        {mainNav.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded text-sm mb-0.5 transition-colors ${
                active
                  ? "bg-purple-50 text-[#26154a] font-semibold"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <FileText size={15} className="text-gray-400 shrink-0" />
              {label}
            </Link>
          );
        })}

        {/* Folders row */}
        <div className="flex items-center justify-between px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded cursor-pointer mt-0.5">
          <div className="flex items-center gap-3">
            <Folder size={15} className="text-gray-400" />
            Folders
          </div>
          <MoreHorizontal size={15} className="text-gray-400" />
        </div>
      </nav>

      {/* Divider */}
      <div className="h-px bg-gray-200 mx-4 my-3" />

      {/* Tools nav */}
      <nav className="px-2 flex-1">
        {toolsNav.map(({ href, label, icon: Icon, badge }) => {
          const active = pathname === href || (pathname === "/agreements" && href === "/agreements/requests");
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-between px-3 py-2.5 rounded text-sm mb-0.5 transition-colors ${
                active
                  ? "bg-purple-50 text-[#26154a] font-semibold"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <div className="flex items-center gap-3">
                {Icon && <Icon size={15} className={active ? "text-[#26154a]" : "text-gray-500"} />}
                {label}
              </div>
              {badge && (
                <span className="text-[10px] font-semibold text-gray-500 border border-gray-300 rounded px-1.5 py-0.5">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom — New navigation toggle */}
      <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* Toggle (on) */}
          <div className="w-9 h-5 bg-[#26154a] rounded-full relative cursor-pointer">
            <div className="w-4 h-4 bg-white rounded-full absolute right-0.5 top-0.5 shadow" />
          </div>
          <span className="text-xs text-gray-600">New navigation</span>
        </div>
        <Lock size={14} className="text-gray-400" />
      </div>
    </aside>
  );
}
