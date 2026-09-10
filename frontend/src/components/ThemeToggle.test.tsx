import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_STORAGE_KEY } from "@/lib/theme";

describe("ThemeToggle", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
  });

  it("shows 'Dark mode' when the current theme is light", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle />);

    expect(
      await screen.findByRole("button", { name: /switch to dark theme/i })
    ).toHaveTextContent("Dark mode");
  });

  it("shows 'Light mode' when the current theme is dark", async () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<ThemeToggle />);

    expect(
      await screen.findByRole("button", { name: /switch to light theme/i })
    ).toHaveTextContent("Light mode");
  });

  it("toggles the theme, the DOM attribute, and localStorage on click", async () => {
    document.documentElement.setAttribute("data-theme", "light");
    render(<ThemeToggle />);

    const button = await screen.findByRole("button", {
      name: /switch to dark theme/i,
    });
    await userEvent.click(button);

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /switch to light theme/i })
      ).toHaveTextContent("Light mode")
    );

    await userEvent.click(
      screen.getByRole("button", { name: /switch to light theme/i })
    );
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });
});
