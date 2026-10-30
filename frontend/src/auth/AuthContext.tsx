/* eslint-disable react-refresh/only-export-components -- provider and hook belong together */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, getToken, onUnauthorized, setToken } from "../api/client";
import { api } from "../api/endpoints";
import type { AuthResponse, User } from "../types";

// ---------------------------------------------------------------------------
// Session state: who is signed in, and what they may do.
// The token is kept in localStorage; the user is re-loaded from /auth/me on
// start-up. Server checks are authoritative; the helpers below only hide
// controls the user would not be allowed to use.
// ---------------------------------------------------------------------------

type Phase = "loading" | "setup" | "signed-out" | "signed-in" | "offline";

interface AuthState {
  phase: Phase;
  user: User | null;
  signIn: (res: AuthResponse) => void;
  signOut: () => void;
  retry: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const status = await api.authStatus();
        if (!alive) return;
        if (status.needsSetup) {
          setToken(null);
          setPhase("setup");
          return;
        }
        if (!getToken()) {
          setPhase("signed-out");
          return;
        }
        const me = await api.me();
        if (!alive) return;
        setUser(me);
        setPhase("signed-in");
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 401) {
          setToken(null);
          setPhase("signed-out");
        } else {
          setPhase("offline");
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [attempt]);

  const signOut = useCallback(() => {
    setToken(null);
    setUser(null);
    setPhase("signed-out");
  }, []);

  useEffect(() => onUnauthorized(signOut), [signOut]);

  const signIn = useCallback((res: AuthResponse) => {
    setToken(res.token);
    setUser(res.user);
    setPhase("signed-in");
  }, []);

  const refreshUser = useCallback(async () => {
    setUser(await api.me());
  }, []);

  const retry = useCallback(() => {
    setPhase("loading");
    setAttempt((a) => a + 1);
  }, []);

  const value = useMemo(() => ({ phase, user, signIn, signOut, retry, refreshUser }), [phase, user, signIn, signOut, retry, refreshUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

// The signed-in user (only call inside signed-in screens).
export function useMe(): User {
  const { user } = useAuth();
  if (!user) throw new Error("No signed-in user");
  return user;
}

export const roleLabel: Record<User["role"], string> = { admin: "Admin", manager: "Manager", member: "Member" };

export function isAdmin(u: User) {
  return u.role === "admin";
}
