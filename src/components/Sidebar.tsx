"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

type IconName =
  | "contacts"
  | "income"
  | "expenses"
  | "categories"
  | "donations"
  | "reports"
  | "users"
  | "settings"
  | "logout";

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "contacts":
      return (
        <svg {...common}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9.5" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "income":
      return (
        <svg {...common}>
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M17 7h4v4" />
        </svg>
      );
    case "expenses":
      return (
        <svg {...common}>
          <path d="M3 7l6 6 4-4 8 8" />
          <path d="M17 17h4v-4" />
        </svg>
      );
    case "categories":
      return (
        <svg {...common}>
          <path d="M20.59 13.41 13.42 20.6a2 2 0 0 1-2.83 0L3 13V4a1 1 0 0 1 1-1h9l7.59 7.59a2 2 0 0 1 0 2.82Z" />
          <circle cx="7.5" cy="7.5" r="1.2" />
        </svg>
      );
    case "donations":
      return (
        <svg {...common}>
          <path d="M20 12v9H4v-9" />
          <path d="M2 7h20v5H2z" />
          <path d="M12 22V7" />
          <path d="M12 7S9 3 6.5 4.5 8 8 12 7Zm0 0s3-4 5.5-2.5S16 8 12 7Z" />
        </svg>
      );
    case "reports":
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <rect x="7" y="11" width="3" height="6" rx="1" />
          <rect x="12" y="7" width="3" height="10" rx="1" />
          <rect x="17" y="13" width="3" height="4" rx="1" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <circle cx="18" cy="8" r="2.4" />
          <path d="M22 21v-1.5a3 3 0 0 0-2.5-2.95" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <path d="M16 17l5-5-5-5" />
          <path d="M21 12H9" />
        </svg>
      );
  }
}

const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/contacts", label: "אנשי קשר", icon: "contacts" },
  { href: "/income", label: "הכנסות", icon: "income" },
  { href: "/expenses", label: "הוצאות", icon: "expenses" },
  { href: "/categories", label: "קטגוריות", icon: "categories" },
  { href: "/special-donations", label: "תרומות מיוחדות", icon: "donations" },
  { href: "/reports", label: "דוחות", icon: "reports" },
];

export function Sidebar({ userName, role }: { userName: string; role: "admin" | "user" }) {
  const pathname = usePathname();
  const items = [...NAV];
  if (role === "admin") {
    items.push({ href: "/users", label: "משתמשים", icon: "users" });
    items.push({ href: "/settings", label: "הגדרות", icon: "settings" });
  }
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-[76px] flex-col border-l border-white/5 bg-gradient-to-b from-[#141a2e] via-[#111629] to-[#0c0f1d] text-slate-300 lg:w-[264px]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-extrabold text-white shadow-glow">
          ד
        </span>
        <div className="hidden min-w-0 lg:block">
          <div className="truncate font-extrabold tracking-tight text-white">ניהול כספים</div>
          <div className="truncate text-[11px] text-slate-400">דברי אלקים חיים</div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
            >
              {active && (
                <span className="absolute inset-y-1.5 right-0 w-1 rounded-full bg-gradient-to-b from-brand-400 to-brand-600" />
              )}
              <span className="shrink-0">
                <Icon name={item.icon} />
              </span>
              <span className="hidden truncate lg:block">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom: user chip + logout */}
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white ring-2 ring-white/10">
            {userName.charAt(0).toUpperCase()}
          </span>
          <div className="hidden min-w-0 lg:block">
            <div className="truncate text-sm font-semibold text-white">{userName}</div>
            <div className="text-[11px] text-slate-400">{role === "admin" ? "מנהל" : "משתמש"}</div>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title="יציאה"
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-white/5 lg:justify-start"
        >
          <Icon name="logout" />
          <span className="hidden lg:block">יציאה</span>
        </button>
      </div>
    </aside>
  );
}
