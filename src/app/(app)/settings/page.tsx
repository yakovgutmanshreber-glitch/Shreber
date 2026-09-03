import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getKesherConfigStatus } from "@/lib/kesher/client";
import { SettingsForm } from "./SettingsForm";
import { KesherSyncPanel } from "./KesherSyncPanel";
import { CurrencyRatesPanel } from "./CurrencyRatesPanel";

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/contacts");

  const status = await getKesherConfigStatus();
  const baseUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const webhookUrl = `${baseUrl}/api/webhooks/kesher`;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">הגדרות</h1>
        <p className="mt-1 text-sm text-gray-500">הגדרות חיבור לקשר (Kesher)</p>
      </div>

      {/* Credentials status */}
      <div className="card p-6">
        <h2 className="mb-4 text-lg font-bold">סטטוס פרטי התחברות</h2>
        <div className="space-y-3">
          <StatusRow label="מצב הפעלה" ok={!status.mock} okText="חי (Live)" badText="הדמיה (Mock)" neutral />
          <StatusRow label="KESHER_API_USERNAME" ok={status.hasUsername} />
          <StatusRow label="KESHER_API_PASSWORD" ok={status.hasPassword} />
          <StatusRow label="KESHER_API_TOKEN (נקודות קצה חדשות)" ok={status.hasToken} optional />
          <StatusRow label="מספר פרויקט (project_number)" ok={status.hasProjectNumber} />
          <StatusRow label="עמוד תשלום מאובטח (GetLinkToken)" ok={status.hasPaymentPage} optional />
        </div>
        {status.mock && (
          <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            המערכת פועלת במצב הדמיה — לא מבוצעים חיובים אמיתיים. הגדר את הסודות
            <code className="mx-1 rounded bg-amber-100 px-1">KESHER_API_USERNAME</code>ו-
            <code className="mx-1 rounded bg-amber-100 px-1">KESHER_API_PASSWORD</code>
            וקבע <code className="mx-1 rounded bg-amber-100 px-1">KESHER_MOCK=false</code> כדי לעבור למצב חי.
          </p>
        )}
      </div>

      {/* Project number + payment page form */}
      <div className="card p-6">
        <h2 className="mb-4 text-lg font-bold">הגדרות קשר</h2>
        <SettingsForm
          projectNumber={status.projectNumber}
          paymentPageId={status.paymentPageId}
          paymentPageUrl={status.paymentPageUrl}
          tokenPageUrl={status.tokenPageUrl}
        />
      </div>

      {/* Import transactions from Kesher */}
      <div className="card p-6">
        <h2 className="mb-4 text-lg font-bold">משיכת עסקאות מקשר</h2>
        <KesherSyncPanel />
      </div>

      {/* Currency exchange rates */}
      <div className="card p-6">
        <h2 className="mb-4 text-lg font-bold">שערי מטבע</h2>
        <CurrencyRatesPanel />
      </div>

      {/* Webhook URL */}
      <div className="card p-6">
        <h2 className="mb-2 text-lg font-bold">כתובת Webhook</h2>
        <p className="mb-3 text-sm text-gray-500">
          העתק כתובת זו למערכת הניהול של קשר. זהו נתיב הסנכרון הראשי — קשר שולח לכאן כל
          יצירה/עדכון של עסקה, התחייבות ולקוח.
        </p>
        <code className="block w-full overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-800">
          {webhookUrl}
        </code>
        <p className="mt-2 text-xs text-gray-400">
          אימות ה-Webhook מתבצע באמצעות סוד משותף (פרמטר <code>?secret=</code> או כותרת
          <code> X-Kesher-Secret</code>), הנקבע ב-<code>KESHER_WEBHOOK_SECRET</code>. יש לאמת מול
          תמיכת קשר את שיטת האימות הנתמכת.
        </p>
      </div>
    </div>
  );
}

function StatusRow({
  label,
  ok,
  okText = "מוגדר",
  badText = "חסר",
  optional,
  neutral,
}: {
  label: string;
  ok: boolean;
  okText?: string;
  badText?: string;
  optional?: boolean;
  neutral?: boolean;
}) {
  const color = neutral
    ? ok
      ? "bg-green-100 text-green-700"
      : "bg-amber-100 text-amber-700"
    : ok
      ? "bg-green-100 text-green-700"
      : optional
        ? "bg-gray-100 text-gray-500"
        : "bg-red-100 text-red-700";
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-700">{label}</span>
      <span className={`badge ${color}`}>{ok ? okText : badText}</span>
    </div>
  );
}
