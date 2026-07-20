import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { TopNav } from "@/components/TopNav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <TopNav
        userName={session.user.name ?? session.user.email ?? "משתמש"}
        role={session.user.role}
      />
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
