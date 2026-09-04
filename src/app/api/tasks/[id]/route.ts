import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { taskUpdateSchema } from "@/lib/schemas";
import { Prisma } from "@prisma/client";

// PATCH /api/tasks/[id] — edit a task or toggle done. Changing the due date (or
// re-opening a done task) re-arms the reminder so it can fire again.
export const PATCH = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  const existing = await prisma.task.findUnique({ where: { id: Number(id) } });
  if (!existing) throw new ApiError("משימה לא נמצאה", 404);

  const patch = taskUpdateSchema.parse(await req.json());
  const data: Prisma.TaskUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.contactId !== undefined)
    data.contact = patch.contactId ? { connect: { id: patch.contactId } } : { disconnect: true };
  if (patch.done !== undefined) data.done = patch.done;

  // Re-arm the reminder when the due time moves, or the task is re-opened.
  const dueChanged = patch.dueAt !== undefined && patch.dueAt.getTime() !== existing.dueAt.getTime();
  if (patch.dueAt !== undefined) data.dueAt = patch.dueAt;
  if (dueChanged || patch.done === false) {
    data.notified = false;
    data.notifiedAt = null;
  }

  const task = await prisma.task.update({ where: { id: existing.id }, data });
  return serialize(task);
});

// DELETE /api/tasks/[id]
export const DELETE = handler(async (req, ctx) => {
  const { id } = await ctx.params;
  await prisma.task.delete({ where: { id: Number(id) } });
  return { ok: true };
});
