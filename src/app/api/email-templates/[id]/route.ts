import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1).optional(),
  subject: z.string().trim().optional(),
  html: z.string().optional(),
});

export const PATCH = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  const data = schema.parse(await req.json());
  const template = await prisma.emailTemplate.update({ where: { id: Number(id) }, data });
  return serialize(template);
});

export const DELETE = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  await prisma.emailTemplate.delete({ where: { id: Number(id) } });
  return { ok: true };
});
