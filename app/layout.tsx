import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { auth } from "@/auth";
import { fontDisplay, fontUI, fontLogo } from "@/lib/theme/fonts";
import { ThemeProvider } from "@/components/ui/ThemeProvider";
import PostHogProvider from "@/context/PostHogProvider";
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
  // The root layout sits above every error boundary, so an unhandled throw
  // here (e.g. a cold-start auth/DB failure) blanks the whole tab. Degrade to
  // a null session instead — SessionProvider re-fetches it client-side once
  // the server is warm.
  let session: Session | null = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
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
          <PostHogProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </PostHogProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
