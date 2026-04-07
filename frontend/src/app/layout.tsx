import type { Metadata } from "next";
import "./globals.css";
import TopNav from "@/components/ui/TopNav";

export const metadata: Metadata = {
  title: "DocuSign Healthcare",
  description: "Healthcare fax automation and e-signature platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex flex-col h-screen overflow-hidden">
        <TopNav />
        <main className="flex-1 overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
