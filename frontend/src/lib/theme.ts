export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "kanban-studio-theme";

export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export function getCurrentTheme(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}
