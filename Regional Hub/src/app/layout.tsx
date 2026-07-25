import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "National Cleft Registry - Ghana",
  description: "National Cleft Registry anchored at Komfo Anokye Teaching Hospital (KATH), Kumasi, Ghana. A comprehensive system for cleft care data management, quality monitoring, and research.",
  keywords: ["cleft registry", "Ghana", "KATH", "Smile Train", "cleft lip", "cleft palate", "healthcare"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
