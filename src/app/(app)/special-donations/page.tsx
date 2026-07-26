"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { Modal, EmptyState, ConfirmButton } from "@/components/ui";

interface ListOption {
  id: number;
  listKey: string;
  value: string;
}

interface ContactLite {
  id: number;
  firstName: string;
  lastName: string | null;
}
interface Gilyon {
  id: number;
  category: string;
  mainCategory: string;
}
interface Row {
  id: number;
  contactId: number;
  contact: ContactLite;
  categoryId: number;
  category: { id: number; category: string };
  occasion: string | null;
  amount: number;
  donationType: string | null;
  entryDate: string;
  note: string | null;
}

const fullName = (c: { firstName: string; lastName: string | null }) =>
  `${c.firstName}${c.lastName ? " " + c.lastName : ""}`;

export default function SpecialDonationsPage() {
  const [records, setRecords] = useState<Row[]>([]);
  const [gilyonot, setGilyonot] = useState<Gilyon[]>([]);
  const [latestGilyonId, setLatestGilyonId] = useState<number | null>(null);
  const [contacts, setContacts] = useState<ContactLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [filterGilyon, setFilterGilyon] = useState(""); // "" = all
  const [options, setOptions] = useState<ListOption[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [data, cts, opts] = await Promise.all([
      api<{ records: Row[]; gilyonot: Gilyon[]; latestGilyonId: number | null }>(
        "/api/special-donations",
      ),
      api<ContactLite[]>("/api/contacts"),
      api<ListOption[]>("/api/list-options"),
    ]);
    setRecords(data.records);
    setGilyonot(data.gilyonot);
    setLatestGilyonId(data.latestGilyonId);
    setContacts(cts);
    setOptions(opts);
    setLoading(false);
  }, []);

  const loadOptions = useCallback(async () => {
    setOptions(await api<ListOption[]>("/api/list-options"));
  }, []);

  const leregelOptions = options.filter((o) => o.listKey === "leregel").map((o) => o.value);
  const donationTypeOptions = options.filter((o) => o.listKey === "donationType").map((o) => o.value);

  useEffect(() => {
    load();
  }, [load]);

  async function remove(id: number) {
    await api(`/api/special-donations/${id}`, { method: "DELETE" });
    load();
  }

  // Group records by גליון (category), ordered by the gilyonot list (latest first).
  const byCat = new Map<number, Row[]>();
  for (const r of records) {
    if (!byCat.has(r.categoryId)) byCat.set(r.categoryId, []);
    byCat.get(r.categoryId)!.push(r);
  }
  const groups = gilyonot
    .filter((g) => byCat.has(g.id))
    .map((g) => {
      const rows = byCat.get(g.id)!;
      return { id: g.id, name: g.category, rows, total: rows.reduce((s, r) => s + Number(r.amount), 0) };
    });
  const shown = filterGilyon ? groups.filter((g) => String(g.id) === filterGilyon) : groups;
  const latestName = gilyonot.find((g) => g.id === latestGilyonId)?.category;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">תרומות מיוחדות</h1>
          <p className="text-sm text-gray-400">
            {latestName ? (
              <>
                גליון אחרון:{" "}
                <span className="font-semibold text-brand-700">{latestName}</span> — כברירת מחדל
                רשומה חדשה משויכת אליו
              </>
            ) : (
              <>אין עדיין גליונות — צור קטגוריה עם קטגוריה ראשית &quot;גליון&quot; בעמוד קטגוריות</>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {groups.length > 0 && (
            <select
              className="input max-w-[16rem]"
              value={filterGilyon}
              onChange={(e) => setFilterGilyon(e.target.value)}
            >
              <option value="">כל הגליונות</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          <button className="btn-secondary whitespace-nowrap" onClick={() => setManageOpen(true)}>
            ⚙ ניהול רשימות
          </button>
          <button
            className="btn-primary whitespace-nowrap"
            disabled={gilyonot.length === 0}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            + הוספת תרומה
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-gray-400">טוען…</div>
      ) : groups.length === 0 ? (
        <EmptyState message="אין עדיין תרומות מיוחדות. הוסף רשומה ראשונה." />
      ) : (
        <div className="space-y-4">
          {shown.map((g) => (
            <div key={g.id} className="card overflow-hidden">
              <div className="flex items-center justify-between bg-gray-50 px-4 py-3">
                <span className="font-bold text-gray-800">
                  {g.name}
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "עריכת תרומה" : "תרומה חדשה"}>
        <DonationForm
          contacts={contacts}
          gilyonot={gilyonot}
          defaultGilyonId={latestGilyonId}
          leregelOptions={leregelOptions}
          donationTypeOptions={donationTypeOptions}
          record={editing}
          onSaved={() => {
            setOpen(false);
            load();
          }}
          onCancel={() => setOpen(false)}
        />
      </Modal>

      <Modal open={manageOpen} onClose={() => setManageOpen(false)} title="ניהול רשימות" wide>
        <div className="grid gap-6 sm:grid-cols-2">
          <ListManager
            title="לרגל"
            listKey="leregel"
            items={options.filter((o) => o.listKey === "leregel")}
            onChanged={loadOptions}
          />
          <ListManager
            title="סוג"
            listKey="donationType"
            items={options.filter((o) => o.listKey === "donationType")}
            onChanged={loadOptions}
          />
        </div>
      </Modal>
    </div>
  );
}

function DonationForm({
  contacts,
  gilyonot,
  defaultGilyonId,
  leregelOptions,
  donationTypeOptions,
  record,
  onSaved,
  onCancel,
}: {
  contacts: ContactLite[];
  gilyonot: Gilyon[];
  defaultGilyonId: number | null;
  leregelOptions: string[];
  donationTypeOptions: string[];
  record: Row | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    contactId: record?.contactId ?? ("" as number | ""),
    categoryId: record?.categoryId ?? defaultGilyonId ?? ("" as number | ""),
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
    if (!form.contactId) return setError("יש לבחור איש קשר");
    if (!form.categoryId) return setError("יש לבחור גליון");
    setSaving(true);
    try {
      const body = { ...form, contactId: Number(form.contactId), categoryId: Number(form.categoryId) };
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">גליון *</label>
          <select
            className="input"
            value={form.categoryId}
            onChange={(e) => set("categoryId", e.target.value ? Number(e.target.value) : "")}
            required
          >
            <option value="">— בחר גליון —</option>
            {gilyonot.map((g) => (
              <option key={g.id} value={g.id}>
                {g.category}
              </option>
            ))}
          </select>
        </div>
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
        <div>
          <label className="label">לרגל</label>
          <select className="input" value={form.occasion} onChange={(e) => set("occasion", e.target.value)}>
            <option value="">— בחר —</option>
            {leregelOptions.map((o) => (
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
            {donationTypeOptions.map((o) => (
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

function ListManager({
  title,
  listKey,
  items,
  onChanged,
}: {
  title: string;
  listKey: string;
  items: ListOption[];
  onChanged: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    try {
      await api("/api/list-options", { method: "POST", body: { listKey, value: v } });
      setValue("");
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await api(`/api/list-options/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-gray-700">{title}</div>
      <ul className="mb-3 space-y-1">
        {items.length === 0 && <li className="text-xs text-gray-400">אין ערכים עדיין</li>}
        {items.map((o) => (
          <li
            key={o.id}
            className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5 text-sm"
          >
            <span>{o.value}</span>
            <button
              type="button"
              className="text-red-500 hover:text-red-700"
              title="הסר"
              onClick={() => remove(o.id)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="flex gap-2">
        <input
          className="input"
          placeholder="הוסף ערך…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="btn-primary whitespace-nowrap !px-3" disabled={busy}>
          + הוסף
        </button>
      </form>
    </div>
  );
}
