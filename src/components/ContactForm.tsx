"use client";

import { useState } from "react";
import { api } from "@/lib/client";

export interface ContactData {
  id?: number;
  firstName?: string;
  lastName?: string | null;
  phone?: string | null;
  phone2?: string | null;
  email?: string | null;
  tz?: string | null;
  address?: string | null;
  city?: string | null;
  numHouse?: string | null;
  entrance?: string | null;
  floor?: string | null;
  apartmentNumber?: string | null;
  kesherClientRef?: string | null;
}

const FIELDS: { name: keyof ContactData; label: string; type?: string }[] = [
  { name: "firstName", label: "שם פרטי *" },
  { name: "lastName", label: "שם משפחה" },
  { name: "phone", label: "טלפון" },
  { name: "phone2", label: "טלפון נוסף" },
  { name: "email", label: "אימייל", type: "email" },
  { name: "tz", label: "תעודת זהות" },
  { name: "city", label: "עיר" },
  { name: "address", label: "רחוב" },
  { name: "numHouse", label: "מס׳ בית" },
  { name: "entrance", label: "כניסה" },
  { name: "floor", label: "קומה" },
  { name: "apartmentNumber", label: "דירה" },
  { name: "kesherClientRef", label: "מזהה לקוח בקשר (ClientRef)" },
];

export function ContactForm({
  contact,
  onSaved,
  onCancel,
}: {
  contact?: ContactData;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ContactData>(contact ?? { firstName: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function update(name: keyof ContactData, value: string) {
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (contact?.id) {
        await api(`/api/contacts/${contact.id}`, { method: "PATCH", body: form });
      } else {
        await api("/api/contacts", { method: "POST", body: form });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.name}>
            <label className="label">{f.label}</label>
            <input
              className="input"
              type={f.type ?? "text"}
              value={(form[f.name] as string) ?? ""}
              onChange={(e) => update(f.name, e.target.value)}
              required={f.name === "firstName"}
            />
          </div>
        ))}
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
