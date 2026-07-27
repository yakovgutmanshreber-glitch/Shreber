import { prisma } from "@/lib/prisma";

/** Upsert a value into an editable dropdown list (e.g. city/country), so values
 *  typed in a form or found in an import are remembered for next time. */
export async function rememberOption(listKey: string, value?: string | null) {
  const v = value?.trim();
  if (!v) return;
  await prisma.listOption
    .upsert({ where: { listKey_value: { listKey, value: v } }, create: { listKey, value: v }, update: {} })
    .catch(() => {});
}
