"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function SettingsForm({
  projectNumber,
  paymentPageId,
  paymentPageUrl,
  tokenPageUrl,
}: {
  projectNumber: string;
  paymentPageId: number | null;
  paymentPageUrl: string;
  tokenPageUrl: string;
}) {
  const router = useRouter();
  const [project, setProject] = useState(projectNumber);
  const [pageId, setPageId] = useState(paymentPageId ? String(paymentPageId) : "");
  const [pageUrl, setPageUrl] = useState(paymentPageUrl);
  const [tokenUrl, setTokenUrl] = useState(tokenPageUrl);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    setSaved(false);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: {
          projectNumber: project,
          paymentPageId: pageId ? Number(pageId) : null,
          paymentPageUrl: pageUrl,
          tokenPageUrl: tokenUrl,
        },
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">מספר פרויקט בקשר</label>
        <input className="input max-w-xs" value={project} onChange={(e) => setProject(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="label">מזהה עמוד תשלום (PaymentPageId)</label>
          <input
            className="input"
            inputMode="numeric"
            placeholder="1"
            value={pageId}
            onChange={(e) => setPageId(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div>
          <label className="label">כתובת עמוד התשלום המאובטח</label>
          <input
            className="input"
            dir="ltr"
            placeholder="https://kesherhk.info/..."
            value={pageUrl}
            onChange={(e) => setPageUrl(e.target.value)}
          />
        </div>
      </div>
      <p className="text-xs text-gray-400">
        מזהה העמוד וכתובתו מתקבלים מפאנל הניהול של קשר, במקום בו מוגדר עמוד התשלום. הם נחוצים ללכידת
        כרטיסים דרך העמוד המאובטח (הטוקן חוזר אוטומטית ל-Webhook).
      </p>
      <div>
        <label className="label">כתובת עמוד יצירת טוקן (החלפת כרטיס)</label>
        <input
          className="input"
          dir="ltr"
          placeholder="https://ultra.kesherhk.info/external/paymentPage/…"
          value={tokenUrl}
          onChange={(e) => setTokenUrl(e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-400">
          כתובת דף מסוג &quot;יצירת טוקן&quot; בקשר, עם נתיב לקבלת טוקן:
          <code className="mx-1 rounded bg-gray-100 px-1" dir="ltr">
            /api/kesher/token
          </code>
          . משמש לכפתור &quot;החלף כרטיס&quot; בהתחייבות — ללא חיוב.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "שומר…" : "שמירה"}
        </button>
        {saved && <span className="text-sm text-green-600">נשמר ✓</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
