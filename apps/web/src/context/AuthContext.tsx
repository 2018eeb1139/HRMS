import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { apiGet, saveTokenFromHash, getToken, clearToken } from "../api/client";

export type Me = { id: string; email: string; role: string };

type AuthContextValue = {
  me: Me | null;
  loading: boolean;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Resolves the current user once (/auth/me) and shares it with the whole tree.
export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (window.location.hash.includes("token=")) {
      saveTokenFromHash(window.location.hash);
      window.location.hash = "";
    }
    if (!getToken()) {
      setLoading(false);
      return;
    }

    apiGet<Me>("/auth/me")
      .then(setMe)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      me,
      loading,
      logout: () => {
        clearToken();
        setMe(null);
        window.location.reload();
      },
    }),
    [me, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
