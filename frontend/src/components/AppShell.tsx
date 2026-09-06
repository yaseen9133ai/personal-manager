"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginForm } from "@/components/LoginForm";
import { fetchMe, logout, type User } from "@/lib/auth";

export const AppShell = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    fetchMe()
      .then(setUser)
      .finally(() => setIsChecking(false));
  }, []);

  const handleLogout = async () => {
    await logout();
    setUser(null);
  };

  if (isChecking) {
    return (
      <main className="flex min-h-screen items-center justify-center text-sm text-[var(--gray-text)]">
        Loading...
      </main>
    );
  }

  if (!user) {
    return <LoginForm onSuccess={setUser} />;
  }

  return <KanbanBoard onLogout={handleLogout} />;
};
