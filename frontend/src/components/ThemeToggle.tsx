"use client";

import { useEffect, useState } from "react";
import { applyTheme, getCurrentTheme, type Theme } from "@/lib/theme";

export const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    // The inline script in layout.tsx already set the real attribute before
    // paint -- just read it back rather than recomputing the
    // stored/system-preference logic a second time here.
    setTheme(getCurrentTheme());
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  };

  if (theme === null) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={
        theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
      }
      className="fixed right-4 top-4 z-50 rounded-full border border-[var(--stroke)] bg-[var(--surface-translucent)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] shadow-[var(--shadow)] transition hover:text-[var(--navy-dark)]"
    >
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
};
