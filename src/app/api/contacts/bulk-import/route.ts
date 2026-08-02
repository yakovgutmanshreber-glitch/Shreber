import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { handler, serialize, ApiError } from "@/lib/api";
import { rememberOption } from "@/lib/list-options";

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
  const addressKey = k("רחוב", "כתובת בית");
  const addressZipKey = k("כתובת ומיקוד", "מיקוד", "zip", "postal", "כתובת ומקוד");
  const cityKey = k("עיר", "ישוב", "יישוב", "city");
  const countryKey = k("מדינה", "ארץ", "country");
  const fatherKey = k("אביו", "שם האב", "father");
  const fatherInLawKey = k("חותנו", "חותן", "father in law");
  const str = (r: Record<string, unknown>, key?: string) =>
    key ? String(r[key] ?? "").trim() || undefined : undefined;

  // Existing contacts by normalized phone — new phones are created, matched ones
  // get enriched (fill empty fields + set addressZip/country from the file).
  const existing = await prisma.contact.findMany({
    select: { id: true, phone: true, phone2: true, addressZip: true, country: true, city: true, email: true, tz: true, address: true, fatherName: true, fatherInLawName: true },
  });
  const byPhone = new Map<string, (typeof existing)[number]>();
  for (const c of existing) for (const p of [c.phone, c.phone2]) if (normPhone(p) && !byPhone.has(normPhone(p))) byPhone.set(normPhone(p), c);
  const seen = new Set(byPhone.keys());

  let updated = 0;
  let noNameSkipped = 0;
  const toCreate: Record<string, string | undefined>[] = [];
  const toUpdate: { id: number; data: Record<string, string> }[] = [];
  const cities = new Set<string>();
  const countries = new Set<string>();

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
    const city = str(r, cityKey);
    const country = str(r, countryKey);
    const addressZip = str(r, addressZipKey);
    if (city) cities.add(city);
    if (country) countries.add(country);

    const match = np ? byPhone.get(np) : undefined;
    if (match) {
      // Enrich: fill empty fields; addressZip/country from the file win.
      const data: Record<string, string> = {};
      if (addressZip) data.addressZip = addressZip;
      if (country) data.country = country;
      if (city && !match.city) data.city = city;
      if (str(r, emailKey) && !match.email) data.email = str(r, emailKey)!;
      if (str(r, tzKey) && !match.tz) data.tz = str(r, tzKey)!;
      if (str(r, addressKey) && !match.address) data.address = str(r, addressKey)!;
      if (str(r, fatherKey) && !match.fatherName) data.fatherName = str(r, fatherKey)!;
      if (str(r, fatherInLawKey) && !match.fatherInLawName) data.fatherInLawName = str(r, fatherInLawKey)!;
      if (Object.keys(data).length) toUpdate.push({ id: match.id, data });
      continue;
    }
    if (np && seen.has(np)) continue; // same new phone twice in the file

    toCreate.push({
      firstName,
      lastName,
      phone,
      email: str(r, emailKey),
      tz: str(r, tzKey),
      address: str(r, addressKey),
      addressZip,
      city,
      country,
      fatherName: str(r, fatherKey),
      fatherInLawName: str(r, fatherInLawKey),
    });
    if (np) seen.add(np);
  }

  // Bulk insert new; update matched ones; remember distinct city/country values.
  if (toCreate.length) await prisma.contact.createMany({ data: toCreate as never });
  for (const u of toUpdate) await prisma.contact.update({ where: { id: u.id }, data: u.data });
  for (const v of cities) await rememberOption("city", v);
  for (const v of countries) await rememberOption("country", v);
  const created = toCreate.length;
  updated = toUpdate.length;
  const dupSkipped = 0;

  return serialize({
    ok: true,
    total: json.length,
    created,
    updated,
    dupSkipped,
    noNameSkipped,
    columns: { name: nameKey, lastName: lastKey, phone: phoneKey, addressZip: addressZipKey },
  });
});

export const maxDuration = 60;
