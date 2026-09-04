"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

export interface TaskContact {
  id: number;
  firstName: string;
  lastName: string | null;
}
export interface Task {
  id: number;
  title: string;
  notes: string | null;
  dueAt: string;
  done: boolean;
  notified: boolean;
  notifiedAt: string | null;
  contactId: number | null;
  contact: TaskContact | null;
}
interface ContactHit {
  id: number;
  firstName: string;
  lastName: string | null;
  phone: string | null;
}

// A Date -> value for <input type="datetime-local"> in the browser's local time.
export function toInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function TaskForm({
  task,
  fixedContact,
  fixedObligationId,
  onSaved,
  onCancel,
}: {
  task: Task | null;
  // When set, the task is locked to this contact (e.g. on the contact page).
  fixedContact?: TaskContact | null;
  // When set, the task is attached to this obligation (from the obligation modal).
  fixedObligationId?: number | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    dueAt: toInputValue(task ? new Date(task.dueAt) : new Date(Date.now() + 60 * 60 * 1000)),
  });
  const [contact, setContact] = useState<TaskContact | null>(fixedContact ?? task?.contact ?? null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (fixedContact || !q.trim()) {
      setHits([]);
      return;
    }
    const id = setTimeout(() => {
      api<ContactHit[]>(`/api/contacts?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setHits(r.slice(0, 6)))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q, fixedContact]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body = {
        title: form.title,
        notes: form.notes || null,
        // datetime-local is local time; send an absolute instant (UTC ISO).
        dueAt: new Date(form.dueAt).toISOString(),
        contactId: contact?.id ?? null,
        ...(fixedObligationId ? { obligationId: fixedObligationId } : {}),
      };
      if (task) await api(`/api/tasks/${task.id}`, { method: "PATCH", body });
      else await api("/api/tasks", { method: "POST", body });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">כותרת *</label>
        <input
          className="input"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="למשל: להתקשר לאיש הקשר"
          required
        />
      </div>
      <div>
        <label className="label">תאריך ושעה *</label>
        <input
          type="datetime-local"
          className="input"
          value={form.dueAt}
          onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
          required
        />
        <p className="mt-1 text-xs text-slate-400">בזמן זה יישלח אליך מייל תזכורת.</p>
      </div>
      <div>
        <label className="label">הערות</label>
        <textarea
          className="input min-h-[80px]"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </div>

      {/* Contact link — hidden/locked when opened from a contact or obligation. */}
      {fixedObligationId && !fixedContact ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          משויך להתחייבות זו
        </div>
      ) : fixedContact ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          משויך ל: <b>{fixedContact.firstName}{fixedContact.lastName ? " " + fixedContact.lastName : ""}</b>
        </div>
      ) : (
        <div>
          <label className="label">איש קשר (אופציונלי)</label>
          {contact ? (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
              <span className="text-sm">
                {contact.firstName}
                {contact.lastName ? " " + contact.lastName : ""}
              </span>
              <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setContact(null)}>
                הסר
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="חפש איש קשר…"
              />
              {hits.length > 0 && (
                <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lift">
                  {hits.map((h) => (
                    <button
                      key={h.id}
                      type="button"
                      className="flex w-full items-center justify-between px-3 py-2 text-right text-sm hover:bg-slate-50"
                      onClick={() => {
                        setContact({ id: h.id, firstName: h.firstName, lastName: h.lastName });
                        setQ("");
                        setHits([]);
                      }}
                    >
                      <span>
                        {h.firstName}
                        {h.lastName ? " " + h.lastName : ""}
                      </span>
                      {h.phone && <span className="text-xs text-slate-400" dir="ltr">{h.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          ביטול
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "שומר…" : "שמירה"}
        </button>
      </div>
    </form>
  );
}
