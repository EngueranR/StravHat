import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api/client";
import type { User } from "../api/types";

interface RegisterResponse {
  message: string;
  requiresApproval: boolean;
}

interface AuthContextValue {
  token: string | null;
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  loginWithPassword: (email: string, password: string) => Promise<void>;
  registerWithPassword: (email: string, password: string) => Promise<RegisterResponse>;
  connectStravaWithCode: (code: string) => Promise<void>;
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

  const loginWithPassword = async (email: string, password: string) => {
    const response = await apiRequest<{ jwt: string; user: User }>("/auth/login", {
      method: "POST",
      body: {
        email,
        password,
      },
    });

    localStorage.setItem(STORAGE_KEY, response.jwt);
    setToken(response.jwt);
    setUser(response.user);
  };

  const registerWithPassword = async (email: string, password: string) => {
    return apiRequest<RegisterResponse>("/auth/register", {
      method: "POST",
      body: {
        email,
        password,
      },
    });
  };

  const connectStravaWithCode = async (code: string) => {
    if (!token) {
      throw new Error("Session expiree. Reconnecte-toi avant de lier Strava.");
    }

    const response = await apiRequest<{ user: User }>("/auth/strava/exchange", {
      method: "POST",
      token,
      body: {
        code,
      },
    });

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
      loginWithPassword,
      registerWithPassword,
      connectStravaWithCode,
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
