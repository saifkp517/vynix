'use client'

import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "./theme-provider";
import { ThemeConfigProvider } from "./theme-provider";
import { AuthProvider } from "./utils/AuthContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


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
        <ThemeProvider>
            <AuthProvider>
              {children}
            </AuthProvider>
        </ThemeProvider>

      </body>
    </html>
  );
}
