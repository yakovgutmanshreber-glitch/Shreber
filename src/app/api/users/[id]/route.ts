import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError, requireAdmin } from "@/lib/api";
import { userUpdateSchema } from "@/lib/schemas";

export const PATCH = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  const data = userUpdateSchema.parse(await req.json());
  const update: Record<string, unknown> = {};
  if (data.displayName !== undefined) update.displayName = data.displayName;
  if (data.role !== undefined) update.role = data.role;
  if (data.password) update.passwordHash = await bcrypt.hash(data.password, 10);
  const user = await prisma.user.update({
    where: { id },
    data: update,
    select: { id: true, email: true, displayName: true, role: true },
  });
  return serialize(user);
}, { admin: true });

export const DELETE = handler(async (_req, ctx) => {
  const me = await requireAdmin();
  const { id } = await ctx.params;
  if (id === me.id) throw new ApiError("לא ניתן למחוק את המשתמש שלך", 400);
  await prisma.user.delete({ where: { id } });
  return { ok: true };
}, { admin: true });
