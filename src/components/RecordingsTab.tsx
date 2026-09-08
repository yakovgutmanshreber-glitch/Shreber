"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/client";
import { EmptyState } from "@/components/ui";

interface Recording {
  id: number;
  fileName: string;
  durationSec: number;
  dateText: string;
  transcript: string | null;
}

function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// The "הקלטות" tab inside Tasks — just the recordings (date + player), no
// caller name or phone. Recordings come from the dedicated ext-6 folder.
export function RecordingsTab() {
  const [rows, setRows] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

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

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button className="btn-secondary" onClick={sync} disabled={syncing}>
          {syncing ? "מסנכרן…" : "רענון"}
        </button>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-slate-400">טוען…</div>
      ) : rows.length === 0 ? (
        <EmptyState message="אין הקלטות עדיין 🎙️" />
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="card p-3">
              <div className="flex items-center gap-4">
                <div className="w-32 shrink-0 whitespace-nowrap text-sm text-slate-500 num">{r.dateText}</div>
                <audio
                  controls
                  preload="none"
                  className="h-9 flex-1"
                  src={`/api/yemot/recordings/audio?name=${encodeURIComponent(r.fileName)}`}
                />
                <div className="w-14 shrink-0 text-left text-xs text-slate-400 num">{fmtDuration(r.durationSec)}</div>
              </div>
              {r.transcript ? (
                <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 text-sm leading-relaxed text-slate-700">
                  {r.transcript}
                </p>
              ) : (
                <p className="mt-2 text-xs text-slate-400">התמלול יופיע כאן לאחר עיבוד…</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
