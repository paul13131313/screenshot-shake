import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "画面崩壊",
  description: "スクショをアップロードしてタップすると、画面がバラバラに崩れ落ちる",
  icons: {
    icon: "/favicon.png",
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "画面崩壊",
    description: "スクショをアップロードしてタップすると、画面がバラバラに崩れ落ちる",
    images: ["https://screenshot-shake.vercel.app/ogp.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "画面崩壊",
    description: "スクショをアップロードしてタップすると、画面がバラバラに崩れ落ちる",
    images: ["https://screenshot-shake.vercel.app/ogp.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
