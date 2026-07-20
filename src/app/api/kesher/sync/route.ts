import { handler } from "@/lib/api";
import { importTransactions } from "@/lib/kesher/sync";
import { z } from "zod";

const schema = z.object({
  fromDate: z.string().min(4),
  toDate: z.string().min(4),
  createContacts: z.boolean().optional(),
  createObligations: z.boolean().optional(),
});

// POST /api/kesher/sync — pull transactions from Kesher into the DB (admin).
export const POST = handler(async (req) => {
  const body = await req.json();
  const { fromDate, toDate, createContacts, createObligations } = schema.parse(body);
  const result = await importTransactions(fromDate, toDate, { createContacts, createObligations });
  return result;
}, { admin: true });
