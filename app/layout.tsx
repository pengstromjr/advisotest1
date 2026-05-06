import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/lib/theme-context";
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
  title: "Adviso – AI Academic Advisor",
  description:
    "AI-powered academic advising to help students with course planning, prerequisites, and degree requirements.",
};

const STORAGE_RESET_VERSION = "2026-05-05-onboarding-reset-2";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var resetKey = "adviso-storage-reset-version";
                var targetVersion = ${JSON.stringify(STORAGE_RESET_VERSION)};
                if (window.localStorage.getItem(resetKey) !== targetVersion) {
                  [
                    "adviso-onboarding-complete",
                    "adviso-ai-panel-minimized",
                    "adviso-schedule-spring-2026",
                    "adviso-blocked-times-spring-2026",
                    "adviso-theme",
                    "ucd-ai-onboarding-complete",
                    "ucd-ai-schedule-spring-2026",
                    "ucd-ai-blocked-times-spring-2026"
                  ].forEach(function (key) {
                    window.localStorage.removeItem(key);
                  });
                  window.sessionStorage.clear();
                  window.localStorage.setItem(resetKey, targetVersion);
                }
              } catch (e) {}
            `,
          }}
        />
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
