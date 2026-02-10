import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api/client";
import type { User } from "../api/types";

interface AuthContextValue {
  token: string | null;
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  loginWithStravaCode: (code: string, redirectUri?: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY = "stravhat_jwt";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = async () => {
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const me = await apiRequest<User>("/me", { token });
      setUser(me);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshMe().catch(() => {
      setLoading(false);
    });
  }, [token]);

  const loginWithStravaCode = async (code: string, redirectUri?: string) => {
    const response = await apiRequest<{ jwt: string; user: User }>("/auth/strava/exchange", {
      method: "POST",
      body: {
        code,
        redirectUri,
      },
    });

    localStorage.setItem(STORAGE_KEY, response.jwt);
    setToken(response.jwt);
    setUser(response.user);
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setUser(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      loading,
      isAuthenticated: !!token,
      loginWithStravaCode,
      refreshMe,
      logout,
    }),
    [token, user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
