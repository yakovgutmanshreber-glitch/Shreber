import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Ensure the caller is authenticated; throws ApiError(401) otherwise. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) throw new ApiError("לא מחובר", 401);
  return session.user;
}

/** Ensure the caller is an admin; throws ApiError(403) otherwise. */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new ApiError("נדרשת הרשאת מנהל", 403);
  return user;
}

/** Wrap a route handler with auth + uniform error handling. */
export function handler(
  fn: (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<unknown>,
  opts: { admin?: boolean } = {},
) {
  return async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    try {
      if (opts.admin) await requireAdmin();
      else await requireUser();
      const result = await fn(req, ctx);
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error("API error:", err);
      const message = err instanceof Error ? err.message : "שגיאה בשרת";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

/** Convert Prisma Decimal / Date fields to JSON-friendly primitives recursively. */
export function serialize<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => {
      if (v && typeof v === "object" && "toNumber" in v && typeof v.toNumber === "function") {
        return (v as { toNumber: () => number }).toNumber();
      }
      return v;
    }),
  );
}
