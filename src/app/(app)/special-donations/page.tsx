"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { LEREGEL_OPTIONS, DONATION_TYPE_OPTIONS } from "@/lib/constants";
import { Modal, EmptyState, ConfirmButton } from "@/components/ui";

interface ContactLite {
  id: number;
  firstName: string;
  lastName: string | null;
}
interface Row {
  id: number;
  contactId: number;
  contact: ContactLite;
  parsha: string;
  parshaDate: string;
  occasion: string | null;
  amount: number;
  donationType: string | null;
  entryDate: string;
  note: string | null;
}

const fullName = (c: { firstName: string; lastName: string | null }) =>
  `${c.firstName}${c.lastName ? " " + c.lastName : ""}`;

export default function SpecialDonationsPage() {
  const [current, setCurrent] = useState<string>("");
  const [records, setRecords] = useState<Row[]>([]);
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [data, cts] = await Promise.all([
      api<{ currentParsha: string; records: Row[] }>("/api/special-donations"),
      api<ContactLite[]>("/api/contacts"),
    ]);
    setCurrent(data.currentParsha);
    setRecords(data.records);
    setContacts(cts);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: number) {
    await api(`/api/special-donations/${id}`, { method: "DELETE" });
    load();
  }

  // Group records by parsha week (records arrive newest-week first).
  const groups: { key: string; parsha: string; rows: Row[]; total: number }[] = [];
  const byKey = new Map<string, Row[]>();
  for (const r of records) {
    const key = r.parshaDate.slice(0, 10);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }
  for (const [key, rows] of byKey) {
    groups.push({
      key,
      parsha: rows[0].parsha,
      rows,
      total: rows.reduce((s, r) => s + Number(r.amount), 0),
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">תרומות מיוחדות</h1>
          <p className="text-sm text-gray-400">
            השבוע: <span className="font-semibold text-brand-700">פרשת {current}</span> — כל רשומה
            משויכת לשבוע הנוכחי ומקושרת לאיש קשר
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          + הוספת תרומה
        </button>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-gray-400">טוען…</div>
      ) : groups.length === 0 ? (
        <EmptyState message="אין עדיין תרומות מיוחדות. הוסף רשומה ראשונה לשבוע זה." />
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.key} className="card overflow-hidden">
              <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
                <span className="font-bold text-gray-800">
                  פרשת {g.parsha}
                  <span className="mr-2 text-xs font-normal text-gray-400">({g.rows.length})</span>
                </span>
                <span className="text-sm text-gray-500">
                  סך הכל: <b className="text-gray-700">{formatCurrency(g.total)}</b>
                </span>
              </div>
              <div className="overflow-x-auto border-t border-gray-200">
                <table className="w-full">
                  <thead className="border-b border-gray-200">
                    <tr>
                      <th className="th">איש קשר</th>
                      <th className="th">לרגל</th>
                      <th className="th">סוג</th>
                      <th className="th">סכום</th>
                      <th className="th">תאריך</th>
                      <th className="th">הערה</th>
                      <th className="th"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {g.rows.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="td font-medium">{fullName(r.contact)}</td>
                        <td className="td">{r.occasion ?? "—"}</td>
                        <td className="td">{r.donationType ?? "—"}</td>
                        <td className="td">{formatCurrency(r.amount)}</td>
                        <td className="td">{formatDate(r.entryDate)}</td>
                        <td className="td text-gray-500">{r.note ?? "—"}</td>
                        <td className="td text-left">
                          <div className="flex justify-end gap-3">
                            <button
                              className="text-sm text-brand-600 hover:underline"
                              onClick={() => {
                                setEditing(r);
                                setOpen(true);
                              }}
                            >
                              עריכה
                            </button>
                            <ConfirmButton
                              className="text-sm text-red-600 hover:underline"
                              message="למחוק תרומה זו?"
                              onConfirm={() => remove(r.id)}
                            >
                              מחיקה
                            </ConfirmButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "עריכת תרומה" : `תרומה חדשה — פרשת ${current}`}
      >
        <DonationForm
          contacts={contacts}
          record={editing}
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

function DonationForm({
  contacts,
  record,
  onSaved,
  onCancel,
}: {
  contacts: ContactLite[];
  record: Row | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    contactId: record?.contactId ?? ("" as number | ""),
    occasion: record?.occasion ?? "",
    amount: record?.amount ?? 0,
    donationType: record?.donationType ?? "",
    entryDate: (record?.entryDate ?? new Date().toISOString()).slice(0, 10),
    note: record?.note ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.contactId) {
      setError("יש לבחור איש קשר");
      return;
    }
    setSaving(true);
    try {
      const body = { ...form, contactId: Number(form.contactId) };
      if (record) await api(`/api/special-donations/${record.id}`, { method: "PATCH", body });
      else await api("/api/special-donations", { method: "POST", body });
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
        <label className="label">איש קשר *</label>
        <select
          className="input"
          value={form.contactId}
          onChange={(e) => set("contactId", e.target.value ? Number(e.target.value) : "")}
          required
        >
          <option value="">— בחר איש קשר —</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>
              {fullName(c)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">לרגל</label>
          <select className="input" value={form.occasion} onChange={(e) => set("occasion", e.target.value)}>
            <option value="">— בחר —</option>
            {LEREGEL_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">סוג</label>
          <select
            className="input"
            value={form.donationType}
            onChange={(e) => set("donationType", e.target.value)}
          >
            <option value="">— בחר —</option>
            {DONATION_TYPE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">סכום (₪)</label>
          <input
            type="number"
            step="0.01"
            className="input"
            value={form.amount}
            onChange={(e) => set("amount", Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">תאריך</label>
          <input
            type="date"
            className="input"
            value={form.entryDate}
            onChange={(e) => set("entryDate", e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="label">הערה</label>
        <textarea
          className="input"
          rows={2}
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
        />
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          ביטול
        </button>
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? "שומר…" : record ? "עדכון" : "הוספה"}
        </button>
      </div>
    </form>
  );
}
