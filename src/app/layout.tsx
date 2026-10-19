import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IS — Identity Service",
  description: "Shared authentication for IG, Sandcastle, and Nexus",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <main className="page-shell">{children}</main>
      </body>
    </html>
  );
}
