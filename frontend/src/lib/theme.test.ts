import { applyTheme, getCurrentTheme, THEME_STORAGE_KEY } from "@/lib/theme";

describe("theme", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
  });

  it("defaults to light when no data-theme attribute is set", () => {
    expect(getCurrentTheme()).toBe("light");
  });

  it("applyTheme sets the attribute and persists to localStorage", () => {
    applyTheme("dark");

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(getCurrentTheme()).toBe("dark");
  });

  it("applyTheme back to light updates both the attribute and storage", () => {
    applyTheme("dark");
    applyTheme("light");

    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(getCurrentTheme()).toBe("light");
  });
});
