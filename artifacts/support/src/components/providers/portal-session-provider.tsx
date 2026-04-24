import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSession,
  useSwitchSession,
  getGetSessionQueryKey,
  type Session,
} from "@workspace/api-client-react";
import {
  clearStoredEndUserId,
  getStoredEndUserId,
  setStoredEndUserId,
} from "@/lib/portal-auth";

interface PortalSessionContextValue {
  /** The signed-in end-user session, or null if not signed in. */
  session: Session | null;
  /** True while the initial session bootstrap (load + reconcile) is in flight. */
  isLoading: boolean;
  /** True if the local choice points at an end_user but the server is still being switched. */
  isSwitching: boolean;
  /** Sign in (locally + on the server) as a specific end_user account. */
  signIn: (userId: number) => Promise<void>;
  /** Sign out (clears local choice; server session is left untouched for other apps). */
  signOut: () => void;
}

const PortalSessionContext = createContext<PortalSessionContextValue | undefined>(
  undefined,
);

export function PortalSessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [storedId, setStoredId] = useState<number | null>(() =>
    getStoredEndUserId(),
  );
  const sessionQuery = useGetSession();
  const switchSession = useSwitchSession();
  const [reconciling, setReconciling] = useState(false);

  // If the local stored id doesn't match the server-side session id, switch.
  // This handles the case where another app (e.g. the agent ITSM app) has
  // changed the global demo session — we re-assert the end-user choice.
  useEffect(() => {
    if (storedId == null) return;
    if (sessionQuery.isLoading) return;
    const current = sessionQuery.data;
    if (current && current.userId === storedId && current.role === "end_user") {
      return;
    }
    if (switchSession.isPending || reconciling) return;
    setReconciling(true);
    switchSession.mutate(
      { data: { userId: storedId } },
      {
        onSettled: async (data) => {
          if (data) {
            qc.setQueryData(getGetSessionQueryKey(), data);
          }
          await qc.invalidateQueries();
          setReconciling(false);
        },
      },
    );
  }, [storedId, sessionQuery.data, sessionQuery.isLoading, switchSession, qc, reconciling]);

  const signIn = useCallback(
    async (userId: number) => {
      setStoredEndUserId(userId);
      setStoredId(userId);
      const result = await switchSession.mutateAsync({ data: { userId } });
      qc.setQueryData(getGetSessionQueryKey(), result);
      await qc.invalidateQueries();
    },
    [switchSession, qc],
  );

  const signOut = useCallback(() => {
    clearStoredEndUserId();
    setStoredId(null);
    qc.removeQueries({ queryKey: getGetSessionQueryKey() });
    qc.clear();
  }, [qc]);

  const session: Session | null = useMemo(() => {
    if (storedId == null) return null;
    const s = sessionQuery.data;
    if (!s) return null;
    if (s.userId !== storedId || s.role !== "end_user") return null;
    return s;
  }, [storedId, sessionQuery.data]);

  const isLoading =
    storedId != null &&
    (sessionQuery.isLoading || reconciling || switchSession.isPending);

  const value: PortalSessionContextValue = {
    session,
    isLoading,
    isSwitching: switchSession.isPending || reconciling,
    signIn,
    signOut,
  };

  return (
    <PortalSessionContext.Provider value={value}>
      {children}
    </PortalSessionContext.Provider>
  );
}

export function usePortalSession(): PortalSessionContextValue {
  const ctx = useContext(PortalSessionContext);
  if (!ctx) {
    throw new Error(
      "usePortalSession must be used inside a PortalSessionProvider",
    );
  }
  return ctx;
}
