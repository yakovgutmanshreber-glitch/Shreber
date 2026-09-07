import { prisma } from "@/lib/prisma";
import { handler, serialize } from "@/lib/api";
import { DEFAULT_SIMCHA_TEMPLATE } from "@/lib/email/simcha";
import { z } from "zod";

const KEY = "simcha_html";

// GET — the saved שמחות template (or the built-in default). Any signed-in user
// can read it (the compose form needs it).
export const GET = handler(async () => {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  return serialize({ html: row?.value ?? DEFAULT_SIMCHA_TEMPLATE, isDefault: !row });
});

// PUT — save the template (admin only).
export const PUT = handler(
  async (req) => {
    const { html } = z.object({ html: z.string() }).parse(await req.json());
    await prisma.appSetting.upsert({
      where: { key: KEY },
      update: { value: html },
      create: { key: KEY, value: html },
    });
    return { ok: true };
  },
  { admin: true },
);

// DELETE — reset to the built-in default (admin only).
export const DELETE = handler(
  async () => {
    await prisma.appSetting.deleteMany({ where: { key: KEY } });
    return { ok: true };
  },
  { admin: true },
);
