"use client";

import { useEffect } from "react";
import {
  OBLIGATION_STATUS,
  KESHER_STATUS,
  KESHER_SUCCESS_CODES,
  type ObligationStatus,
} from "@/lib/constants";

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    // Lock body scroll while the modal is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-2 pt-4 backdrop-blur-sm animate-fade-in sm:p-4 sm:pt-16"
      onClick={onClose}
    >
      <div
        className={`w-full rounded-3xl border border-slate-200/70 bg-white p-5 shadow-lift animate-pop-in sm:p-6 ${
          wide ? "max-w-2xl" : "max-w-lg"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="text-lg font-extrabold tracking-tight text-slate-800">{title}</h2>
          <button
            onClick={onClose}
            aria-label="סגור"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 sm:text-[26px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function ObligationStatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    paused: "bg-yellow-100 text-yellow-700",
    cancelled: "bg-red-100 text-red-700",
    finished: "bg-gray-100 text-gray-600",
    pending_bank_auth: "bg-blue-100 text-blue-700",
    bank_auth_cancelled: "bg-red-100 text-red-700",
    payment_method_cancelled: "bg-red-100 text-red-700",
    init_error: "bg-red-100 text-red-700",
  };
  return (
    <span className={`badge ${colors[status] ?? "bg-gray-100 text-gray-600"}`}>
      {OBLIGATION_STATUS[status as ObligationStatus] ?? status}
    </span>
  );
}

export function TxStatusBadge({
  code,
  text,
}: {
  code: number | null | undefined;
  text?: string | null;
}) {
  if ((code === null || code === undefined) && !text) {
    return <span className="text-gray-400">—</span>;
  }
  const declineText = !!text && /סירוב|נדח|declin|fail|נכשל|בוטל/i.test(text);
  const success =
    code !== null && code !== undefined && KESHER_SUCCESS_CODES.has(code) && !declineText;
  const failed =
    declineText || (code !== null && code !== undefined && [5, 6, 7, 9, 14, 15, 16, 23].includes(code));
  const cls = success
    ? "bg-green-100 text-green-700"
    : failed
      ? "bg-red-100 text-red-700"
      : "bg-yellow-100 text-yellow-700";
  // Prefer Kesher's own wording (e.g. "סירוב") when we have it; else the code label.
  const label =
    (failed && text) ||
    (code !== null && code !== undefined ? KESHER_STATUS[code] : undefined) ||
    text ||
    `קוד ${code}`;
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 p-12 text-center">
      <span className="text-3xl">📭</span>
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  );
}

export function ConfirmButton({
  onConfirm,
  message,
  children,
  className,
}: {
  onConfirm: () => void;
  message: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      className={className}
      onClick={() => {
        if (window.confirm(message)) onConfirm();
      }}
    >
      {children}
    </button>
  );
}
