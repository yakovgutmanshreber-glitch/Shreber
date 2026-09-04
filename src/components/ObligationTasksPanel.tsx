"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { ConfirmButton } from "@/components/ui";
import { TaskForm, type Task, type TaskContact } from "@/components/TaskForm";

// משימות tab inside the obligation detail modal. Tasks created here are attached
// to the obligation (and its contact) and also show in the main משימות interface.
export function ObligationTasksPanel({
  obligationId,
  contact,
}: {
  obligationId: number;
  contact?: TaskContact | null;
}) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [sub, setSub] = useState<"open" | "done">("open");

  const load = useCallback(async () => {
    setLoading(true);
    setTasks(await api<Task[]>(`/api/tasks?obligationId=${obligationId}`));
    setLoading(false);
  }, [obligationId]);
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

  const showForm = adding || editing;
  const openTasks = tasks.filter((t) => !t.done);
  const doneTasks = tasks.filter((t) => t.done);
  const shown = sub === "open" ? openTasks : doneTasks;

  return (
    <div className="space-y-4">
      {/* open / done sub-tabs */}
      <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setSub("open")}
          className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            sub === "open" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          פתוחות ({openTasks.length})
        </button>
        <button
          type="button"
          onClick={() => setSub("done")}
          className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            sub === "done" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          בוצעו ({doneTasks.length})
        </button>
      </div>

      {showForm ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-3">
          <div className="mb-3 text-sm font-semibold text-gray-700">
            {editing ? "עריכת משימה" : "משימה חדשה"}
          </div>
          <TaskForm
            task={editing}
            fixedContact={contact ?? null}
            fixedObligationId={obligationId}
            onSaved={() => {
              setAdding(false);
              setEditing(null);
              load();
            }}
            onCancel={() => {
              setAdding(false);
              setEditing(null);
            }}
          />
        </div>
      ) : (
        sub === "open" && (
          <div className="flex justify-end">
            <button className="btn-primary !py-1.5 text-sm" onClick={() => setAdding(true)}>
              + משימה
            </button>
          </div>
        )
      )}

      {loading ? (
        <p className="py-4 text-center text-sm text-gray-400">טוען…</p>
      ) : shown.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">
          {sub === "open" ? "אין משימות פתוחות" : "אין משימות שבוצעו"}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((t) => (
            <li key={t.id} className="rounded-lg border border-gray-200 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => toggle(t)}
                    className="mt-1 h-4 w-4 cursor-pointer accent-brand-600"
                    title={t.done ? "בטל סימון" : "סמן כבוצע"}
                  />
                  <div>
                    <div className={`font-medium ${t.done ? "text-gray-400 line-through" : "text-gray-800"}`}>
                      {t.title}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {formatDateTime(t.dueAt)}
                      {t.done ? " · בוצע" : t.notified ? " · נשלחה תזכורת" : new Date(t.dueAt).getTime() <= Date.now() ? " · עבר הזמן" : ""}
                    </div>
                    {t.notes && <div className="mt-1 whitespace-pre-wrap text-xs text-gray-500">{t.notes}</div>}
                  </div>
                </div>
                <div className="shrink-0 text-left">
                  <button className="text-xs text-brand-600 hover:underline" onClick={() => setEditing(t)}>
                    עריכה
                  </button>
                  <ConfirmButton
                    className="mr-3 text-xs text-red-600 hover:underline"
                    message={`למחוק את המשימה "${t.title}"?`}
                    onConfirm={() => remove(t.id)}
                  >
                    מחיקה
                  </ConfirmButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
