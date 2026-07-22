"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const NAV = [
  { href: "/contacts", label: "אנשי קשר" },
  { href: "/income", label: "הכנסות" },
  { href: "/expenses", label: "הוצאות" },
  { href: "/categories", label: "קטגוריות" },
  { href: "/special-donations", label: "תרומות מיוחדות" },
  { href: "/reports", label: "דוחות" },
];

export function TopNav({ userName, role }: { userName: string; role: "admin" | "user" }) {
  const pathname = usePathname();
  const items = [...NAV];
  if (role === "admin") items.push({ href: "/settings", label: "הגדרות" });

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-2 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-lg">
            💰
          </span>
          <span className="text-lg font-bold text-gray-900">ניהול כספים</span>
        </div>

        <nav className="flex flex-1 items-center gap-1">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <div className="hidden text-left sm:block">
            <div className="text-sm font-medium text-gray-800">{userName}</div>
            <div className="text-xs text-gray-400">{role === "admin" ? "מנהל" : "משתמש"}</div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
            {userName.charAt(0).toUpperCase()}
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="btn-secondary !px-3 !py-1.5 text-xs"
          >
            יציאה
          </button>
        </div>
      </div>
    </header>
  );
}
