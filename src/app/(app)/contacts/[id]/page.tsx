"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { formatCurrency, formatMoney, formatDate } from "@/lib/format";
import { PAYMENT_METHOD, statusLabel, KESHER_SUCCESS_CODES } from "@/lib/constants";
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
  chargeType?: "recurring" | "installments" | "onetime";
  recurringAmount: number;
  currency: number;
  amountIls: number | null;
  numPayments: number;
  chargeDay: number | null;
  status: string;
  paymentMethod: string;
  startDate: string;
  comment: string | null;
  creditCardId?: number | null;
  kesherObligationReference?: string | null;
  category: { category: string } | null;
}
interface Transaction {
  id: number;
  obligationId: number | null;
  amount: number;
  currency: number;
  amountIls: number | null;
  transactionDate: string;
  transactionType: string;
  chargeOptionType: string;
  statusCode: number | null;
  statusText: string | null;
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

// A charge "passed" (נגבה) when its Kesher status is a settled/approved code;
// it "failed" (לא עבר) on a decline (סירוב) or a known failure status.
const TX_FAILED_CODES = new Set([5, 6, 7, 9, 14, 15, 16, 23]);
function txPassed(t: Transaction): boolean {
  return t.statusCode != null && KESHER_SUCCESS_CODES.has(t.statusCode);
}
function txFailed(t: Transaction): boolean {
  if (txPassed(t)) return false;
  const st = t.statusText ?? "";
  if (/סירוב|נדח|נכשל|בוטל/.test(st) || /declin|fail/i.test(st)) return true;
  return t.statusCode != null && TX_FAILED_CODES.has(t.statusCode);
}
function sum(txs: Transaction[]): number {
  return txs.reduce((s, t) => s + Number(t.amount), 0);
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
  // Collapsed category groups in the obligations table (by category name).
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const toggleCat = (cat: string) =>
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });

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

  // Group obligations by category for the table (— => "ללא קטגוריה"), preserving
  // first-seen order. Each group carries the count + total amount for its header.
  const NO_CATEGORY = "ללא קטגוריה";
  const oblGroups = (() => {
    const map = new Map<string, Contact["obligations"]>();
    for (const o of contact.obligations) {
      const cat = o.category?.category ?? NO_CATEGORY;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(o);
    }
    return Array.from(map.entries()).map(([category, obligations]) => {
      const ids = new Set(obligations.map((o) => o.id));
      const txs = contact.transactions.filter((t) => t.obligationId != null && ids.has(t.obligationId));
      const passed = txs.filter(txPassed);
      const failed = txs.filter(txFailed);
      return {
        category,
        obligations,
        total: obligations.reduce((s, o) => s + Number(o.recurringAmount), 0),
        collected: sum(passed),
        passedCount: passed.length,
        failedTotal: sum(failed),
        failedCount: failed.length,
      };
    });
  })();

  // Financial summary across the person's (non-cancelled) obligations. Amounts
  // use the ₪ value (amountIls) when the record is in a foreign currency.
  //   חוב = full plan total − amount actually paid (all still-owed, due or not).
  const money = (() => {
    let committed = 0;
    let debt = 0; // committed - paid, per fixed-term obligation
    for (const o of contact.obligations) {
      if (o.status === "cancelled") continue;
      const amt = Number(o.amountIls ?? o.recurringAmount);
      const n = o.numPayments;
      const ongoing = o.chargeType === "recurring" && n === 9999;
      const numPay = o.chargeType === "onetime" ? 1 : n;
      const perPayment = o.chargeType === "installments" ? (n > 0 ? amt / n : amt) : amt;
      const total = ongoing ? null : o.chargeType === "installments" ? amt : perPayment * numPay;
      if (total == null) continue; // ongoing hoks have no fixed total
      const paid = contact.transactions
        .filter((t) => t.obligationId === o.id && txPassed(t))
        .reduce((s, t) => s + Number(t.amountIls ?? t.amount), 0);
      committed += total;
      debt += Math.max(0, total - paid);
    }
    const collected = contact.transactions
      .filter(txPassed)
      .reduce((s, t) => s + Number(t.amountIls ?? t.amount), 0);
    const failed = contact.transactions
      .filter(txFailed)
      .reduce((s, t) => s + Number(t.amountIls ?? t.amount), 0);
    return { committed, collected, failed, debt };
  })();

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
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard label="סך הכנסות (התחייבות מלאה)" value={formatCurrency(money.committed)} tone="blue" />
        <SummaryCard label="נגבה בפועל" value={formatCurrency(money.collected)} tone="green" />
        <SummaryCard label="לא עבר" value={formatCurrency(money.failed)} tone="red" />
        <SummaryCard label="חוב (יתרה לתשלום)" value={formatCurrency(money.debt)} tone="red" />
      </div>

      {/* Details */}
      <div className="card p-6">
        <h2 className="mb-4 text-lg font-bold">פרטי קשר</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Detail label="טלפון" value={contact.phone} />
          <Detail label="טלפון נוסף" value={contact.phone2} />
          <Detail label="אימייל" value={contact.email} />
          <Detail label="ת.ז." value={contact.tz} />
          <Detail label="מדינה" value={contact.country} />
          <Detail label="אביו" value={contact.fatherName} />
          <Detail label="חותנו" value={contact.fatherInLawName} />
          {((contact.country && contact.country !== "ישראל") || contact.addressZip) && (
            <Detail label="כתובת ומיקוד" value={contact.addressZip} />
          )}
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
          <div className="space-y-4">
            {oblGroups.map((group) => {
              const collapsed = collapsedCats.has(group.category);
              return (
                // Each category is its own card (border + shadow), fully wrapping
                // its header and rows, with a gap between cards.
                <div key={group.category} className="card overflow-hidden">
                  {/* Card header — category name, count, total, expand arrow */}
                  <button
                    type="button"
                    onClick={() => toggleCat(group.category)}
                    className="flex w-full items-center justify-between bg-gray-50 px-4 py-3 text-right hover:bg-gray-100"
                  >
                    <span className="flex items-center gap-2 font-bold text-gray-800">
                      <span className="text-gray-400">{collapsed ? "▸" : "▾"}</span>
                      {group.category}
                      <span className="text-xs font-normal text-gray-400">
                        ({group.obligations.length})
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center justify-end gap-x-4 gap-y-0.5 text-sm font-normal">
                      <span className="text-green-600">
                        עברו: ({group.passedCount}) {formatCurrency(group.collected)}
                      </span>
                      {group.failedCount > 0 && (
                        <span className="text-red-600">
                          לא עבר: ({group.failedCount}) {formatCurrency(group.failedTotal)}
                        </span>
                      )}
                    </span>
                  </button>

                  {/* Card body — the obligation rows, inside the same card */}
                  {!collapsed && (
                    <div className="overflow-x-auto border-t border-gray-200">
                      <table className="w-full">
                        <thead className="border-b border-gray-200">
                          <tr>
                            <th className="th">סוג</th>
                            <th className="th">סכום</th>
                            <th className="th">תשלומים</th>
                            <th className="th">אמצעי</th>
                            <th className="th">עברו</th>
                            <th className="th">לא עבר</th>
                            <th className="th">סטטוס</th>
                            <th className="th"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {group.obligations.map((o) => {
                            const txs = contact.transactions.filter((t) => t.obligationId === o.id);
                            const passedTxs = txs.filter(txPassed);
                            const failedTxs = txs.filter(txFailed);
                            return (
                              <tr
                                key={o.id}
                                className="cursor-pointer hover:bg-gray-50"
                                onClick={() => setOpenOblId(o.id)}
                              >
                                <td className="td">{o.kind === "income" ? "הכנסה" : "הוצאה"}</td>
                                <td className="td">{formatMoney(o.recurringAmount, o.currency, o.amountIls)}</td>
                                <td className="td">{o.numPayments === 9999 ? "∞" : o.numPayments}</td>
                                <td className="td">{statusLabel(PAYMENT_METHOD, o.paymentMethod)}</td>
                                <td className="td">
                                  {passedTxs.length > 0 ? (
                                    <span className="text-green-600">
                                      ({passedTxs.length}) {formatCurrency(sum(passedTxs))}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="td">
                                  {failedTxs.length > 0 ? (
                                    <span className="text-red-600">
                                      ({failedTxs.length}) {formatCurrency(sum(failedTxs))}
                                    </span>
                                  ) : (
                                    <span className="text-gray-300">—</span>
                                  )}
                                </td>
                                <td className="td">
                                  <ObligationStatusBadge status={o.status} />
                                </td>
                                <td className="td text-left text-brand-600">‹</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
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
                        <td className="td">{formatMoney(t.amount, t.currency, t.amountIls)}</td>
                        <td className="td">{t.source === "api" ? "קשר" : "ידני"}</td>
                        <td className="td">
                          <TxStatusBadge code={t.statusCode} text={t.statusText} />
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
              contactCards={contact.creditCards}
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
