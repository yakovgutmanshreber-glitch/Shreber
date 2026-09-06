import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(1, "שם התבנית חובה"),
  subject: z.string().trim().default(""),
  html: z.string().default(""),
});

export const GET = handler(async () => {
  const templates = await prisma.emailTemplate.findMany({ orderBy: { name: "asc" } });
  return serialize(templates);
});

export const POST = handler(async (req) => {
  const data = schema.parse(await req.json());
  const template = await prisma.emailTemplate.create({ data });
  return serialize(template);
});
