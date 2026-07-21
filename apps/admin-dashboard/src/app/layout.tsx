import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kent Site Prospector",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body className="bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
