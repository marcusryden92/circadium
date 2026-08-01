import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { fontDisplay, fontUI, fontLogo } from "@/lib/theme/fonts";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import "@/lib/theme/global.css";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Circadium",
  description: "Create your life!",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  return (
    <html
      lang="en"
      className={`${fontDisplay.variable} ${fontUI.variable} ${fontLogo.variable}`}
    >
      <body
        className={inter.className}
        style={{
          margin: 0,
          minHeight: "100vh",
          width: "100vw",
          overflowX: "hidden",
        }}
      >
        <SessionProvider session={session}>
          <ThemeProvider>{children}</ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
