import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

const displayFont = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const bodyFont = Manrope({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kanban Studio",
  description: "A focused, single-board kanban workspace.",
};

// Runs before React hydrates so the right theme applies from the first
// paint -- without this the page would flash light mode before a stored or
// system dark preference gets applied client-side.
const themeInitScript = `(function () {
  try {
    var stored = localStorage.getItem("${THEME_STORAGE_KEY}");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${displayFont.variable} ${bodyFont.variable}`}>
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
