import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/AppShell";

describe("AppShell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the login form when there is no session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(<AppShell />);

    expect(
      await screen.findByRole("button", { name: /sign in/i })
    ).toBeInTheDocument();
  });

  it("shows the board when a session already exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ username: "user" }),
      })
    );

    render(<AppShell />);

    expect(await screen.findByText("Kanban Studio")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();
  });
});
