import React, { createContext, useContext, useEffect } from "react";
import { useGetMe, useLogin, useLogout, useRegister } from "@workspace/api-client-react";
import type { AuthUser, LoginInput, RegisterInput } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (data: LoginInput) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (role: string) => boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data, isLoading: isMeLoading, refetch } = useGetMe({ 
    request: { credentials: 'include' },
    query: { retry: false, staleTime: 5 * 60 * 1000 }
  });

  const loginMutation = useLogin({ request: { credentials: 'include' } });
  const registerMutation = useRegister({ request: { credentials: 'include' } });
  const logoutMutation = useLogout({ request: { credentials: 'include' } });

  const user = data?.user || null;

  const login = async (input: LoginInput) => {
    await loginMutation.mutateAsync({ data: input });
    await refetch();
  };

  const register = async (input: RegisterInput) => {
    await registerMutation.mutateAsync({ data: input });
    await refetch();
  };

  const logout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch {}
    queryClient.clear();
    setLocation("/login");
  };

  const hasRole = (role: string) => {
    return user?.roles.some(r => r.role === role) || false;
  };

  // Redirect routing based on roles happens at the page level or route guard to avoid loops
  return (
    <AuthContext.Provider value={{ user, isLoading: isMeLoading, login, register, logout, hasRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
