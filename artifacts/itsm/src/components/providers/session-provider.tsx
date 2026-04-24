import { createContext, useContext, ReactNode } from "react";
import { useGetSession, Session } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";

interface SessionContextType {
  session: Session | null;
  isLoading: boolean;
}

const SessionContext = createContext<SessionContextType>({ session: null, isLoading: true });

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data: session, isLoading } = useGetSession();

  return (
    <SessionContext.Provider value={{ session: session ?? null, isLoading }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
