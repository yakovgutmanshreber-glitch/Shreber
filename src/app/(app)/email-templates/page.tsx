"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/client";
import { PageHeader, EmptyState, ConfirmButton } from "@/components/ui";

interface Template {
  id: number;
  name: string;
  subject: string;
  html: string;
}

const STARTER_HTML = `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1e293b">
  <h2 style="color:#4f46e5">כותרת</h2>
  <p>שלום,</p>
  <p>הטקסט שלך כאן…</p>
  <p style="margin-top:24px;color:#64748b;font-size:13px">בברכה,<br/>ההנהלה</p>
</div>`;

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setTemplates(await api<Template[]>("/api/email-templates"));
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (editing) {
    return (
      <TemplateEditor
        template={editing === "new" ? null : editing}
        onDone={() => {
          setEditing(null);
          load();
        }}
        onCancel={() => setEditing(null)}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="תבניות מייל"
        subtitle="בנה תבניות HTML ושמור אותן לשימוש חוזר בשליחת מיילים"
        action={
          <button className="btn-primary" onClick={() => setEditing("new")}>
            + תבנית חדשה
          </button>
        }
      />
      {loading ? (
        <div className="card p-8 text-center text-slate-400">טוען…</div>
      ) : templates.length === 0 ? (
        <EmptyState message="אין תבניות עדיין — צור תבנית ראשונה ✉️" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setEditing(t)}
              className="card group p-5 text-right transition-all hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div className="font-extrabold tracking-tight text-slate-800">{t.name}</div>
              <div className="mt-0.5 truncate text-sm text-slate-500">{t.subject || "ללא נושא"}</div>
              <div className="mt-3 max-h-24 overflow-hidden rounded-lg border border-slate-100 bg-white p-2 text-[11px] text-slate-400">
                <div dangerouslySetInnerHTML={{ __html: t.html }} />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({
  template,
  onDone,
  onCancel,
}: {
  template: Template | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [html, setHtml] = useState(template?.html ?? STARTER_HTML);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      if (template) {
        await api(`/api/email-templates/${template.id}`, { method: "PATCH", body: { name, subject, html } });
      } else {
        await api("/api/email-templates", { method: "POST", body: { name, subject, html } });
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!template) return;
    await api(`/api/email-templates/${template.id}`, { method: "DELETE" });
    onDone();
  }

  return (
    <div>
      <button onClick={onCancel} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
        חזרה לתבניות
      </button>
      <PageHeader title={template ? "עריכת תבנית" : "תבנית חדשה"} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <label className="label">שם התבנית</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: תזכורת תשלום" />
          </div>
          <div>
            <label className="label">נושא ברירת מחדל</label>
            <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div>
            <label className="label">HTML</label>
            <textarea
              className="input min-h-[340px] font-mono text-xs"
              dir="ltr"
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              spellCheck={false}
            />
          </div>
        </div>
        <div>
          <label className="label">תצוגה מקדימה</label>
          <div className="card min-h-[340px] overflow-auto bg-white p-4">
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        <div>
          {template && (
            <ConfirmButton className="btn-danger" message={`למחוק את התבנית "${template.name}"?`} onConfirm={remove}>
              מחיקה
            </ConfirmButton>
          )}
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={onCancel}>
            ביטול
          </button>
          <button className="btn-primary" onClick={save} disabled={saving || !name.trim()}>
            {saving ? "שומר…" : "שמירה"}
          </button>
        </div>
      </div>
    </div>
  );
}
