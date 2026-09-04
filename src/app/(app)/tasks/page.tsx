"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { Modal, PageHeader, EmptyState, ConfirmButton } from "@/components/ui";

interface TaskContact {
  id: number;
  firstName: string;
  lastName: string | null;
}
interface Task {
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
function toInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function StatusBadge({ task }: { task: Task }) {
  let label = "ממתין";
  let cls = "bg-slate-100 text-slate-600";
  if (task.done) {
    label = "בוצע";
    cls = "bg-emerald-100 text-emerald-700";
  } else if (task.notified) {
    label = "נשלחה תזכורת";
    cls = "bg-indigo-100 text-indigo-700";
  } else if (new Date(task.dueAt).getTime() <= Date.now()) {
    label = "עבר הזמן";
    cls = "bg-rose-100 text-rose-700";
  }
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setTasks(await api<Task[]>("/api/tasks"));
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function toggleDone(t: Task) {
    await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { done: !t.done } });
    load();
  }
  async function remove(id: number) {
    await api(`/api/tasks/${id}`, { method: "DELETE" });
    load();
  }
  async function sendTest() {
    setTesting(true);
    setTestMsg(null);
    try {
      const r = await api<{ to: string }>("/api/mail/test", { method: "POST" });
      setTestMsg(`✅ נשלח מייל בדיקה ל-${r.to}`);
    } catch (e) {
      setTestMsg(`❌ ${e instanceof Error ? e.message : "שגיאה"}`);
    } finally {
      setTesting(false);
    }
  }

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div>
      <PageHeader
        title="משימות"
        subtitle="תזכורות שנשלחות אליך במייל בזמן שנקבע"
        action={
          <>
            <button className="btn-secondary" onClick={sendTest} disabled={testing}>
              {testing ? "שולח…" : "שלח מייל בדיקה"}
            </button>
            <button
              className="btn-primary"
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              + משימה חדשה
            </button>
          </>
        }
      />

      {testMsg && <p className="mb-4 text-sm text-slate-600">{testMsg}</p>}

      {loading ? (
        <div className="card p-8 text-center text-slate-400">טוען…</div>
      ) : tasks.length === 0 ? (
        <EmptyState message="אין משימות — צור תזכורת ראשונה 🔔" />
      ) : (
        <div className="space-y-6">
          {open.length > 0 && (
            <TaskTable
              title={`פתוחות (${open.length})`}
              tasks={open}
              onEdit={(t) => {
                setEditing(t);
                setModalOpen(true);
              }}
              onToggle={toggleDone}
              onRemove={remove}
            />
          )}
          {done.length > 0 && (
            <TaskTable
              title={`בוצעו (${done.length})`}
              tasks={done}
              muted
              onEdit={(t) => {
                setEditing(t);
                setModalOpen(true);
              }}
              onToggle={toggleDone}
              onRemove={remove}
            />
          )}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "עריכת משימה" : "משימה חדשה"}
      >
        <TaskForm
          task={editing}
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
          onCancel={() => setModalOpen(false)}
        />
      </Modal>
    </div>
  );
}

function TaskTable({
  title,
  tasks,
  muted,
  onEdit,
  onToggle,
  onRemove,
}: {
  title: string;
  tasks: Task[];
  muted?: boolean;
  onEdit: (t: Task) => void;
  onToggle: (t: Task) => void;
  onRemove: (id: number) => void;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-500">{title}</h3>
      <div className={`card overflow-x-auto ${muted ? "opacity-70" : ""}`}>
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50/60">
            <tr>
              <th className="th w-10"></th>
              <th className="th">משימה</th>
              <th className="th">מועד</th>
              <th className="th">איש קשר</th>
              <th className="th">סטטוס</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((t) => (
              <tr key={t.id} className="align-top hover:bg-slate-50">
                <td className="td">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => onToggle(t)}
                    className="h-4 w-4 cursor-pointer accent-brand-600"
                    title={t.done ? "בטל סימון" : "סמן כבוצע"}
                  />
                </td>
                <td className="td">
                  <div className={`font-medium ${t.done ? "text-slate-400 line-through" : "text-slate-800"}`}>
                    {t.title}
                  </div>
                  {t.notes && <div className="mt-0.5 whitespace-pre-wrap text-xs text-slate-500">{t.notes}</div>}
                </td>
                <td className="td num whitespace-nowrap text-slate-600">{formatDateTime(t.dueAt)}</td>
                <td className="td text-slate-500">
                  {t.contact ? `${t.contact.firstName}${t.contact.lastName ? " " + t.contact.lastName : ""}` : "—"}
                </td>
                <td className="td">
                  <StatusBadge task={t} />
                </td>
                <td className="td text-left">
                  <button className="text-sm text-brand-600 hover:underline" onClick={() => onEdit(t)}>
                    עריכה
                  </button>
                  <ConfirmButton
                    className="mr-3 text-sm text-red-600 hover:underline"
                    message={`למחוק את המשימה "${t.title}"?`}
                    onConfirm={() => onRemove(t.id)}
                  >
                    מחיקה
                  </ConfirmButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TaskForm({
  task,
  onSaved,
  onCancel,
}: {
  task: Task | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: task?.title ?? "",
    notes: task?.notes ?? "",
    dueAt: toInputValue(task ? new Date(task.dueAt) : new Date(Date.now() + 60 * 60 * 1000)),
  });
  const [contact, setContact] = useState<TaskContact | null>(task?.contact ?? null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const id = setTimeout(() => {
      api<ContactHit[]>(`/api/contacts?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setHits(r.slice(0, 6)))
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

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
          placeholder="למשל: להתקשר לספק"
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
