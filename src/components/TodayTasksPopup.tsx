"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { formatDateTime } from "@/lib/format";
import { Modal } from "@/components/ui";
import type { Task } from "@/components/TaskForm";

// Shows a popup on page load listing today's open tasks. Appears once per
// browser session per day (dismissing it remembers the day in sessionStorage).
export function TodayTasksPopup() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const todayKey = new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD (local)
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem("todayTasksSeen") === todayKey;
    } catch {
      /* private mode — treat as not dismissed */
    }
    if (dismissed) return;

    api<Task[]>("/api/tasks/today")
      .then((rows) => {
        if (rows.length > 0) {
          setTasks(rows);
          setOpen(true);
        }
      })
      .catch(() => {
        /* ignore — never block the app on this */
      });
  }, []);

  function close() {
    setOpen(false);
    try {
      sessionStorage.setItem("todayTasksSeen", new Date().toLocaleDateString("en-CA"));
    } catch {
      /* ignore */
    }
  }

  if (!open) return null;

  return (
    <Modal open={open} onClose={close} title={`משימות להיום (${tasks.length})`}>
      <div className="space-y-2">
        {tasks.map((t) => (
          <div key={t.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-slate-800">{t.title}</span>
              <span className="num shrink-0 text-sm text-slate-500">{formatDateTime(t.dueAt)}</span>
            </div>
            {t.contact && (
              <div className="mt-1 text-xs text-slate-500">
                {t.contact.firstName}
                {t.contact.lastName ? " " + t.contact.lastName : ""}
              </div>
            )}
            {t.notes && <div className="mt-1 whitespace-pre-wrap text-xs text-slate-500">{t.notes}</div>}
          </div>
        ))}
        <div className="flex justify-between pt-2">
          <Link href="/tasks" className="btn-secondary" onClick={close}>
            לכל המשימות
          </Link>
          <button className="btn-primary" onClick={close}>
            הבנתי
          </button>
        </div>
      </div>
    </Modal>
  );
}
