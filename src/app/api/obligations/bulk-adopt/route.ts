import * as XLSX from "xlsx";
import { handler, serialize, ApiError } from "@/lib/api";
import { bulkAdoptByPhone, bulkAdoptByCategory } from "@/lib/kesher/sync";

// Pick a column value by matching the header against keyword lists.
function findKey(keys: string[], includes: string[]): string | undefined {
  return keys.find((k) => includes.some((w) => k.toLowerCase().includes(w.toLowerCase())));
}

// POST /api/obligations/bulk-adopt  { fileBase64 }
// Parse a Kesher Excel (phone + אסמכתא columns), match each phone to a contact,
// and import that reference's obligation + all its transactions.
export const POST = handler(
  async (req) => {
    const { fileBase64, standalone } = (await req.json()) as {
      fileBase64?: string;
      standalone?: boolean;
    };
    if (!fileBase64) throw new ApiError("לא התקבל קובץ", 400);

    const b64 = fileBase64.includes(",") ? fileBase64.split(",").pop()! : fileBase64;
    const buf = Buffer.from(b64, "base64");
    let json: Record<string, unknown>[];
    try {
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    } catch {
      throw new ApiError("קריאת קובץ האקסל נכשלה", 400);
    }
    if (json.length === 0) throw new ApiError("הקובץ ריק", 400);

    const keys = Object.keys(json[0]);

    // Standalone mode (income tab): אסמכתא + קטגוריה columns, no phone/contact.
    if (standalone) {
      const refKey = findKey(keys, ["אסמכתא", "reference", "ref", "מספר הוראה", "הוראה"]) ?? keys[0];
      // "קטגור" / "קטוגר" cover both the correct spelling and the common typo.
      const catKey =
        findKey(keys, ["קטגור", "קטוגר", "קטגוריה", "category", "cat"]) ??
        keys.find((k) => k !== refKey) ??
        keys[1];
      const rows = json
        .map((r) => ({
          reference: String(r[refKey] ?? "").trim(),
          category: String(r[catKey] ?? "").trim(),
        }))
        .filter((r) => r.reference);
      if (rows.length === 0) {
        throw new ApiError(`לא זוהתה עמודת אסמכתא. עמודות שנמצאו: ${keys.join(", ")}`, 400);
      }
      const result = await bulkAdoptByCategory(rows);
      return serialize({ ...result, columns: { reference: refKey, category: catKey } });
    }

    const phoneKey =
      findKey(keys, ["טלפון", "פלאפון", "נייד", "phone", "tel", "mobile"]) ?? keys[0];
    const refKey =
      findKey(keys, ["אסמכתא", "reference", "ref", "מספר הוראה", "הוראה"]) ?? keys[1];
    // Optional category column ("קטגור"/"קטוגר" cover the spelling + the typo).
    const catKey = findKey(keys, ["קטגור", "קטוגר", "category", "cat"]);

    const rows = json
      .map((r) => ({
        phone: String(r[phoneKey] ?? "").trim(),
        reference: String(r[refKey] ?? "").trim(),
        category: catKey ? String(r[catKey] ?? "").trim() : undefined,
      }))
      .filter((r) => r.phone && r.reference);

    if (rows.length === 0) {
      throw new ApiError(
        `לא זוהו עמודות טלפון/אסמכתא. עמודות שנמצאו: ${keys.join(", ")}`,
        400,
      );
    }

    const result = await bulkAdoptByPhone(rows);
    return serialize({ ...result, columns: { phone: phoneKey, reference: refKey, category: catKey } });
  },
  { admin: false },
);

export const maxDuration = 60; // Kesher multi-year fetch can be slow
