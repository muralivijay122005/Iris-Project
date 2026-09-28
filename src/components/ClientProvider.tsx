"use client";

import { SessionProvider } from "next-auth/react";
import { SettingsProvider } from "./providers/settings";
import { ToastProvider } from "./providers/toast";

export default function ClientProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <SettingsProvider>
        <ToastProvider>{children}</ToastProvider>
      </SettingsProvider>
    </SessionProvider>
  );
}
