"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { PAYMENT_METHOD, statusLabel } from "@/lib/constants";
import {
  Modal,
  ObligationStatusBadge,
  TxStatusBadge,
  ConfirmButton,
  EmptyState,
} from "@/components/ui";
import { ContactForm, type ContactData } from "@/components/ContactForm";
import { ObligationForm } from "@/components/ObligationForm";
import { ObligationDetailModal } from "@/components/ObligationDetailModal";
import { CreditCardsSection, type CreditCard } from "@/components/CreditCardsSection";
import { KesherAdoptForm } from "@/components/KesherAdoptForm";

interface Obligation {
  id: number;
  kind: "income" | "expense";
  categoryId: number | null;
  recurringAmount: number;
  numPayments: number;
  chargeDay: number | null;
  status: string;
  paymentMethod: string;
  startDate: string;
  comment: string | null;
  category: { category: string } | null;
}
interface Transaction {
  id: number;
  obligationId: number | null;
  amount: number;
  currency: number;
  transactionDate: string;
  transactionType: string;
  chargeOptionType: string;
  statusCode: number | null;
  kind: string;
  source: string;
  comment: string | null;
  bank: string | null;
  branch: string | null;
  account: string | null;
  receiptDocNumber: string | null;
}
interface Contact extends ContactData {
  id: number;
  firstName: string;
  obligations: Obligation[];
  transactions: Transaction[];
  creditCards: CreditCard[];
}

