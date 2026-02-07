import type { ReactNode } from "react";
import { createContext, useContext, useMemo, useState } from "react";

interface SessionContextValue {
  sessionToken: string | null;
  setSessionToken: (token: string | null) => void;
  clearSession: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export const SessionProvider = ({ children }: { children: ReactNode }) => {
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const value = useMemo(
    () => ({
      sessionToken,
      setSessionToken,
      clearSession: () => setSessionToken(null),
    }),
    [sessionToken]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSession must be used within SessionProvider.");
  }

  return context;
};
