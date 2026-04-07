"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/agreements", label: "Agreements" },
  { href: "/templates", label: "Templates" },
  { href: "/reports", label: "Reports" },
  { href: "/admin", label: "Admin" },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center px-8 gap-10">
      {/* DocuSign Logo */}
      <Link href="/" className="flex items-center gap-3 shrink-0">
        {/* Actual DocuSign mark: blue square + red D-curve, dark intersection */}
        <svg width="38" height="34" viewBox="0 0 48 44" fill="none" xmlns="http://www.w3.org/2000/svg">
          {/* Blue/purple square — lower left */}
          <rect x="0" y="12" width="28" height="28" rx="2" fill="#5046E5"/>
          {/* Red D-curve — upper right */}
          <path d="M13 0 H20 C35.464 0 48 9.85 48 22 C48 34.15 35.464 44 20 44 H13 Z" fill="#E8403C"/>
          {/* Dark overlap where they intersect */}
          <path d="M13 12 H28 V28 H13 Z" fill="#12071A"/>
        </svg>
        <span className="font-black text-[20px] tracking-tight text-black">docusign<span className="text-[11px] font-normal align-super ml-0.5">™</span></span>
      </Link>

      {/* Nav links */}
      <nav className="flex items-stretch flex-1 h-16">
        {navItems.map(({ href, label }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center px-4 text-[15px] font-medium border-b-2 transition-colors ${
                active
                  ? "border-[#26154a] text-[#26154a]"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Right icons */}
      <div className="flex items-center gap-4 shrink-0">
        {/* Checklist icon */}
        <button className="text-gray-500 hover:text-gray-700">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/>
            <line x1="9" y1="18" x2="20" y2="18"/>
            <polyline points="3 6 4 7 6 5"/><polyline points="3 12 4 13 6 11"/><polyline points="3 18 4 19 6 17"/>
          </svg>
        </button>
        {/* Help */}
        <button className="text-gray-500 hover:text-gray-700">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10"/>
            <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
            <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
          </svg>
        </button>
        {/* Red dot notification */}
        <button className="relative">
          <div className="w-2.5 h-2.5 bg-red-500 rounded-full" />
        </button>
        {/* User avatar */}
        <button className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center">
          <span className="text-white text-xs font-bold">AB</span>
        </button>
      </div>
    </header>
  );
}
