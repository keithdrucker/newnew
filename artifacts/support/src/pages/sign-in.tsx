import { useMemo, useState } from "react";
import { LifeBuoy, Search, Loader2, AlertCircle } from "lucide-react";
import { useListPeople } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { usePortalSession } from "@/components/providers/portal-session-provider";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function SignInPage() {
  const { signIn, isSwitching } = usePortalSession();
  const peopleQuery = useListPeople();
  const [filter, setFilter] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const list = peopleQuery.data ?? [];
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.title ?? "").toLowerCase().includes(q),
    );
  }, [peopleQuery.data, filter]);

  const handlePick = async (id: number) => {
    setError(null);
    setPendingId(id);
    try {
      await signIn(id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not sign you in. Try again.",
      );
      setPendingId(null);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <span className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-primary text-primary-foreground mb-4">
              <LifeBuoy className="h-6 w-6" strokeWidth={2.25} />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome to Harmony Support
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Choose your account to start a request or check on an existing one.
            </p>
          </div>

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="p-3 border-b">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Search by name or email…"
                    className="pl-8 h-9"
                    data-testid="input-account-search"
                    autoFocus
                  />
                </div>
              </div>

              <div className="max-h-[420px] overflow-y-auto">
                {peopleQuery.isLoading ? (
                  <div className="p-2 space-y-1">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2.5"
                      >
                        <Skeleton className="h-9 w-9 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3.5 w-2/5" />
                          <Skeleton className="h-3 w-3/5" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : peopleQuery.isError ? (
                  <div className="p-6 text-sm text-destructive flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>
                      Couldn&apos;t load accounts. Refresh the page to try again.
                    </span>
                  </div>
                ) : filtered.length === 0 && (peopleQuery.data?.length ?? 0) === 0 ? (
                  <div className="p-8 text-center">
                    <div className="text-sm font-medium">
                      No accounts available yet
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      An administrator hasn&apos;t added any end users.
                    </p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                    No matches for &ldquo;{filter}&rdquo;.
                  </div>
                ) : (
                  <ul className="divide-y">
                    {filtered.map((person) => {
                      const pending = pendingId === person.id && isSwitching;
                      return (
                        <li key={person.id}>
                          <button
                            type="button"
                            onClick={() => handlePick(person.id)}
                            disabled={pendingId != null}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover-elevate active-elevate-2 disabled:opacity-60 disabled:cursor-not-allowed"
                            data-testid={`button-pick-account-${person.id}`}
                          >
                            <Avatar className="h-9 w-9 shrink-0">
                              <AvatarFallback className="text-[11px] bg-secondary text-secondary-foreground">
                                {initials(person.name)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">
                                {person.name}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {person.email}
                                {person.title ? ` · ${person.title}` : ""}
                              </div>
                            </div>
                            {pending ? (
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>

          {error ? (
            <div className="mt-4 flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : null}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Demo portal — accounts are not password-protected.
          </p>
        </div>
      </div>
      <div className="text-center text-[11px] text-muted-foreground py-4">
        Looking for the agent workspace?{" "}
        <a href="/" className="underline underline-offset-2 hover:text-foreground">
          Open Harmony ITSM
        </a>
        .
      </div>
    </div>
  );
}
