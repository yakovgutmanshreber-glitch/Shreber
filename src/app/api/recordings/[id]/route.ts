import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  handled: z.boolean().optional(),
  note: z.string().nullish(),
  contactId: z.number().int().nullable().optional(),
});

// PATCH /api/recordings/[id] — mark handled, add a note, or (re)link a contact.
export const PATCH = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  const data = schema.parse(await req.json());
  const rec = await prisma.callRecording.update({ where: { id: Number(id) }, data });
  return serialize(rec);
});
