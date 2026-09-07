"use client";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { formatCurrency, formatMoney, formatDate, currencyIso } from "@/lib/format";
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
import { renderSimcha, DEFAULT_SIMCHA_TEMPLATE, SIMCHA_OCCASIONS, SIMCHA_SUBJECT } from "@/lib/email/simcha";
import {
  buildStatementTable,
  renderStatement,
  DEFAULT_STATEMENT_TEMPLATE,
  type StatementRow,
} from "@/lib/email/statement";

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
  const [emailOpen, setEmailOpen] = useState(false);
  const [simchaOpen, setSimchaOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
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

  // Currency exchange rates (ISO code -> ₪ per 1 unit), used to show the shekel
  // value of foreign amounts that don't have a stored amountIls.
  const [rates, setRates] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const data = await api<Contact>(`/api/contacts/${id}`);
    setContact(data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<{ code: string; rateToIls: number }[]>("/api/currency-rates")
      .then((rows) => {
        const m: Record<string, number> = {};
        for (const r of rows) m[r.code] = Number(r.rateToIls);
        setRates(m);
      })
      .catch(() => {});
  }, []);

  // Like formatMoney, but if a foreign amount has no stored ₪ value, convert it
  // on the fly with the current exchange rate so the shekel value still shows.
  const showMoney = (
    amount: number | string | null | undefined,
    currency = 1,
    amountIls?: number | string | null,
  ): string => {
    let ils = amountIls;
    if (currency !== 1 && (ils == null || ils === "")) {
      const rate = rates[currencyIso(currency)];
      if (rate) ils = Number(amount ?? 0) * rate;
    }
    return formatMoney(amount, currency, ils);
  };

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
    const now = new Date();
    let committed = 0;
    let debt = 0; // committed - paid, per fixed-term obligation (all still owed)
    let future = 0; // amount of payments not yet due
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
      // payments not yet due (by month) = future payments still to come
      const start = new Date(o.startDate);
      let periods = 0;
      if (start <= now) {
        periods =
          o.chargeType === "onetime"
            ? 1
            : (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) + 1;
      }
      future += Math.max(0, numPay - Math.min(periods, numPay)) * perPayment;
    }
    const collected = contact.transactions
      .filter(txPassed)
      .reduce((s, t) => s + Number(t.amountIls ?? t.amount), 0);
    const failed = contact.transactions
      .filter(txFailed)
      .reduce((s, t) => s + Number(t.amountIls ?? t.amount), 0);
    return { committed, collected, failed, debt, future };
  })();

  // Per-category payment breakdown (for the "דוח תשלומים" email).
  const statementRows = (() => {
    const byCat = new Map<string, { category: string; committed: number; paid: number }>();
    for (const o of contact.obligations) {
      if (o.status === "cancelled") continue;
      const cat = o.category?.category ?? "ללא קטגוריה";
      const amt = Number(o.amountIls ?? o.recurringAmount);
      const n = o.numPayments;
      const ongoing = o.chargeType === "recurring" && n === 9999;
      const numPay = o.chargeType === "onetime" ? 1 : n;
      const perPayment = o.chargeType === "installments" ? (n > 0 ? amt / n : amt) : amt;
      const total = ongoing ? null : o.chargeType === "installments" ? amt : perPayment * numPay;
      const paid = contact.transactions
        .filter((t) => t.obligationId === o.id && txPassed(t))
        .reduce((s, t) => s + Number(t.amountIls ?? t.amount), 0);
      const e = byCat.get(cat) ?? { category: cat, committed: 0, paid: 0 };
      e.paid += paid;
      e.committed += total ?? paid; // ongoing hoks: no fixed total → use paid
      byCat.set(cat, e);
    }
    return [...byCat.values()]
      .map((e) => ({ ...e, remaining: Math.max(0, e.committed - e.paid) }))
      .filter((e) => e.paid > 0 || e.committed > 0)
      .sort((a, b) => b.paid - a.paid);
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
          <button className="btn-secondary" onClick={() => setStatementOpen(true)}>
            📄 דוח תשלומים
          </button>
          <button className="btn-secondary" onClick={() => setSimchaOpen(true)}>
            🎉 שמחות
          </button>
          <button className="btn-secondary" onClick={() => setEmailOpen(true)}>
            ✉️ שלח מייל
          </button>
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
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <SummaryCard label="סך הכנסות (התחייבות מלאה)" value={formatCurrency(money.committed)} tone="blue" />
        <SummaryCard label="נגבה בפועל" value={formatCurrency(money.collected)} tone="green" />
        <SummaryCard label="לא עבר" value={formatCurrency(money.failed)} tone="red" />
        <SummaryCard label="חוב (יתרה לתשלום)" value={formatCurrency(money.debt)} tone="red" />
        <SummaryCard label="תשלומים עתידיים" value={formatCurrency(money.future)} tone="blue" />
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
            {oblGroups.length > 0 && (
              <button
                className="btn-secondary"
                onClick={() =>
                  setCollapsedCats((prev) =>
                    prev.size > 0 ? new Set() : new Set(oblGroups.map((g) => g.category)),
                  )
                }
              >
                {collapsedCats.size > 0 ? "פרוס הכל" : "כווץ הכל"}
              </button>
            )}
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
                    className="flex w-full items-center justify-between bg-gradient-to-b from-brand-500 to-brand-600 px-4 py-3 text-right transition-colors hover:from-brand-500 hover:to-brand-700"
                  >
                    <span className="flex items-center gap-2 font-bold text-white">
                      <span className="text-white/60">{collapsed ? "▸" : "▾"}</span>
                      {group.category}
                      <span className="text-xs font-normal text-white/60">
                        ({group.obligations.length})
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center justify-end gap-x-4 gap-y-0.5 text-sm font-normal">
                      <span className="text-emerald-200">
                        עברו: ({group.passedCount}) {formatCurrency(group.collected)}
                      </span>
                      {group.failedCount > 0 && (
                        <span className="text-rose-200">
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
                            <th className="th">אסמכתא</th>
                            <th className="th">סכום</th>
                            <th className="th">תשלומים</th>
                            <th className="th">אמצעי</th>
                            <th className="th">עברו</th>
                            <th className="th">לא עבר</th>
                            <th className="th">נשאר</th>
                            <th className="th">סטטוס</th>
                            <th className="th"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {group.obligations.map((o) => {
                            const txs = contact.transactions.filter((t) => t.obligationId === o.id);
                            const passedTxs = txs.filter(txPassed);
                            const failedTxs = txs.filter(txFailed);
                            // נשאר = full commitment (סכום × תשלומים) − מה שעבר.
                            // ריק כשמספר התשלומים ללא הגבלה (אין סכום כולל).
                            const remaining =
                              o.numPayments === 9999
                                ? null
                                : Math.max(0, Number(o.recurringAmount) * o.numPayments - sum(passedTxs));
                            return (
                              <tr
                                key={o.id}
                                className="cursor-pointer hover:bg-gray-50"
                                onClick={() => setOpenOblId(o.id)}
                              >
                                <td className="td num text-gray-500">
                                  {o.kesherObligationReference ?? <span className="text-gray-400">ידני</span>}
                                </td>
                                <td className="td">{showMoney(o.recurringAmount, o.currency, o.amountIls)}</td>
                                <td className="td">{o.numPayments === 9999 ? "ללא הגבלה" : o.numPayments}</td>
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
                                  {remaining === null ? (
                                    <span className="text-gray-300">—</span>
                                  ) : (
                                    <span className="text-amber-600">{formatCurrency(remaining, o.currency)}</span>
                                  )}
                                </td>
                                <td className="td">
                                  {o.status === "cancelled" || o.status === "paused" ? (
                                    <ObligationStatusBadge status={o.status} />
                                  ) : remaining !== null && remaining <= 0 ? (
                                    // finite obligation fully paid → finished (works for
                                    // manual entries too, which never got a Kesher event)
                                    <ObligationStatusBadge status="finished" />
                                  ) : o.paymentMethod === "cash" && remaining !== null && remaining > 0 ? (
                                    <span className="badge bg-red-100 text-red-700">חוב</span>
                                  ) : (
                                    <ObligationStatusBadge status={o.status} />
                                  )}
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
                        <td className="td">{showMoney(t.amount, t.currency, t.amountIls)}</td>
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
          fixedKind="income"
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
              onClose={() => {
                setOpenOblId(null);
                load();
              }}
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

      <Modal open={emailOpen} onClose={() => setEmailOpen(false)} title={`שליחת מייל ל${contact.firstName}`}>
        <ContactEmailForm
          contactId={contact.id}
          email={contact.email ?? ""}
          contactName={`${contact.firstName} ${contact.lastName ?? ""}`.trim()}
          debt={money.debt}
          totalPaid={money.collected}
          phone={contact.phone ?? ""}
          onDone={() => setEmailOpen(false)}
          onCancel={() => setEmailOpen(false)}
        />
      </Modal>

      <Modal open={statementOpen} onClose={() => setStatementOpen(false)} title="📄 דוח תשלומים" wide>
        <StatementForm
          contactId={contact.id}
          email={contact.email ?? ""}
          contactName={`${contact.firstName} ${contact.lastName ?? ""}`.trim()}
          rows={statementRows}
          phone={contact.phone ?? ""}
          debt={money.debt}
          onDone={() => setStatementOpen(false)}
          onCancel={() => setStatementOpen(false)}
        />
      </Modal>

      <Modal open={simchaOpen} onClose={() => setSimchaOpen(false)} title="🎉 שליחת ברכת מזל טוב" wide>
        <SimchaForm
          contactId={contact.id}
          email={contact.email ?? ""}
          defaultName={`${contact.firstName} ${contact.lastName ?? ""}`.trim()}
          totalPaid={money.collected}
          phone={contact.phone ?? ""}
          debt={money.debt}
          onDone={() => setSimchaOpen(false)}
          onCancel={() => setSimchaOpen(false)}
        />
      </Modal>
    </div>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  const tones: Record<string, { bar: string; chip: string; text: string }> = {
    green: { bar: "from-emerald-400 to-emerald-600", chip: "bg-emerald-50 text-emerald-600", text: "text-emerald-600" },
    red: { bar: "from-rose-400 to-rose-600", chip: "bg-rose-50 text-rose-600", text: "text-rose-600" },
    blue: { bar: "from-brand-400 to-brand-600", chip: "bg-brand-50 text-brand-600", text: "text-brand-600" },
    amber: { bar: "from-amber-400 to-amber-600", chip: "bg-amber-50 text-amber-600", text: "text-amber-600" },
  };
  const t = tones[tone] ?? tones.blue;
  return (
    <div className="card relative overflow-hidden p-5">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-l ${t.bar}`} />
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`num mt-2 text-2xl font-extrabold ${t.text}`}>{value}</div>
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

function ContactEmailForm({
  contactId,
  email,
  contactName,
  debt,
  totalPaid,
  phone,
  onDone,
  onCancel,
}: {
  contactId: number;
  email: string;
  contactName: string;
  debt: number;
  totalPaid: number;
  phone: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [to, setTo] = useState(email);
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [isHtml, setIsHtml] = useState(false); // true when a template (HTML) is loaded
  const [showPreview, setShowPreview] = useState(false);
  const [templates, setTemplates] = useState<
    { id: number; name: string; subject: string; html: string; slug: string | null }[]
  >([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api<{ id: number; name: string; subject: string; html: string; slug: string | null }[]>("/api/email-templates")
      .then(setTemplates)
      .catch(() => {});
  }, []);

  // Fill {{name}} / {{amount}} / {{debt}} placeholders with this contact's data.
  const fill = (s: string) =>
    s
      .replace(/\{\{\s*name\s*\}\}/g, contactName)
      .replace(/\{\{\s*(amount|debt)\s*\}\}/g, formatCurrency(debt))
      .replace(/\{\{\s*total_paid\s*\}\}/g, formatCurrency(totalPaid))
      .replace(/\{\{\s*phone\s*\}\}/g, phone)
      .replace(/\{\{\s*date\s*\}\}/g, formatDate(new Date()));

  function applyTemplate(id: string) {
    const t = templates.find((x) => String(x.id) === id);
    if (!t) return;
    setSubject(fill(t.subject));
    setContent(fill(t.html));
    setIsHtml(true);
    setShowPreview(true);
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const payload = isHtml ? { to, subject, html: content } : { to, subject, body: content };
      await api(`/api/contacts/${contactId}/email`, { method: "POST", body: payload });
      setSent(true);
      setTimeout(onDone, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחת המייל");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return <div className="py-6 text-center text-emerald-600">✅ המייל נשלח ל-{to}</div>;
  }

  return (
    <form onSubmit={send} className="space-y-4">
      {templates.length > 0 && (
        <div>
          <label className="label">תבנית</label>
          <select className="input" defaultValue="" onChange={(e) => e.target.value && applyTemplate(e.target.value)}>
            <option value="">— ללא תבנית (טקסט חופשי) —</option>
            {templates.filter((t) => !t.slug).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="label">אל</label>
        <input
          type="email"
          className="input"
          dir="ltr"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="name@example.com"
          required
        />
      </div>
      <div>
        <label className="label">נושא</label>
        <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} required />
      </div>
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="label !mb-0">{isHtml ? "תוכן (HTML)" : "תוכן ההודעה"}</label>
          {isHtml && (
            <button
              type="button"
              className="text-xs font-medium text-brand-600 hover:underline"
              onClick={() => setShowPreview((v) => !v)}
            >
              {showPreview ? "ערוך HTML" : "תצוגה מקדימה"}
            </button>
          )}
        </div>
        {isHtml && showPreview ? (
          <div className="card min-h-[140px] overflow-auto bg-white p-4">
            <div dangerouslySetInnerHTML={{ __html: content }} />
          </div>
        ) : (
          <textarea
            className={`input min-h-[140px] ${isHtml ? "font-mono text-xs" : ""}`}
            dir={isHtml ? "ltr" : "rtl"}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          ביטול
        </button>
        <button
          type="submit"
          className="btn-primary"
          disabled={sending || !to.trim() || !subject.trim() || !content.trim()}
        >
          {sending ? "שולח…" : "✉️ שלח מייל"}
        </button>
      </div>
    </form>
  );
}

function SimchaForm({
  contactId,
  email,
  defaultName,
  totalPaid,
  phone,
  debt,
  onDone,
  onCancel,
}: {
  contactId: number;
  email: string;
  defaultName: string;
  totalPaid: number;
  phone: string;
  debt: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [to, setTo] = useState(email);
  const [name, setName] = useState(defaultName);
  const [occasionSel, setOccasionSel] = useState(SIMCHA_OCCASIONS[0]);
  const [customOccasion, setCustomOccasion] = useState("");
  const [mode, setMode] = useState<"fields" | "html">("fields"); // edit via fields or raw HTML
  const [editedHtml, setEditedHtml] = useState("");
  const [template, setTemplate] = useState(DEFAULT_SIMCHA_TEMPLATE); // editable in תבניות מייל
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api<{ html: string; slug: string | null }[]>("/api/email-templates")
      .then((rows) => {
        const t = rows.find((x) => x.slug === "simcha");
        if (t?.html) setTemplate(t.html);
      })
      .catch(() => {});
  }, []);

  const occasion = occasionSel === "__custom__" ? customOccasion : occasionSel;
  const generatedHtml = renderSimcha(template, {
    name: name || "—",
    occasion: occasion || "—",
    date: formatDate(new Date()),
    totalPaid: formatCurrency(totalPaid),
    phone,
    debt: formatCurrency(debt),
  });
  const html = mode === "html" ? editedHtml : generatedHtml;

  async function send() {
    setError(null);
    setSending(true);
    try {
      await api(`/api/contacts/${contactId}/email`, {
        method: "POST",
        body: { to, subject: SIMCHA_SUBJECT, html },
      });
      setSent(true);
      setTimeout(onDone, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחת המייל");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return <div className="py-6 text-center text-emerald-600">✅ הברכה נשלחה ל-{to}</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Form */}
      <div className="space-y-4">
        <div>
          <label className="label">אל</label>
          <input
            type="email"
            className="input"
            dir="ltr"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="name@example.com"
          />
        </div>
        <div className="flex justify-end">
          {mode === "fields" ? (
            <button
              type="button"
              className="text-xs font-medium text-brand-600 hover:underline"
              onClick={() => {
                setEditedHtml(generatedHtml);
                setMode("html");
              }}
            >
              ✎ ערוך HTML
            </button>
          ) : (
            <button
              type="button"
              className="text-xs font-medium text-brand-600 hover:underline"
              onClick={() => setMode("fields")}
            >
              ← חזרה לשדות
            </button>
          )}
        </div>

        {mode === "fields" ? (
          <>
            <div>
              <label className="label">שם הנמען (כפי שיופיע בברכה)</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder='הרה"ח … הי"ו' />
            </div>
            <div>
              <label className="label">האירוע</label>
              <select className="input" value={occasionSel} onChange={(e) => setOccasionSel(e.target.value)}>
                {SIMCHA_OCCASIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
                <option value="__custom__">אחר (טקסט חופשי)…</option>
              </select>
              {occasionSel === "__custom__" && (
                <input
                  className="input mt-2"
                  value={customOccasion}
                  onChange={(e) => setCustomOccasion(e.target.value)}
                  placeholder="לרגל שמחת…"
                />
              )}
              <p className="mt-1 text-xs text-slate-400">"בשעה טובה ומוצלחת" יתווסף אוטומטית בשורה שנייה.</p>
            </div>
          </>
        ) : (
          <div>
            <label className="label">HTML</label>
            <textarea
              className="input min-h-[320px] font-mono text-xs"
              dir="ltr"
              value={editedHtml}
              onChange={(e) => setEditedHtml(e.target.value)}
              spellCheck={false}
            />
            <p className="mt-1 text-xs text-slate-400">עריכה ידנית של ה-HTML. "חזרה לשדות" תשחזר מהשדות.</p>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            ביטול
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={send}
            disabled={
              sending ||
              !to.trim() ||
              (mode === "fields" ? !name.trim() || !occasion.trim() : !editedHtml.trim())
            }
          >
            {sending ? "שולח…" : "🎉 שלח ברכה"}
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div>
        <label className="label">תצוגה מקדימה</label>
        <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: "60vh" }}>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}

function StatementForm({
  contactId,
  email,
  contactName,
  rows,
  phone,
  debt,
  onDone,
  onCancel,
}: {
  contactId: number;
  email: string;
  contactName: string;
  rows: StatementRow[];
  phone: string;
  debt: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [to, setTo] = useState(email);
  const [template, setTemplate] = useState(DEFAULT_STATEMENT_TEMPLATE); // editable in תבניות מייל
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api<{ html: string; slug: string | null }[]>("/api/email-templates")
      .then((tmpls) => {
        const t = tmpls.find((x) => x.slug === "statement");
        if (t?.html) setTemplate(t.html);
      })
      .catch(() => {});
  }, []);

  const tableHtml = buildStatementTable(rows, (n) => formatCurrency(n));
  const html = renderStatement(template, {
    name: contactName,
    tableHtml,
    date: formatDate(new Date()),
    totalPaid: formatCurrency(rows.reduce((s, r) => s + r.paid, 0)),
    phone,
    debt: formatCurrency(debt),
  });

  async function send() {
    setError(null);
    setSending(true);
    try {
      await api(`/api/contacts/${contactId}/email`, {
        method: "POST",
        body: { to, subject: "דוח תשלומים", html },
      });
      setSent(true);
      setTimeout(onDone, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחת המייל");
    } finally {
      setSending(false);
    }
  }

  if (sent) return <div className="py-6 text-center text-emerald-600">✅ הדוח נשלח ל-{to}</div>;
  if (rows.length === 0)
    return <div className="py-6 text-center text-slate-400">אין נתוני תשלומים להצגה לאיש קשר זה.</div>;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div>
          <label className="label">אל</label>
          <input
            type="email"
            className="input"
            dir="ltr"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="name@example.com"
          />
        </div>
        <p className="text-sm text-slate-500">
          הדוח מרכז את התשלומים של איש הקשר לפי קטגוריה (שולם / התחייבות / נשאר), ונשלח כמייל מעוצב.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            ביטול
          </button>
          <button type="button" className="btn-primary" onClick={send} disabled={sending || !to.trim()}>
            {sending ? "שולח…" : "📄 שלח דוח"}
          </button>
        </div>
      </div>
      <div>
        <label className="label">תצוגה מקדימה</label>
        <div className="overflow-auto rounded-xl border border-slate-200" style={{ maxHeight: "60vh" }}>
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}
