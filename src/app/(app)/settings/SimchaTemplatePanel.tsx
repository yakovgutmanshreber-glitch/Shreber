"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { renderSimcha } from "@/lib/email/simcha";
import { ConfirmButton } from "@/components/ui";

export function SimchaTemplatePanel() {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const r = await api<{ html: string }>("/api/settings/simcha-template");
    setHtml(r.html);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await api("/api/settings/simcha-template", { method: "PUT", body: { html } });
      setMsg("✅ נשמר");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    await api("/api/settings/simcha-template", { method: "DELETE" });
    await load();
    setMsg("שוחזר לברירת המחדל");
  }

  const preview = renderSimcha(html, { name: 'הרה"ח משה לייב ציג הי"ו', occasion: "לרגל שמחת אירוסי בתו" });

  return (
    <div className="card p-6">
      <h2 className="mb-1 text-lg font-bold">🎉 תבנית שמחות (HTML)</h2>
      <p className="mb-4 text-sm text-gray-500">
        עיצוב כרטיס ברכת מזל טוב. השתמש ב-
        <code className="mx-1 rounded bg-slate-100 px-1">{"{{name}}"}</code>
        עבור שם הנמען ו-
        <code className="mx-1 rounded bg-slate-100 px-1">{"{{occasion}}"}</code>
        עבור האירוע — הם יוחלפו אוטומטית בזמן השליחה.
      </p>

      {loading ? (
        <div className="py-6 text-center text-slate-400">טוען…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="label">HTML</label>
              <textarea
                className="input min-h-[360px] font-mono text-xs"
                dir="ltr"
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                spellCheck={false}
              />
            </div>
            <div>
              <label className="label">תצוגה מקדימה (עם ערכים לדוגמה)</label>
              <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: 360 }}>
                <div dangerouslySetInnerHTML={{ __html: preview }} />
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
            <div className="flex items-center gap-3">
              <ConfirmButton
                className="btn-secondary"
                message="לשחזר את תבנית ברירת המחדל? השינויים שלך יימחקו."
                onConfirm={reset}
              >
                שחזר ברירת מחדל
              </ConfirmButton>
              {msg && <span className="text-sm text-slate-500">{msg}</span>}
            </div>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? "שומר…" : "שמור תבנית"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
