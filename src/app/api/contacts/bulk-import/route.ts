import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";

const normPhone = (v: unknown) =>
  String(v ?? "").replace(/\D/g, "").replace(/^972/, "").replace(/^0/, "");

// POST /api/contacts/bulk-import  { fileBase64 }
// Create NEW contacts from an Excel. Auto-detects name/phone/email/… columns.
// Skips rows with no name, and rows whose phone already exists (no duplicates).
export const POST = handler(async (req) => {
  const { fileBase64 } = (await req.json()) as { fileBase64?: string };
  if (!fileBase64) throw new ApiError("לא התקבל קובץ", 400);

  const b64 = fileBase64.includes(",") ? fileBase64.split(",").pop()! : fileBase64;
  let json: Record<string, unknown>[];
  try {
    const wb = XLSX.read(Buffer.from(b64, "base64"), { type: "buffer" });
    json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  } catch {
    throw new ApiError("קריאת קובץ האקסל נכשלה", 400);
  }
  if (json.length === 0) throw new ApiError("הקובץ ריק", 400);

  const keys = Object.keys(json[0]);
  const k = (...words: string[]) =>
    keys.find((key) => words.some((w) => key.toLowerCase().includes(w.toLowerCase())));
  const firstKey = k("שם פרטי", "first");
  const lastKey = k("שם משפחה", "משפחה", "last");
  const nameKey = firstKey ?? k("שם", "name"); // generic full-name column if no explicit first
  const phoneKey = k("טלפון", "נייד", "פלאפון", "phone", "tel", "mobile");
  const emailKey = k("אימייל", "מייל", "email", "דוא");
  const tzKey = k("ת.ז", "תעודת", "זהות", "tz");
  const addressKey = k("כתובת", "רחוב", "address");
  const cityKey = k("עיר", "ישוב", "יישוב", "city");
  const str = (r: Record<string, unknown>, key?: string) =>
    key ? String(r[key] ?? "").trim() || undefined : undefined;

  // Existing phones — to skip duplicates.
  const existing = await prisma.contact.findMany({ select: { phone: true, phone2: true } });
  const seen = new Set<string>();
  for (const c of existing) for (const p of [c.phone, c.phone2]) if (normPhone(p)) seen.add(normPhone(p));

  let created = 0;
  let dupSkipped = 0;
  let noNameSkipped = 0;

  for (const r of json) {
    let firstName = str(r, firstKey);
    let lastName = str(r, lastKey);
    if (!firstName && nameKey) {
      const full = str(r, nameKey) ?? "";
      const parts = full.split(/\s+/);
      firstName = parts.shift();
      if (!lastName && parts.length) lastName = parts.join(" ");
    }
    if (!firstName) {
      noNameSkipped++;
      continue;
    }
    const phone = str(r, phoneKey);
    const np = normPhone(phone);
    if (np && seen.has(np)) {
      dupSkipped++;
      continue;
    }
    await prisma.contact.create({
      data: {
        firstName,
        lastName,
        phone,
        email: str(r, emailKey),
        tz: str(r, tzKey),
        address: str(r, addressKey),
        city: str(r, cityKey),
      },
    });
    if (np) seen.add(np);
    created++;
  }

  return serialize({
    ok: true,
    total: json.length,
    created,
    dupSkipped,
    noNameSkipped,
    columns: { name: nameKey, lastName: lastKey, phone: phoneKey },
  });
});
