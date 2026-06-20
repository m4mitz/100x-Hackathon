import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Concept Check",
  description: "Do you truly understand, or just recognize the words?",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        {children}
      </body>
    </html>
  );
}
