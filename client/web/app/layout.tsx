import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { getSession, type Session } from "@/lib/session/session";
import { SessionProvider } from "@/lib/session/SessionProvider";
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
  // here (a cold-start DB failure, Java's keys unreachable) blanks the whole
  // tab. Degrade to a null session instead; the next page load tries again.
  let session: Session | null = null;
  try {
    session = await getSession();
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
