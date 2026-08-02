"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

export interface ContactData {
  id?: number;
  firstName?: string;
  lastName?: string | null;
  phone?: string | null;
  phone2?: string | null;
  email?: string | null;
  tz?: string | null;
  country?: string | null;
  fatherName?: string | null;
  fatherInLawName?: string | null;
  address?: string | null;
  addressZip?: string | null;
  city?: string | null;
  numHouse?: string | null;
  entrance?: string | null;
  floor?: string | null;
  apartmentNumber?: string | null;
  kesherClientRef?: string | null;
}

// `list` = an editable dropdown backed by ListOption (pick or type a new value).
const FIELDS: {
  name: keyof ContactData;
  label: string;
  type?: string;
  list?: "city" | "country";
  showIf?: (form: ContactData) => boolean;
}[] = [
  { name: "firstName", label: "שם פרטי *" },
  { name: "lastName", label: "שם משפחה" },
  { name: "phone", label: "טלפון" },
  { name: "phone2", label: "טלפון נוסף" },
  { name: "email", label: "אימייל", type: "email" },
  { name: "tz", label: "תעודת זהות" },
  { name: "country", label: "מדינה", list: "country" },
  { name: "fatherName", label: "אביו" },
  { name: "fatherInLawName", label: "חותנו" },
  { name: "city", label: "עיר", list: "city" },
  {
    name: "addressZip",
    label: "כתובת ומיקוד",
    showIf: (f) => !!f.country && f.country !== "ישראל",
  },
  { name: "address", label: "רחוב" },
  { name: "numHouse", label: "מס׳ בית" },
  { name: "entrance", label: "כניסה" },
  { name: "floor", label: "קומה" },
  { name: "apartmentNumber", label: "דירה" },
  { name: "kesherClientRef", label: "מזהה לקוח בקשר (ClientRef)" },
];

interface ListOption {
  listKey: string;
  value: string;
}

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
  const [opts, setOpts] = useState<{ city: string[]; country: string[] }>({ city: [], country: [] });

  useEffect(() => {
    api<ListOption[]>("/api/list-options")
      .then((rows) =>
        setOpts({
          city: rows.filter((o) => o.listKey === "city").map((o) => o.value),
          country: rows.filter((o) => o.listKey === "country").map((o) => o.value),
        }),
      )
      .catch(() => {});
  }, []);

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
        {FIELDS.filter((f) => !f.showIf || f.showIf(form)).map((f) => (
          <div key={f.name}>
            <label className="label">{f.label}</label>
            <input
              className="input"
              type={f.type ?? "text"}
              list={f.list ? `dl-${f.list}` : undefined}
              value={(form[f.name] as string) ?? ""}
              onChange={(e) => update(f.name, e.target.value)}
              required={f.name === "firstName"}
            />
            {f.list && (
              <datalist id={`dl-${f.list}`}>
                {opts[f.list].map((o) => (
                  <option key={o} value={o} />
                ))}
              </datalist>
            )}
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
