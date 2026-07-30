"use client";

import { useState } from "react";
import { api } from "@/lib/client";

export interface ListOption {
  id: number;
  listKey: string;
  value: string;
}

// Add/remove values in an editable dropdown list (e.g. לרגל / סוג / עיר / מדינה).
export function ListManager({
  title,
  listKey,
  items,
  onChanged,
}: {
  title: string;
  listKey: string;
  items: ListOption[];
  onChanged: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    try {
      await api("/api/list-options", { method: "POST", body: { listKey, value: v } });
      setValue("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await api(`/api/list-options/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-gray-700">{title}</div>
      <ul className="mb-3 space-y-1">
        {items.length === 0 && <li className="text-xs text-gray-400">אין ערכים עדיין</li>}
        {items.map((o) => (
          <li
            key={o.id}
            className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-sm"
          >
            <span>{o.value}</span>
            <button
              type="button"
              className="text-red-500 hover:text-red-700"
              title="הסר"
              onClick={() => remove(o.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <input
          className="input"
          placeholder="הוסף ערך…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="btn-primary whitespace-nowrap !px-3" disabled={busy}>
          + הוסף
        </button>
      </form>
    </div>
  );
}
