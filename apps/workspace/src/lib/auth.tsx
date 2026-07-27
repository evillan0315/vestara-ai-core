import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import { getActor, setActor as persistActor } from './api';

interface AuthState {
  actor: string;
  setActor: (name: string) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [actor, setActorState] = useState(getActor);

  const value = useMemo<AuthState>(
    () => ({
      actor,
      setActor: (name: string) => {
        persistActor(name);
        setActorState(getActor());
      },
    }),
    [actor],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth requires AuthProvider');
  return ctx;
}
