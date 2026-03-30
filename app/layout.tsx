import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
// import BaseLayout from "./src/root";
import BaseLayout from "./src/root-enhanced";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sign Language Detector",
  description: "App to Detect Sign Language Gestures",
  icons: {
    icon: [
      {
        url: "/favicon_io/favicon-32x32.png",
        type: "image/png",
        sizes: "32x32",
      },
      {
        url: "/favicon_io/favicon-16x16.png",
        type: "image/png",
        sizes: "16x16",
      },
      {
        url: "/favicon_io/android-chrome-192x192.png",
        type: "image/png",
        sizes: "192x192",
      },
      {
        url: "/favicon_io/android-chrome-512x512.png",
        type: "image/png",
        sizes: "512x512",
      },
      "/favicon_io/favicon.ico",
    ],
    apple: "/favicon_io/apple-touch-icon.png",
    other: [{ rel: "manifest", url: "/favicon_io/site.webmanifest" }],
  },
};
// Favicons are served from the `public/` folder. See public/favicon_io

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <BaseLayout />
      </body>
    </html>
  );
}
