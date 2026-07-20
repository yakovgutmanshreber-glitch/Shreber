import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { settingsSchema } from "@/lib/schemas";
import { getKesherConfigStatus } from "@/lib/kesher/client";

export const GET = handler(async () => {
  const status = await getKesherConfigStatus();
  return serialize(status);
}, { admin: true });

export const PATCH = handler(async (req) => {
  const body = await req.json();
  const data = settingsSchema.parse(body);
  const existing = await prisma.kesherSettings.findFirst();
  const settings = existing
    ? await prisma.kesherSettings.update({ where: { id: existing.id }, data })
    : await prisma.kesherSettings.create({ data });
  return serialize(settings);
}, { admin: true });
