import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/contacts");

  const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-white px-4">
      <div className="card w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="לוגו" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800">מערכת ניהול כספים</h1>
          <p className="mt-1 text-sm text-slate-500">התחברות למערכת</p>
        </div>
        <LoginForm googleEnabled={googleEnabled} />
      </div>
    </div>
  );
}
