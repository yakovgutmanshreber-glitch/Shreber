import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { userCreateSchema } from "@/lib/schemas";

export const GET = handler(async () => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, displayName: true, role: true, googleId: true, passwordHash: true, createdAt: true },
  });
  return serialize(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      role: u.role,
      hasPassword: Boolean(u.passwordHash),
      hasGoogle: Boolean(u.googleId),
      createdAt: u.createdAt,
    })),
  );
}, { admin: true });

export const POST = handler(async (req) => {
  const data = userCreateSchema.parse(await req.json());
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new ApiError("כתובת אימייל כבר קיימת", 400);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      displayName: data.displayName,
      role: data.role,
      passwordHash: data.password ? await bcrypt.hash(data.password, 10) : null,
    },
    select: { id: true, email: true, displayName: true, role: true },
  });
  return serialize(user);
}, { admin: true });
