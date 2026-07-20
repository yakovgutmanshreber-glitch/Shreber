"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { Modal, PageHeader, EmptyState } from "@/components/ui";
import { ContactForm } from "@/components/ContactForm";

interface ContactRow {
  id: number;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  _count: { obligations: number; transactions: number };
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async (query = "") => {
    setLoading(true);
    const data = await api<ContactRow[]>(`/api/contacts${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    setContacts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <div>
      <PageHeader
        title="אנשי קשר"
        subtitle="ניהול לקוחות ותורמים"
        action={
          <button className="btn-primary" onClick={() => setModalOpen(true)}>
            + איש קשר חדש
          </button>
        }
      />

      <div className="mb-4">
        <input
          className="input max-w-sm"
          placeholder="חיפוש לפי שם, טלפון, אימייל…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="card p-8 text-center text-gray-400">טוען…</div>
      ) : contacts.length === 0 ? (
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
              {contacts.map((c) => (
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
            load(q);
          }}
          onCancel={() => setModalOpen(false)}
        />
      </Modal>
    </div>
  );
}
