export type User = { username: string };

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.detail === "string" ? body.detail : "Something went wrong.";
  } catch {
    return "Something went wrong.";
  }
}

export async function fetchMe(): Promise<User | null> {
  const response = await fetch("/api/auth/me", { credentials: "same-origin" });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

export async function login(username: string, password: string): Promise<User> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  return response.json();
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
}