export default function ContactProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [oblOpen, setOblOpen] = useState(false);
  const [cardsOpen, setCardsOpen] = useState(false);
  const [adoptOpen, setAdoptOpen] = useState(false);
  const [openOblId, setOpenOblId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await api<Contact>(`/api/contacts/${id}`);
    setContact(data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function deleteContact() {
    await api(`/api/contacts/${id}`, { method: "DELETE" });
    router.push("/contacts");
  }

  if (loading) return <div className="card p-8 text-center text-gray-400">טוען…</div>;
  if (!contact) return <EmptyState message="איש קשר לא נמצא" />;

  const income = contact.transactions
    .filter((t) => t.kind === "income")
    .reduce((s, t) => s + Number(t.amount), 0);
  const expenses = contact.transactions
    .filter((t) => t.kind === "expense")
    .reduce((s, t) => s + Number(t.amount), 0);
  const activeObl = contact.obligations.filter((o) => o.status === "active").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/contacts" className="text-sm text-brand-600 hover:underline">
            ← חזרה לאנשי קשר
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            {contact.firstName} {contact.lastName ?? ""}
          </h1>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setCardsOpen(true)}>
            💳 כרטיסי אשראי{contact.creditCards.length > 0 ? ` (${contact.creditCards.length})` : ""}
          </button>
          <button className="btn-secondary" onClick={() => setEditOpen(true)}>
            עריכה
          </button>
          <ConfirmButton
            className="btn-danger"
            message="למחוק את איש הקשר? פעולה זו אינה הפיכה."
            onConfirm={deleteContact}
          >
            מחיקה
          </ConfirmButton>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="סך הכנסות" value={formatCurrency(income)} tone="green" />
        <SummaryCard label="סך הוצאות" value={formatCurrency(expenses)} tone="red" />
        <SummaryCard label="התחייבויות פעילות" value={String(activeObl)} tone="blue" />
      </div>

      {/* Details */}
      <div className="card p-6">
        <h2 className="mb-4 text-lg font-bold">פרטי קשר</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Detail label="טלפון" value={contact.phone} />
          <Detail label="טלפון נוסף" value={contact.phone2} />
          <Detail label="אימייל" value={contact.email} />
          <Detail label="ת.ז." value={contact.tz} />
          <Detail label="עיר" value={contact.city} />
          <Detail label="כתובת" value={contact.address} />
          <Detail label="מזהה בקשר" value={contact.kesherClientRef} />
        </dl>
      </div>

      {/* Obligations + their transactions (unified) */}
      <div className="card p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">התחייבויות ועסקאות</h2>
            <p className="text-sm text-gray-400">לחיצה על התחייבות פותחת עריכה וניהול העסקאות שלה</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setAdoptOpen(true)}>
              🔗 ייבוא מקשר
            </button>
            <button className="btn-primary" onClick={() => setOblOpen(true)}>
              + התחייבות
            </button>
          </div>
        </div>
        {contact.obligations.length === 0 ? (
          <p className="text-sm text-gray-400">אין התחייבויות</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200">
                <tr>
                  <th className="th">סוג</th>
                  <th className="th">קטגוריה</th>
                  <th className="th">סכום</th>
                  <th className="th">תשלומים</th>
                  <th className="th">אמצעי</th>
                  <th className="th">עסקאות</th>
                  <th className="th">סטטוס</th>
                  <th className="th"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contact.obligations.map((o) => {
                  const txs = contact.transactions.filter((t) => t.obligationId === o.id);
                  const txTotal = txs.reduce((s, t) => s + Number(t.amount), 0);
                  return (
                    <tr
                      key={o.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => setOpenOblId(o.id)}
                    >
                      <td className="td">{o.kind === "income" ? "הכנסה" : "הוצאה"}</td>
                      <td className="td font-medium">{o.category?.category ?? "—"}</td>
                      <td className="td">{formatCurrency(o.recurringAmount)}</td>
                      <td className="td">{o.numPayments === 9999 ? "∞" : o.numPayments}</td>
                      <td className="td">{statusLabel(PAYMENT_METHOD, o.paymentMethod)}</td>
                      <td className="td">
                        {txs.length}
                        {txs.length > 0 && (
                          <span className="mr-1 text-xs text-gray-400">({formatCurrency(txTotal)})</span>
                        )}
                      </td>
                      <td className="td">
                        <ObligationStatusBadge status={o.status} />
                      </td>
                      <td className="td text-left text-brand-600">פתח ‹</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Transactions not linked to any obligation */}
        {contact.transactions.some((t) => !t.obligationId) && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold text-gray-500">עסקאות ללא התחייבות</h3>
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="th">תאריך</th>
                    <th className="th">סוג</th>
                    <th className="th">סכום</th>
                    <th className="th">מקור</th>
                    <th className="th">סטטוס</th>
                    <th className="th">הערה</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {contact.transactions
                    .filter((t) => !t.obligationId)
                    .map((t) => (
                      <tr key={t.id}>
                        <td className="td">{formatDate(t.transactionDate)}</td>
                        <td className="td">{t.kind === "income" ? "הכנסה" : "הוצאה"}</td>
                        <td className="td">{formatCurrency(t.amount, t.currency)}</td>
                        <td className="td">{t.source === "api" ? "קשר" : "ידני"}</td>
                        <td className="td">
                          <TxStatusBadge code={t.statusCode} />
                        </td>
                        <td className="td text-gray-500">{t.comment ?? "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="עריכת איש קשר" wide>
        <ContactForm
          contact={contact}
          onSaved={() => {
            setEditOpen(false);
            load();
          }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>
      <Modal open={oblOpen} onClose={() => setOblOpen(false)} title="התחייבות חדשה" wide>
        <ObligationForm
          fixedContactId={contact.id}
          contactCards={contact.creditCards}
          onSaved={() => {
            setOblOpen(false);
            load();
          }}
          onCancel={() => setOblOpen(false)}
        />
      </Modal>
      {(() => {
        const obl = contact.obligations.find((o) => o.id === openOblId);
        if (!obl) return null;
        const txs = contact.transactions.filter((t) => t.obligationId === obl.id);
        return (
          <Modal
            open={true}
            onClose={() => setOpenOblId(null)}
            title={`התחייבות · ${obl.category?.category ?? (obl.kind === "income" ? "הכנסה" : "הוצאה")}`}
            wide
          >
            <ObligationDetailModal
              obligation={obl}
              transactions={txs}
              contactId={contact.id}
              onChanged={load}
              onClose={() => setOpenOblId(null)}
            />
          </Modal>
        );
      })()}

      <Modal open={cardsOpen} onClose={() => setCardsOpen(false)} title="כרטיסי אשראי" wide>
        <CreditCardsSection contactId={contact.id} cards={contact.creditCards} onChanged={load} />
      </Modal>

      <Modal open={adoptOpen} onClose={() => setAdoptOpen(false)} title="ייבוא הוראת קבע מקשר">
        <KesherAdoptForm
          contactId={contact.id}
          onDone={() => {
            setAdoptOpen(false);
            load();
          }}
          onCancel={() => setAdoptOpen(false)}
        />
      </Modal>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  const tones: Record<string, string> = {
    green: "text-green-600",
    red: "text-red-600",
    blue: "text-brand-600",
  };
  return (
    <div className="card p-5">
      <div className="text-sm text-gray-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-gray-400">{label}</dt>
      <dd className="font-medium text-gray-800">{value || "—"}</dd>
    </div>
  );
}
