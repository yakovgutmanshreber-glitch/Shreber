import { prisma } from "@/lib/prisma";
import { handler, serialize, requireUser } from "@/lib/api";
import { taskSchema } from "@/lib/schemas";

// GET /api/tasks — all tasks (open first, then by due date).
// Optional ?contactId=<n> filters to one contact's tasks.
export const GET = handler(async (req) => {
  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get("contactId");
  const tasks = await prisma.task.findMany({
    where: contactId ? { contactId: Number(contactId) } : undefined,
    include: { contact: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: [{ done: "asc" }, { dueAt: "asc" }],
    take: 500,
  });
  return serialize(tasks);
});

// POST /api/tasks — create a reminder task.
export const POST = handler(async (req) => {
  const user = await requireUser();
  const data = taskSchema.parse(await req.json());
  const task = await prisma.task.create({
    data: {
      title: data.title,
      notes: data.notes,
      dueAt: data.dueAt,
      contactId: data.contactId ?? null,
      done: data.done ?? false,
      createdBy: user.email ?? null,
    },
  });
  return serialize(task);
});
