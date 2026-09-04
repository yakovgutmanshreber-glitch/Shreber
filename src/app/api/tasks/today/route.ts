import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";

// GET /api/tasks/today — open (not done) tasks whose due date is TODAY in
// Israel time. Used for the "today's tasks" popup on page load.
export const GET = handler(async () => {
  // Compute today's start/end in Asia/Jerusalem, expressed as UTC instants.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()); // e.g. "2026-09-04"
  // Israel is UTC+2 (winter) / +3 (summer). Build the day bounds via the tz offset.
  const startLocal = new Date(`${parts}T00:00:00`);
  const offsetMs = tzOffsetMs("Asia/Jerusalem", startLocal);
  const start = new Date(startLocal.getTime() - offsetMs);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  const tasks = await prisma.task.findMany({
    where: { done: false, dueAt: { gte: start, lt: end } },
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { dueAt: "asc" },
  });
  return serialize(tasks);
});

/** Milliseconds a timezone is ahead of UTC at a given instant. */
function tzOffsetMs(timeZone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p = Object.fromEntries(dtf.formatToParts(at).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - at.getTime();
}
