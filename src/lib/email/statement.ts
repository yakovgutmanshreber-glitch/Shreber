// "דוח תשלומים" — payment statement email. The wrapper is an editable template
// (saved in EmailTemplate, slug "statement") with {{name}} and {{table}}
// placeholders; the per-category table is generated from the contact's data.

export interface StatementRow {
  category: string;
  committed: number;
  paid: number;
  remaining: number;
}

function esc(s: string): string {
  return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
}

// Editable wrapper. {{name}} = contact name, {{table}} = the generated table.
export const DEFAULT_STATEMENT_TEMPLATE = `<div dir="rtl" style="background:#f4f6fb;padding:32px 16px;font-family:Arial,'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08);">
    <div style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:26px 32px;text-align:center;">
      <div style="color:#c7d2fe;font-size:13px;letter-spacing:1px;">דברי אלקים חיים</div>
      <div style="color:#fff;font-size:23px;font-weight:800;margin-top:6px;">דוח תשלומים</div>
    </div>
    <div style="padding:28px 32px;">
      <p style="font-size:16px;color:#1e293b;margin:0 0 18px;">לכבוד <b>{{name}}</b> שיחי׳,</p>
      <p style="font-size:14px;color:#475569;margin:0 0 18px;">להלן פירוט התשלומים לפי קטגוריה:</p>
      {{table}}
      <p style="font-size:14px;color:#475569;margin:20px 0 0;">תודה על תרומתכם ותמיכתכם.</p>
      <p style="font-size:15px;color:#1e293b;margin:16px 0 0;">בברכה,<br/><b>ההנהלה</b></p>
    </div>
    <div style="background:#f8fafc;border-top:1px solid #eef2f7;padding:14px 32px;text-align:center;color:#94a3b8;font-size:12px;">דברי אלקים חיים</div>
  </div>
</div>`;

/** Currency formatter injected by the caller (keeps this file server/client safe). */
type Fmt = (n: number) => string;

/** Build the per-category table HTML (rows + totals). */
export function buildStatementTable(rows: StatementRow[], fmt: Fmt): string {
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
  const td = "border:1px solid #e2e8f0;padding:10px 12px;";
  const body = rows
    .map(
      (r) => `<tr>
        <td style="${td}">${esc(r.category)}</td>
        <td style="${td}text-align:center;color:#059669;font-weight:700;">${fmt(r.paid)}</td>
        <td style="${td}text-align:center;color:#475569;">${fmt(r.committed)}</td>
        <td style="${td}text-align:center;color:${r.remaining > 0 ? "#dc2626" : "#94a3b8"};">${r.remaining > 0 ? fmt(r.remaining) : "✓"}</td>
      </tr>`,
    )
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">
    <thead>
      <tr style="background:#f1f5f9;">
        <th style="${td}text-align:right;">קטגוריה</th>
        <th style="${td}">שולם</th>
        <th style="${td}">התחייבות</th>
        <th style="${td}">נשאר</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
    <tfoot>
      <tr style="background:#f8fafc;font-weight:800;">
        <td style="${td}">סה"כ</td>
        <td style="${td}text-align:center;color:#059669;">${fmt(totalPaid)}</td>
        <td style="${td}"></td>
        <td style="${td}text-align:center;color:${totalRemaining > 0 ? "#dc2626" : "#94a3b8"};">${totalRemaining > 0 ? fmt(totalRemaining) : "✓"}</td>
      </tr>
    </tfoot>
  </table>`;
}

/** Fill the wrapper template's {{name}} and {{table}} placeholders. */
export function renderStatement(template: string, v: { name: string; tableHtml: string }): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/g, esc(v.name))
    .replace(/\{\{\s*table\s*\}\}/g, v.tableHtml);
}
