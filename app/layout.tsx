import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TopNav } from "@/app/components/TopNav";
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
  title: "Databricks RAG · Chat with your docs and data · Create charts with datasets in Data Explorer",
  description:
    "A RAG chat app over Databricks Vector Search with a Llama 3.3 70B serving endpoint, plus a Data Explorer for attaching datasets and reports to the chat. Built with Next.js and React.",
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
      {/* h-dvh + overflow-hidden so the nav is fixed height and each page
          scrolls inside the remaining space rather than the document. */}
      <body className="h-dvh flex flex-col overflow-hidden">
        <TopNav />
        {children}
      </body>
    </html>
  );
}
