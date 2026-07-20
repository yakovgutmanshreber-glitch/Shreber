import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "מערכת ניהול כספים",
  description: "ניהול התחייבויות, עסקאות, אנשי קשר וקטגוריות — משולב עם קשר",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
