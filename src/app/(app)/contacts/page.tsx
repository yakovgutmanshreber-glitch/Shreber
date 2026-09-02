"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Modal, PageHeader, EmptyState } from "@/components/ui";
import { ContactForm } from "@/components/ContactForm";
import { ListManager, type ListOption } from "@/components/ListManager";
import { BulkImport } from "@/components/BulkImport";

interface ContactRow {
  id: number;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
  _count: { obligations: number; transactions: number };
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkContactsOpen, setBulkContactsOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const [options, setOptions] = useState<ListOption[]>([]);
  const [cityFilter, setCityFilter] = useState("");
  const [countryFilter, setCountryFilter] = useState("");

  const loadOptions = useCallback(async () => {
    setOptions(await api<ListOption[]>("/api/list-options"));
  }, []);
  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  const load = useCallback(async (query = "") => {
    setLoading(true);
    const data = await api<ContactRow[]>(`/api/contacts${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    setContacts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Instant client-side search: first name, last name, or phone — no server
  // round-trip per keystroke. Multi-word queries match name parts in any order.
  const shown = useMemo(() => {
    const query = q.trim().toLowerCase();
    const tokens = query.split(/\s+/).filter(Boolean);
    const digits = q.replace(/\D/g, "");
    return contacts.filter((c) => {
      if (cityFilter && c.city !== cityFilter) return false;
      if (countryFilter && c.country !== countryFilter) return false;
      if (!query) return true;
      if (digits.length >= 3) {
        const phone = `${c.phone ?? ""} ${c.phone2 ?? ""}`.replace(/\D/g, "");
        if (phone.includes(digits)) return true;
      }
      const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.toLowerCase();
      return tokens.every((t) => name.includes(t));
    });
  }, [contacts, q, cityFilter, countryFilter]);

  return (
    <div>
      <PageHeader
        title="אנשי קשר"
        subtitle="ניהול לקוחות ותורמים"
        action={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setListsOpen(true)}>
              ⚙ ניהול רשימות
            </button>
            <button className="btn-secondary" onClick={() => setBulkContactsOpen(true)}>
              👥 ייבוא אנשי קשר (Excel)
            </button>
            <button className="btn-secondary" onClick={() => setBulkOpen(true)}>
              🔗 ייבוא מרוכז מקשר (Excel)
            </button>
            <button className="btn-primary" onClick={() => setModalOpen(true)}>
              + איש קשר חדש
            </button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            className="input pr-10"
            placeholder="חיפוש: שם פרטי, שם משפחה או טלפון…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        <span className="num text-xs text-slate-400">{shown.length} תוצאות</span>
        <select
          className="input max-w-[12rem]"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
        >
          <option value="">כל הערים</option>
          {options
            .filter((o) => o.listKey === "city")
            .map((o) => (
              <option key={o.id} value={o.value}>
                {o.value}
              </option>
            ))}
        </select>
        <select
          className="input max-w-[12rem]"
          value={countryFilter}
          onChange={(e) => setCountryFilter(e.target.value)}
        >
          <option value="">כל המדינות</option>
          {options
            .filter((o) => o.listKey === "country")
            .map((o) => (
              <option key={o.id} value={o.value}>
                {o.value}
              </option>
            ))}
        </select>
      </div>

      {loading ? (
        <div className="card p-8 text-center text-gray-400">טוען…</div>
      ) : shown.length === 0 ? (
        <EmptyState message="לא נמצאו אנשי קשר" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="th">שם</th>
                <th className="th">טלפון</th>
                <th className="th">אימייל</th>
                <th className="th">עיר</th>
                <th className="th">התחייבויות</th>
                <th className="th">עסקאות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="td font-medium">
                    <Link href={`/contacts/${c.id}`} className="text-brand-700 hover:underline">
                      {c.firstName} {c.lastName ?? ""}
                    </Link>
                  </td>
                  <td className="td">{c.phone ?? "—"}</td>
                  <td className="td">{c.email ?? "—"}</td>
                  <td className="td">{c.city ?? "—"}</td>
                  <td className="td">{c._count.obligations}</td>
                  <td className="td">{c._count.transactions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="איש קשר חדש" wide>
        <ContactForm
          onSaved={() => {
            setModalOpen(false);
            load();
          }}
          onCancel={() => setModalOpen(false)}
        />
      </Modal>

      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} title="ייבוא מרוכז מקשר (Excel)" wide>
        <BulkImport onDone={() => load()} />
      </Modal>

      <Modal open={bulkContactsOpen} onClose={() => setBulkContactsOpen(false)} title="ייבוא אנשי קשר (Excel)" wide>
        <ContactBulkImport onDone={() => load()} />
      </Modal>

      <Modal open={listsOpen} onClose={() => setListsOpen(false)} title="ניהול רשימות" wide>
        <div className="grid gap-6 sm:grid-cols-2">
          <ListManager
            title="עיר"
            listKey="city"
            items={options.filter((o) => o.listKey === "city")}
            onChanged={loadOptions}
          />
          <ListManager
            title="מדינה"
            listKey="country"
            items={options.filter((o) => o.listKey === "country")}
            onChanged={loadOptions}
          />
        </div>
      </Modal>
    </div>
  );
}

function ContactBulkImport({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    total: number;
    created: number;
    updated: number;
    dupSkipped: number;
    noNameSkipped: number;
  } | null>(null);

  async function run() {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(new Error("קריאת הקובץ נכשלה"));
        fr.readAsDataURL(file);
      });
      const res = await api<{ total: number; created: number; updated: number; dupSkipped: number; noNameSkipped: number }>(
        "/api/contacts/bulk-import",
        { method: "POST", body: { fileBase64 } },
      );
      setResult(res);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
        <div className="font-semibold">הייבוא הושלם ✓</div>
        <ul className="mt-1 space-y-0.5">
          <li>שורות בקובץ: {result.total}</li>
          <li>אנשי קשר חדשים נוצרו: {result.created} · אנשי קשר עודכנו: {result.updated}</li>
          <li>דילוג (ללא שם): {result.noNameSkipped}</li>
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        העלה קובץ אקסל עם אנשי קשר. המערכת מזהה אוטומטית עמודות <b>שם</b>, <b>טלפון</b>, אימייל,
        ת.ז., כתובת ועיר. שורות ללא שם ידולגו, וטלפון שכבר קיים לא ייווצר פעמיים.
      </p>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        className="input"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button className="btn-primary" onClick={run} disabled={!file || busy}>
          {busy ? "מייבא…" : "ייבא"}
        </button>
      </div>
    </div>
  );
}

