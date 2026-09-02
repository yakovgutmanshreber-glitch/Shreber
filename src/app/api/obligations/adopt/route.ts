import { handler, ApiError } from "@/lib/api";
import { adoptKesherObligation, importCardFromKesher } from "@/lib/kesher/sync";
import { z } from "zod";

const schema = z.object({
  refOrToken: z.string().trim().min(1, "יש להזין אסמכתא או טוקן"),
  contactId: z.coerce.number().int().positive().optional().nullable(),
  kind: z.enum(["income", "expense"]).optional(),
  categoryId: z.coerce.number().int().positive().optional().nullable(),
  mode: z.enum(["full", "card"]).optional(), // 'card' = import only the card token
});

// POST /api/obligations/adopt — link an obligation that already exists in
// Kesher (by אסמכתא or token): imports it + all its past transactions; future
// payments then flow in automatically via the webhook.
export const POST = handler(async (req) => {
  const body = await req.json();
  const input = schema.parse(body);

  if (input.mode === "card") {
    if (!input.contactId) throw new ApiError("נדרש איש קשר לייבוא כרטיס", 400);
    const res = await importCardFromKesher({
      refOrToken: input.refOrToken,
      contactId: input.contactId,
    });
    if (!res.ok) throw new ApiError(res.message ?? "ייבוא הכרטיס נכשל", 400);
    return res;
  }

  const result = await adoptKesherObligation(input);
  if (!result.ok) throw new ApiError(result.message ?? "הייבוא נכשל", 400);
  return result;
});
