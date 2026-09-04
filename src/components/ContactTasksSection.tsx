"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { Modal, ConfirmButton } from "@/components/ui";
import { TaskForm, type Task, type TaskContact } from "@/components/TaskForm";

// A "משימות" card for a single contact's page. Tasks created here are linked to
// the contact and also appear in the main משימות interface.
export function ContactTasksSection({ contact }: { contact: TaskContact }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setTasks(await api<Task[]>(`/api/tasks?contactId=${contact.id}`));
    setLoading(false);
  }, [contact.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(t: Task) {
    await api(`/api/tasks/${t.id}`, { method: "PATCH", body: { done: !t.done } });
    load();
  }
  async function remove(id: number) {
    await api(`/api/tasks/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <span className="font-semibold text-slate-700">משימות</span>
        <button
          className="btn-primary !py-1.5 text-xs"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          + משימה
        </button>
      </div>

      {loading ? (
        <div className="p-6 text-center text-sm text-slate-400">טוען…</div>
      ) : tasks.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-400">אין משימות לאיש קשר זה</div>
      ) : (
        <table className="w-full">
          <tbody className="divide-y divide-slate-100">
            {tasks.map((t) => (
              <tr key={t.id} className="align-top hover:bg-slate-50">
                <td className="td w-8">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => toggle(t)}
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
                <td className="td">
                  {t.done ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">בוצע</span>
                  ) : t.notified ? (
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">נשלחה תזכורת</span>
                  ) : new Date(t.dueAt).getTime() <= Date.now() ? (
                    <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">עבר הזמן</span>
                  ) : (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">ממתין</span>
                  )}
                </td>
                <td className="td text-left">
                  <button
                    className="text-sm text-brand-600 hover:underline"
                    onClick={() => {
                      setEditing(t);
                      setOpen(true);
                    }}
                  >
                    עריכה
                  </button>
                  <ConfirmButton
                    className="mr-3 text-sm text-red-600 hover:underline"
                    message={`למחוק את המשימה "${t.title}"?`}
                    onConfirm={() => remove(t.id)}
                  >
                    מחיקה
                  </ConfirmButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "עריכת משימה" : "משימה חדשה"}>
        <TaskForm
          task={editing}
          fixedContact={contact}
          onSaved={() => {
            setOpen(false);
            load();
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>
    </div>
  );
}
