"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  LineChart,
  Briefcase,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/screener", label: "Screener", icon: Search },
  { href: "/portfolio", label: "Portfolio", icon: Briefcase },
  { href: "/regime", label: "Regime", icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r border-gray-800 bg-gray-900 flex flex-col">
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white">
          <LineChart className="inline-block w-5 h-5 mr-2 text-blue-500" />
          Market Intel
        </h1>
        <p className="text-xs text-gray-500 mt-1">AI-Powered Analytics</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-blue-500/10 text-blue-400"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <div className="text-xs text-gray-600">
          Data: yfinance + FRED + Finnhub
          <br />
          AI: Claude API
        </div>
      </div>
    </aside>
  );
}
