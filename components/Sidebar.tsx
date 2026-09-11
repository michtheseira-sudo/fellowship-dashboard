"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/funnel", label: "Funnel / KPIs", index: "01" },
  { href: "/website", label: "Website Statistics", index: "02" },
  { href: "/attribution", label: "Marketing Attribution", index: "03" },
  { href: "/goals", label: "Goals", index: "04" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-line bg-paper px-6 py-8 flex flex-col">
      <div className="mb-10">
        <div className="font-head font-semibold text-lg leading-tight text-ink">
          Fellowship
          <br />
          Program
        </div>
        <div className="text-xs text-muted mt-1">Internal performance dashboard</div>
      </div>

      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-baseline gap-3 px-3 py-2.5 rounded-sm text-sm transition-colors ${
                active
                  ? "bg-brand1-pastel text-brand1 font-medium"
                  : "text-ink hover:bg-line/40"
              }`}
            >
              <span className="font-mono text-xs text-muted w-5">{item.index}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto pt-8 border-t border-line text-xs text-muted leading-relaxed">
        Data source:{" "}
        <span className="font-mono">
          {process.env.NEXT_PUBLIC_DATA_MODE ?? "mock"}
        </span>
        <br />
        Set USE_MOCK_DATA=false once HubSpot / GA4 credentials are live.
      </div>
    </aside>
  );
}
