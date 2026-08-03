import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { UsersManager } from "./UsersManager";

export default async function UsersPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (session.user.role !== "admin") redirect("/contacts");

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">משתמשים</h1>
        <p className="mt-1 text-sm text-gray-500">ניהול המשתמשים המורשים למערכת</p>
      </div>
      <UsersManager currentUserId={session.user.id} />
    </div>
  );
}
