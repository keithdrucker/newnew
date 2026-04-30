import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Department,
  useListDepartments,
} from "@workspace/api-client-react";

const STORAGE_KEY = "itsm.team-scope";

type StoredScope = "all" | number[];

function readStored(): StoredScope {
  if (typeof window === "undefined") return "all";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return "all";
    if (raw === "all") return "all";
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((n) => typeof n === "number")) {
      return parsed;
    }
    return "all";
  } catch {
    return "all";
  }
}

function writeStored(value: StoredScope) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      value === "all" ? "all" : JSON.stringify(value),
    );
  } catch {
    // localStorage can throw in private mode; we silently ignore.
  }
}

// Snapshot of the active workspace scope. The provider always reports
// concrete `selectedIds` so consumers can pass them straight into a
// query/filter — `isAll` tells them whether the user explicitly chose
// "All Teams" vs. a strict subset (the difference matters for the
// create flow: "All" still requires an explicit team pick on create).
export type TeamScope = {
  accessible: Department[];
  selectedIds: number[];
  isAll: boolean;
  single: boolean;
  singleId: number | null;
  loading: boolean;
  setSelectedIds: (ids: number[]) => void;
  setAll: () => void;
};

const TeamScopeContext = createContext<TeamScope | null>(null);

export function TeamScopeProvider({ children }: { children: React.ReactNode }) {
  const { data: departments, isLoading } = useListDepartments({
    scope: "accessible",
  });
  const accessible = useMemo<Department[]>(
    () => (Array.isArray(departments) ? departments : []),
    [departments],
  );

  // The raw stored selection lives in state so writes from the selector
  // re-render every consumer. We resolve it against `accessible` on
  // every render so a department being removed from the user's access
  // doesn't leave a phantom selected ID lingering forever.
  const [stored, setStored] = useState<StoredScope>(() => readStored());

  // Resolve stored scope → concrete IDs. Empty `accessible` (still
  // loading or no access) yields an empty selection; consumers should
  // gate on `loading`.
  const { selectedIds, isAll } = useMemo(() => {
    if (accessible.length === 0) {
      // No accessible teams (still loading or zero access). Force
      // isAll=false so filterByTeamScope returns an empty list rather
      // than letting items pass unfiltered — that way the UI doesn't
      // briefly flash items before the scope resolves.
      return { selectedIds: [] as number[], isAll: false };
    }
    const accessibleIds = accessible.map((d) => d.id);
    if (stored === "all") {
      return { selectedIds: accessibleIds, isAll: true };
    }
    const filtered = stored.filter((id) => accessibleIds.includes(id));
    if (filtered.length === 0) {
      // Stored selection is fully stale — fall back to "all" so the
      // user isn't stranded with an empty workspace they can't fix.
      return { selectedIds: accessibleIds, isAll: true };
    }
    return {
      selectedIds: filtered,
      isAll: filtered.length === accessibleIds.length,
    };
  }, [accessible, stored]);

  // First-load default: if the user has exactly one accessible team
  // and they don't have an explicit stored selection yet, lock to that
  // single team so the workspace immediately scopes correctly. Doing
  // this in an effect (not on initial state) avoids the SSR/no-window
  // path and only fires once `accessible` has resolved.
  useEffect(() => {
    if (isLoading) return;
    if (accessible.length === 1 && stored === "all") {
      // Only persist if the user truly hasn't chosen anything yet.
      // Reading directly from storage avoids racing the state update.
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (raw == null) {
          const next = [accessible[0].id];
          writeStored(next);
          setStored(next);
        }
      }
    }
  }, [isLoading, accessible, stored]);

  const setSelectedIds = useCallback(
    (ids: number[]) => {
      // Treat "every accessible team is selected" the same as "All" so
      // the persisted value stays stable when the org adds a new team.
      const allIds = accessible.map((d) => d.id);
      const allChosen =
        ids.length === allIds.length && ids.every((id) => allIds.includes(id));
      const next: StoredScope = allChosen ? "all" : ids;
      writeStored(next);
      setStored(next);
    },
    [accessible],
  );

  const setAll = useCallback(() => {
    writeStored("all");
    setStored("all");
  }, []);

  const value = useMemo<TeamScope>(
    () => ({
      accessible,
      selectedIds,
      isAll,
      single: selectedIds.length === 1,
      singleId: selectedIds.length === 1 ? selectedIds[0] : null,
      loading: isLoading,
      setSelectedIds,
      setAll,
    }),
    [accessible, selectedIds, isAll, isLoading, setSelectedIds, setAll],
  );

  return (
    <TeamScopeContext.Provider value={value}>
      {children}
    </TeamScopeContext.Provider>
  );
}

export function useTeamScope(): TeamScope {
  const ctx = useContext(TeamScopeContext);
  if (!ctx) {
    throw new Error("useTeamScope must be used inside <TeamScopeProvider>");
  }
  return ctx;
}

// Convenience helper: given a list of items each carrying a
// `departmentId`, narrow it to the active scope. Items with a null
// departmentId are treated as cross-team and always pass through.
export function filterByTeamScope<T extends { departmentId?: number | null }>(
  items: T[],
  scope: TeamScope,
): T[] {
  if (scope.isAll) return items;
  const set = new Set(scope.selectedIds);
  return items.filter(
    (item) => item.departmentId == null || set.has(item.departmentId),
  );
}
