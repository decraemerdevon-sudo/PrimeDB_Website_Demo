import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Change Order Manager — Prime Design Build",
  description:
    "Convert messy change-order requests into formal, tracked change orders.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-zinc-50 text-zinc-900">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="inline-block h-6 w-6 rounded bg-[#0F2942]" />
              <span className="font-semibold text-[#0F2942]">
                Prime Design Build
              </span>
              <span className="hidden text-zinc-400 sm:inline">
                / Change Orders
              </span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/" className="text-zinc-600 hover:text-[#0F2942]">
                Dashboard
              </Link>
              <Link
                href="/change-orders/new"
                className="rounded-md bg-[#0F2942] px-3 py-1.5 font-medium text-white hover:bg-[#1b3d5e]"
              >
                New
              </Link>
            </nav>
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
