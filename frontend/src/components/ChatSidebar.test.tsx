import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";

describe("ChatSidebar", () => {
  it("sends a message and displays the reply", async () => {
    const onSendMessage = vi.fn().mockResolvedValue({
      reply: "Sure, done!",
      board: { columns: [], cards: {} },
    });

    render(<ChatSidebar onSendMessage={onSendMessage} />);

    await userEvent.type(
      screen.getByLabelText(/chat message/i),
      "add a card"
    );
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(onSendMessage).toHaveBeenCalledWith("add a card", []);

    const messages = screen.getByTestId("chat-messages");
    expect(within(messages).getByText("add a card")).toBeInTheDocument();
    expect(await within(messages).findByText("Sure, done!")).toBeInTheDocument();
  });

  it("passes prior messages as history on the next send", async () => {
    const onSendMessage = vi
      .fn()
      .mockResolvedValueOnce({ reply: "First reply", board: { columns: [], cards: {} } })
      .mockResolvedValueOnce({ reply: "Second reply", board: { columns: [], cards: {} } });

    render(<ChatSidebar onSendMessage={onSendMessage} />);
    const input = screen.getByLabelText(/chat message/i);
    const sendButton = screen.getByRole("button", { name: /send/i });

    await userEvent.type(input, "first message");
    await userEvent.click(sendButton);
    await screen.findByText("First reply");

    await userEvent.type(input, "second message");
    await userEvent.click(sendButton);
    await screen.findByText("Second reply");

    expect(onSendMessage).toHaveBeenLastCalledWith("second message", [
      { role: "user", content: "first message" },
      { role: "assistant", content: "First reply" },
    ]);
  });

  it("does not show a New chat button before any messages are sent", () => {
    render(<ChatSidebar onSendMessage={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /new chat/i })
    ).not.toBeInTheDocument();
  });

  it("clears the conversation when New chat is clicked", async () => {
    const onSendMessage = vi.fn().mockResolvedValue({
      reply: "Sure, done!",
      board: { columns: [], cards: {} },
    });

    render(<ChatSidebar onSendMessage={onSendMessage} />);
    await userEvent.type(screen.getByLabelText(/chat message/i), "hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));
    await screen.findByText("Sure, done!");

    await userEvent.click(screen.getByRole("button", { name: /new chat/i }));

    expect(screen.queryByText("hello")).not.toBeInTheDocument();
    expect(screen.queryByText("Sure, done!")).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/chat message/i), "second try");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(onSendMessage).toHaveBeenLastCalledWith("second try", []);
  });

  it("shows an error message when sending fails", async () => {
    const onSendMessage = vi.fn().mockRejectedValue(new Error("Network error"));

    render(<ChatSidebar onSendMessage={onSendMessage} />);
    await userEvent.type(screen.getByLabelText(/chat message/i), "hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(await screen.findByTestId("chat-error")).toHaveTextContent(
      "Network error"
    );
  });

  it("disables the input while a message is in flight", async () => {
    let resolveSend: (value: { reply: string; board: unknown }) => void = () => {};
    const onSendMessage = vi.fn().mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      })
    );

    render(<ChatSidebar onSendMessage={onSendMessage} />);
    const input = screen.getByLabelText(/chat message/i);
    await userEvent.type(input, "hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(input).toBeDisabled();
    expect(screen.getByTestId("chat-thinking")).toBeInTheDocument();

    resolveSend({ reply: "Done", board: { columns: [], cards: {} } });
    await waitFor(() => expect(input).not.toBeDisabled());
  });
});
