"use client";

import { useState } from "react";
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
  const [open, setOpen] = useState(false);
  const items = [...NAV];
  if (role === "admin") {
    items.push({ href: "/users", label: "משתמשים" });
    items.push({ href: "/settings", label: "הגדרות" });
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 sm:px-4">
        {/* Logo */}
        <Link href="/contacts" className="flex shrink-0 items-center gap-2 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-lg">
            💰
          </span>
          <span className="text-base font-bold text-gray-900 sm:text-lg">ניהול כספים</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden flex-1 items-center gap-1 lg:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* User + actions (desktop) */}
        <div className="hidden items-center gap-3 lg:flex">
          <div className="text-left">
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

        {/* Hamburger (mobile) */}
        <button
          type="button"
          aria-label="תפריט"
          onClick={() => setOpen((v) => !v)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 lg:hidden"
        >
          {open ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="border-t border-gray-100 bg-white px-3 pb-3 lg:hidden">
          {/* User row */}
          <div className="flex items-center gap-3 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
              {userName.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-medium text-gray-800">{userName}</div>
              <div className="text-xs text-gray-400">{role === "admin" ? "מנהל" : "משתמש"}</div>
            </div>
          </div>
          <nav className="flex flex-col gap-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
                  isActive(item.href)
                    ? "bg-brand-50 text-brand-700"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="btn-secondary mt-3 w-full !py-2 text-sm"
          >
            יציאה
          </button>
        </div>
      )}
    </header>
  );
}
