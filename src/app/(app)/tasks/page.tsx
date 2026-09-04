"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { Modal, PageHeader, EmptyState, ConfirmButton } from "@/components/ui";
import { TaskForm, type Task } from "@/components/TaskForm";

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
