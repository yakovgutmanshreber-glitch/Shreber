import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="min-h-screen">
      <Sidebar
        userName={session.user.name ?? session.user.email ?? "משתמש"}
        role={session.user.role}
      />
      <main className="mr-[76px] min-h-screen lg:mr-[264px]">
        <div className="mx-auto max-w-[1152px] px-5 py-8 sm:px-8">{children}</div>
      </main>
    </div>
  );
}
