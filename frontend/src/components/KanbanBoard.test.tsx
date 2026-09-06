import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import * as boardApi from "@/lib/board-api";

vi.mock("@/lib/board-api", () => ({
  fetchBoard: vi.fn(),
  renameColumn: vi.fn(),
  createCard: vi.fn(),
  updateCard: vi.fn(),
  deleteCard: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const seedBoard = () => ({
  columns: [
    { id: "col-a", title: "A", cardIds: ["card-1"] },
    { id: "col-b", title: "B", cardIds: [] },
  ],
  cards: {
    "card-1": { id: "card-1", title: "Existing card", details: "Notes" },
  },
});

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];
const noop = () => {};

describe("KanbanBoard", () => {
  beforeEach(() => {
    vi.mocked(boardApi.fetchBoard).mockResolvedValue(seedBoard());
    vi.mocked(boardApi.renameColumn).mockResolvedValue(undefined);
    vi.mocked(boardApi.deleteCard).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the columns fetched from the API", async () => {
    render(<KanbanBoard onLogout={noop} onSessionExpired={noop} />);
    expect(await screen.findAllByTestId(/column-/i)).toHaveLength(2);
    expect(boardApi.fetchBoard).toHaveBeenCalled();
  });

  it("commits a column rename on blur", async () => {
    render(<KanbanBoard onLogout={noop} onSessionExpired={noop} />);
    const column = await screen.findByTestId("column-col-a");
    const input = within(column).getByLabelText("Column title");

    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    await userEvent.tab();

    expect(boardApi.renameColumn).toHaveBeenCalledWith("col-a", "New Name");
  });

  it("adds a card via the API and shows it", async () => {
    vi.mocked(boardApi.createCard).mockResolvedValue({
      id: "card-new",
      title: "New card",
      details: "Notes",
    });

    render(<KanbanBoard onLogout={noop} onSessionExpired={noop} />);
    const column = await screen.findByTestId("column-col-a");

    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "New card"
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/details/i),
      "Notes"
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );

    expect(boardApi.createCard).toHaveBeenCalledWith("col-a", "New card", "Notes");
    expect(await within(column).findByText("New card")).toBeInTheDocument();
  });

  it("deletes a card via the API", async () => {
    render(<KanbanBoard onLogout={noop} onSessionExpired={noop} />);
    const column = await screen.findByTestId("column-col-a");

    const deleteButton = within(column).getByRole("button", {
      name: /delete existing card/i,
    });
    await userEvent.click(deleteButton);

    expect(boardApi.deleteCard).toHaveBeenCalledWith("card-1");
    await waitFor(() =>
      expect(within(column).queryByText("Existing card")).not.toBeInTheDocument()
    );
  });

  it("redirects to login when loading the board returns 401", async () => {
    vi.mocked(boardApi.fetchBoard).mockRejectedValue(
      new boardApi.ApiError(401, "Not authenticated")
    );
    const onSessionExpired = vi.fn();

    render(<KanbanBoard onLogout={noop} onSessionExpired={onSessionExpired} />);

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
  });
});
