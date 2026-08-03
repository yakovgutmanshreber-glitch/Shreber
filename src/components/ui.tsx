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
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-2 pt-4 sm:p-4 sm:pt-16"
      onClick={onClose}
    >
      <div
        className={`card w-full ${wide ? "max-w-2xl" : "max-w-lg"} p-4 sm:p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="סגור">
            ✕
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
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
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
