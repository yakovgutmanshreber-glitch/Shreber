"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { PageHeader, EmptyState } from "@/components/ui";

interface Recording {
  id: number;
  fileName: string;
  phone: string | null;
  durationSec: number;
  recordedAt: string;
  dateText: string;
  handled: boolean;
  note: string | null;
  contactId: number | null;
  contactName: string | null;
}

function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

export default function RecordingsPage() {
  const [rows, setRows] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [note, setNote] = useState<{ id: number; value: string } | null>(null);

  const load = useCallback(async () => {
    setRows(await api<Recording[]>("/api/recordings"));
  }, []);

  const sync = useCallback(async () => {
    setSyncing(true);
    try {
      await api("/api/recordings", { method: "POST" });
      await load();
    } catch {
      /* Yemot may be unconfigured — still show whatever is in the DB. */
    } finally {
      setSyncing(false);
    }
  }, [load]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load().catch(() => {});
      setLoading(false);
      sync(); // pull anything new in the background
    })();
  }, [load, sync]);

  async function setHandled(r: Recording, handled: boolean) {
    setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, handled } : x)));
    await api(`/api/recordings/${r.id}`, { method: "PATCH", body: { handled } });
  }

  async function saveNote() {
    if (!note) return;
    const value = note.value.trim() || null;
    setRows((prev) => prev.map((x) => (x.id === note.id ? { ...x, note: value } : x)));
    const id = note.id;
    setNote(null);
    await api(`/api/recordings/${id}`, { method: "PATCH", body: { note: value } });
  }

  const shown = onlyOpen ? rows.filter((r) => !r.handled) : rows;
  const openCount = rows.filter((r) => !r.handled).length;

  return (
    <div>
      <PageHeader
        title="הקלטות"
        subtitle="הקלטות שיחות מימות המשיח, מזוהות לפי מספר המתקשר"
        action={
          <button className="btn-secondary" onClick={sync} disabled={syncing}>
            {syncing ? "מסנכרן…" : "רענון"}
          </button>
        }
      />

      <div className="mb-3 flex items-center gap-2 text-sm">
        <button
          onClick={() => setOnlyOpen(false)}
          className={`rounded-lg px-3 py-1.5 font-medium ${!onlyOpen ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          הכל ({rows.length})
        </button>
        <button
          onClick={() => setOnlyOpen(true)}
          className={`rounded-lg px-3 py-1.5 font-medium ${onlyOpen ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          לא טופלו ({openCount})
        </button>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-slate-400">טוען…</div>
      ) : shown.length === 0 ? (
        <EmptyState message={rows.length === 0 ? "אין הקלטות עדיין 🎙️" : "הכל טופל 🎉"} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50/60">
              <tr>
                <th className="th">תאריך</th>
                <th className="th">מתקשר</th>
                <th className="th">משך</th>
                <th className="th">האזנה</th>
                <th className="th">הערה</th>
                <th className="th">טופל</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((r) => (
                <tr key={r.id} className={`hover:bg-slate-50 ${r.handled ? "opacity-60" : ""}`}>
                  <td className="td num whitespace-nowrap text-slate-500">{r.dateText}</td>
                  <td className="td">
                    {r.contactId ? (
                      <Link href={`/contacts/${r.contactId}`} className="font-medium text-brand-600 hover:underline">
                        {r.contactName ?? `#${r.contactId}`}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-1.5">
                        <span className="num text-slate-600" dir="ltr">{r.phone ?? "—"}</span>
                        <span className="badge bg-amber-100 text-amber-700">לא מזוהה</span>
                      </span>
                    )}
                  </td>
                  <td className="td num text-slate-500">{fmtDuration(r.durationSec)}</td>
                  <td className="td">
                    <audio
                      controls
                      preload="none"
                      className="h-8 max-w-[220px]"
                      src={`/api/yemot/recordings/audio?name=${encodeURIComponent(r.fileName)}`}
                    />
                  </td>
                  <td className="td max-w-[220px]">
                    {note?.id === r.id ? (
                      <input
                        autoFocus
                        className="input py-1 text-sm"
                        value={note.value}
                        onChange={(e) => setNote({ id: r.id, value: e.target.value })}
                        onBlur={saveNote}
                        onKeyDown={(e) => e.key === "Enter" && saveNote()}
                      />
                    ) : (
                      <button
                        className="text-right text-sm text-slate-500 hover:text-brand-600"
                        onClick={() => setNote({ id: r.id, value: r.note ?? "" })}
                      >
                        {r.note ? <span className="text-slate-700">{r.note}</span> : <span className="text-slate-400">+ הערה</span>}
                      </button>
                    )}
                  </td>
                  <td className="td">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-brand-600"
                      checked={r.handled}
                      onChange={(e) => setHandled(r, e.target.checked)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
