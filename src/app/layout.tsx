import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { isISAdministrator } from "@/lib/admission";
import { pool } from "@/lib/database";
import { AppSidebar } from "@/components/app-sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "IS — Identity Service",
  description: "Shared identity and tenant control plane",
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth.api.getSession({ headers: await headers() });
  let canManageAdmissions = false;
  let canManageNexus = false;
  if (session?.user?.id) {
    const [admin, operator] = await Promise.all([
      isISAdministrator(session.user.id),
      pool.query("SELECT 1 FROM nexus_operators WHERE user_id = $1", [session.user.id]),
    ]);
    canManageAdmissions = admin;
    canManageNexus = operator.rowCount === 1;
  }

  return (
    <html lang="en">
      <body>
        <div className={session ? "app-layout" : "page-shell"}>
          {session && <AppSidebar displayName={session.user.name || session.user.email} canManageAdmissions={canManageAdmissions} canManageNexus={canManageNexus} />}
          <main className={session ? "app-content" : undefined}>{children}</main>
        </div>
      </body>
    </html>
  );
}
