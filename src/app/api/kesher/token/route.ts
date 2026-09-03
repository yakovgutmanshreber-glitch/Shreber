import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { kesher, KesherConfigError } from "@/lib/kesher/client";
import { KESHER_OBLIGATION_STATUS_CODE } from "@/lib/constants";

// Kesher tokenization callback ("נתיב לקבלת טוקן"). Kesher POSTs (or GETs) the
// new card token here after the client saves a card on the token page. We save
// the card on the contact (customerRef) and, when an obligationRef is present,
// swap that hok's card to the new token.
function val(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return undefined;
}

async function process(body: Record<string, unknown>) {
  const token = val(body, "String", "Token", "token", "CardToken");
  const customerRef = val(body, "customerRef", "CustomerRef", "customer_ref");
  const obligationRef = val(body, "obligationRef", "ObligationRef", "obligation_ref", "ObligationReference");

  await prisma.webhookLog.create({
    data: { entityType: "token", payload: JSON.stringify(body), status: token ? "received" : "error" },
  });
  if (!token) return { ok: false, error: "no token" };

  const contactId = customerRef ? Number(customerRef) : null;
  const contact = contactId ? await prisma.contact.findUnique({ where: { id: contactId } }) : null;

  // Save the card (token only) on the contact.
  let savedCardId: number | null = null;
  if (contact) {
    const existing = await prisma.creditCard.findFirst({ where: { contactId: contact.id, token } });
    if (existing) savedCardId = existing.id;
    else {
      const count = await prisma.creditCard.count({ where: { contactId: contact.id } });
      const card = await prisma.creditCard.create({
        data: {
          contactId: contact.id,
          token,
          last4: val(body, "CardMumber", "CardLast4", "Last4", "last4"),
          expiry: val(body, "ExpairyDate", "ExpireDate", "Expiry", "expiry"),
          holderName: val(body, "CardName", "HolderName", "Name"),
          isDefault: count === 0,
        },
      });
      savedCardId = card.id;
    }
  }

  // Swap the hok's card (if Kesher didn't already do it via obligationRef).
  if (obligationRef) {
    const obl = await prisma.obligation.findUnique({ where: { kesherObligationReference: obligationRef } });
    if (obl) {
      try {
        const res = await kesher.changeChargeOptionForObligation({
          obligationReference: obligationRef,
          paymentMethod: "credit",
          token,
          cardExpiry: val(body, "ExpairyDate", "ExpireDate", "Expiry"),
          name: val(body, "CardName", "HolderName", "Name"),
        });
        if (!res.ok) console.error("token-callback swap failed:", res.message);
      } catch (e) {
        // Kesher may have already applied the card via obligationRef; or the
        // Bearer token isn't configured. Either way the card is saved.
        if (!(e instanceof KesherConfigError)) console.error("token-callback swap error:", e);
      }
      if (savedCardId) {
        await prisma.obligation.update({ where: { id: obl.id }, data: { creditCardId: savedCardId } });
      }
      // Reactivate a hok that was paused for a payment-method issue.
      if (["payment_method_cancelled", "bank_auth_cancelled"].includes(obl.status)) {
        await prisma.obligation
          .update({ where: { id: obl.id }, data: { status: "active" } })
          .catch(() => {});
      }
      void KESHER_OBLIGATION_STATUS_CODE; // (reserved for future status sync)
    }
  }
  return { ok: true };
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // Kesher may send form-encoded or query params.
    const { searchParams } = new URL(req.url);
    body = Object.fromEntries(searchParams.entries());
  }
  const r = await process(body);
  return NextResponse.json(r);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const r = await process(Object.fromEntries(searchParams.entries()));
  return NextResponse.json(r);
}
