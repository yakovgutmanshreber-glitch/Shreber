// Kesher projects (פרויקטים). Kesher has no "list projects" API, so we derive the
// list from the transactions report (distinct ProjectNumber + ProjectName) and
// cache it in the KesherProject table for the obligation form's project picker.
import { prisma } from "@/lib/prisma";
import { kesher } from "./client";

function s(v: unknown): string | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  return String(v).trim();
}

/** Pull the whole company's transactions (year-by-year, parallel) and upsert the
 *  distinct projects. Returns the stored list. */
export async function refreshKesherProjects(): Promise<{ projectNumber: string; name: string }[]> {
  const now = new Date();
  const years: { from: string; to: string }[] = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) {
    years.push({
      from: `${y}-01-01T00:00:00`,
      to: y === now.getFullYear() ? now.toISOString().slice(0, 19) : `${y}-12-31T23:59:59`,
    });
  }
  const reps = await Promise.all(
    years.map((yr) =>
      kesher.getAllTransForCompany(yr.from, yr.to).catch(() => ({ ok: false as const, data: undefined })),
    ),
  );
  const byNum = new Map<string, string>();
  for (const rep of reps) {
    if (!rep.ok) continue;
    const rows =
      ((rep.data as { TransactionResponseData?: Record<string, unknown>[] })?.TransactionResponseData) ?? [];
    for (const r of rows) {
      const num = s(r.ProjectNum) ?? s(r.ProjectNumber);
      const name = s(r.ProjectName) ?? s(r.PaymentPage);
      if (num && name && !byNum.has(num)) byNum.set(num, name);
    }
  }
  // Upsert everything found (keep old ones too — no delete).
  for (const [projectNumber, name] of byNum) {
    await prisma.kesherProject.upsert({
      where: { projectNumber },
      update: { name },
      create: { projectNumber, name },
    });
  }
  return listStoredProjects();
}

export async function listStoredProjects(): Promise<{ projectNumber: string; name: string }[]> {
  const rows = await prisma.kesherProject.findMany({ orderBy: { name: "asc" } });
  return rows.map((r) => ({ projectNumber: r.projectNumber, name: r.name }));
}
