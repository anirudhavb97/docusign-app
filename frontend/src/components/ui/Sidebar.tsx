"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  Inbox,
  FileText,
  Send,
  CheckSquare,
  Clock,
  Settings,
  HelpCircle,
} from "lucide-react";

const navItems = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/inbox", label: "Fax Inbox", icon: Inbox },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/envelopes", label: "Envelopes", icon: Send },
  { href: "/completed", label: "Completed", icon: CheckSquare },
  { href: "/pending", label: "Waiting for Others", icon: Clock },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-200">
        <div className="w-8 h-8 bg-yellow-400 rounded flex items-center justify-center">
          <span className="text-black font-bold text-sm">DS</span>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900 leading-none">DocuSign</p>
          <p className="text-xs text-gray-500 leading-none mt-0.5">Healthcare</p>
        </div>
      </div>

      {/* Send button */}
      <div className="px-4 py-4">
        <Link
          href="/send"
          className="w-full block text-center bg-yellow-400 hover:bg-yellow-500 text-black font-semibold text-sm py-2 px-4 rounded transition-colors"
        >
          + Send a Fax
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex items-center gap-3 px-3 py-2 rounded text-sm font-medium mb-0.5 transition-colors",
              pathname === href
                ? "bg-blue-50 text-blue-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-2 pb-4 border-t border-gray-200 pt-2">
        <Link href="/settings" className="flex items-center gap-3 px-3 py-2 rounded text-sm text-gray-600 hover:bg-gray-100">
          <Settings size={16} /> Settings
        </Link>
        <Link href="/help" className="flex items-center gap-3 px-3 py-2 rounded text-sm text-gray-600 hover:bg-gray-100">
          <HelpCircle size={16} /> Help & Support
        </Link>
      </div>
    </aside>
  );
}
