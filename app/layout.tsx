import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SessionProvider } from "@/components/providers/session-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GetUsersFromReddit - Automate Your Reddit Engagement",
  description: "Find related Reddit posts automatically, generate tailor-made comments, and post comments automatically. Grow your audience on Reddit with AI-powered engagement.",
  keywords: ["Reddit", "automation", "engagement", "social media", "marketing", "AI comments", "Reddit posts"],
  authors: [{ name: "GetUsersFromReddit" }],
  creator: "GetUsersFromReddit",
  publisher: "GetUsersFromReddit",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "GetUsersFromReddit - Automate Your Reddit Engagement",
    description: "Find related Reddit posts automatically, generate tailor-made comments, and post comments automatically. Grow your audience on Reddit with AI-powered engagement.",
    url: "/",
    siteName: "GetUsersFromReddit",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "GetUsersFromReddit - Automate Your Reddit Engagement",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GetUsersFromReddit - Automate Your Reddit Engagement",
    description: "Find related Reddit posts automatically, generate tailor-made comments, and post comments automatically.",
    images: ["/og-image.png"],
    creator: "@getusersfromreddit",
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
