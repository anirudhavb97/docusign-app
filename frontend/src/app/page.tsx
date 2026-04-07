"use client";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, Download, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const recentActivity = [
  { name: "Complete with Docusign: DME Order.pdf", time: "4 days ago", status: "Completed" },
  { name: "Complete with Docusign: Hubli_hotel.pdf", time: "2 weeks ago", status: "Completed" },
];

const MENU_ITEMS = [
  {
    section: "Agreements",
    items: [
      { label: "Envelopes", hasArrow: true, href: "/send-envelope" },
      { label: "Create Request", hasArrow: false, href: "/agreements" },
      { label: "Maestro Workflows", hasArrow: true, href: "#" },
      { label: "Create PowerForm", hasArrow: false, href: "#" },
      { label: "Generate Agreement", hasArrow: false, badge: "NEW", href: "#" },
    ],
  },
  {
    section: "Templates",
    items: [
      { label: "Envelope Templates", hasArrow: true, href: "/templates" },
      { label: "Web Forms", hasArrow: true, href: "/templates" },
    ],
  },
];

// Icons for each menu item
const ICONS: Record<string, React.ReactNode> = {
  Envelopes: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="M2 7l10 7 10-7"/>
    </svg>
  ),
  "Create Request": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  "Maestro Workflows": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0">
      <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98"/>
    </svg>
  ),
  "Create PowerForm": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  "Generate Agreement": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0">
      <rect x="2" y="3" width="20" height="18" rx="2"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="14" y2="14"/>
    </svg>
  ),
  "Envelope Templates": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="M2 7l10 7 10-7"/>
    </svg>
  ),
  "Web Forms": (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0">
      <rect x="2" y="3" width="20" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/>
    </svg>
  ),
};

export default function HomePage() {
  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown when clicking outside
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  function handleItem(href: string) {
    setOpen(false);
    if (href === "#") return;
    router.push(href);
  }

  return (
    <div className="h-full overflow-y-auto bg-white">
      {/* Hero — dark purple */}
      <div style={{ backgroundColor: "#26154a" }} className="w-full px-8 py-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-8">
          {/* Welcome */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="w-10 h-10 rounded-full bg-teal-400 flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold">AB</span>
            </div>
            <div>
              <p className="text-white/50 text-xs uppercase tracking-widest mb-0.5">Welcome Back</p>
              <p className="text-white text-xl font-semibold whitespace-nowrap">Andy Bharadwaj</p>
            </div>
          </div>

          {/* Stats */}
          <div className="shrink-0">
            <p className="text-white/50 text-xs mb-3 text-right">Last 6 Months</p>
            <div className="flex items-end gap-10">
              {[
                { label: "Action Required", value: "0" },
                { label: "Waiting for Others", value: "0" },
                { label: "Expiring Soon", value: "0" },
                { label: "Completed", value: "2" },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <p className="text-white text-4xl font-light leading-none">{value}</p>
                  <p className="text-white/50 text-xs mt-2 whitespace-nowrap">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* CTA band with Start dropdown */}
      <div className="bg-gray-100 py-8 px-8">
        <div className="max-w-5xl mx-auto flex flex-col items-center gap-3">
          <p className="text-gray-600 text-sm">Sign or get signatures</p>

          {/* Start button + dropdown */}
          <div className="relative" ref={dropRef}>
            <button
              onClick={() => setOpen((v) => !v)}
              style={{ backgroundColor: "#26154a" }}
              className="flex items-center gap-2 text-white text-sm font-semibold px-6 py-2.5 rounded-md hover:opacity-90 transition-opacity"
            >
              Start <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {open && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 py-2 overflow-hidden">
                {MENU_ITEMS.map((group) => (
                  <div key={group.section}>
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider px-4 py-2">
                      {group.section}
                    </p>
                    {group.items.map((item) => (
                      <button
                        key={item.label}
                        onClick={() => handleItem(item.href)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-800 hover:bg-gray-50 transition-colors"
                      >
                        <span className="text-gray-500">{ICONS[item.label]}</span>
                        <span className="flex-1 text-left font-medium">{item.label}</span>
                        {item.badge && (
                          <span className="text-[9px] font-bold bg-orange-400 text-white px-1.5 py-0.5 rounded">
                            {item.badge}
                          </span>
                        )}
                        {item.hasArrow && <ChevronRight size={14} className="text-gray-400 shrink-0" />}
                      </button>
                    ))}
                    <div className="border-t border-gray-100 my-1" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Agreement activity */}
      <div className="max-w-5xl mx-auto px-8 py-8">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Agreement activity</h2>
          <Info size={14} className="text-gray-400" />
        </div>

        <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 mb-6">
          {recentActivity.map((doc) => (
            <div key={doc.name} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm text-gray-900">{doc.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{doc.time}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-green-600">
                  <CheckCircle2 size={14} />
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
        <div className="grid grid-cols-2 gap-4">
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
                <Link href="/agreements/requests" className="text-blue-600 hover:underline">Open Agreement Desk</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
