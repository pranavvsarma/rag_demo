import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TopNav } from "@/app/components/TopNav";
import "./globals.css";

// Self-hosted variable fonts, exposed as CSS custom properties (see
// className below) so globals.css can reference them via Tailwind config.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Default metadata (title/description) for every route that doesn't override it.
export const metadata: Metadata = {
  title: "Databricks RAG · Chat with your docs and data · Create charts with datasets in Data Explorer",
  description:
    "A RAG chat app over Databricks Vector Search with a Llama 3.3 70B serving endpoint, plus a Data Explorer for attaching datasets and reports to the chat. Built with Next.js and React.",
};

/**
 * Root layout wrapping every route in the app (Next.js App Router). Renders
 * the shared <html>/<body> shell, loads fonts, mounts the persistent top
 * navigation bar, then renders the active page as `children`.
 */
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
      {/* h-dvh + overflow-hidden so the nav is fixed height and each page
          scrolls inside the remaining space rather than the document. */}
      <body className="h-dvh flex flex-col overflow-hidden">
        <TopNav />
        {children}
      </body>
    </html>
  );
}
