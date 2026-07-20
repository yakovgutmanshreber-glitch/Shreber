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
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-2xl">
            💰
          </div>
          <h1 className="text-2xl font-bold text-gray-900">מערכת ניהול כספים</h1>
          <p className="mt-1 text-sm text-gray-500">התחברות למערכת</p>
        </div>
        <LoginForm googleEnabled={googleEnabled} />
      </div>
    </div>
  );
}
