import {
  useListKbArticles,
  useGetKbArticle,
  useListDepartments,
  getListKbArticlesQueryKey,
  type KbArticle,
} from "@workspace/api-client-react";
import { useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Search,
  BookOpen,
  ArrowLeft,
  Filter,
  RefreshCw,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  FileText,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/providers/session-provider";
import { AddSourceDialog } from "@/components/knowledge-base/add-source-dialog";
import { DeleteArticleDialog } from "@/components/knowledge-base/delete-article-dialog";

type SourceFilter =
  | "manual"
  | "confluence"
  | "notion"
  | "freshservice"
  | "sharepoint";
type StatusFilter = "completed" | "failed" | "pending";
type SortKey = "title" | "syncStatus" | "lastSyncedAt";
type SortDir = "asc" | "desc";

const ALL_SOURCES: { value: SourceFilter; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "confluence", label: "Confluence" },
  { value: "notion", label: "Notion" },
  { value: "freshservice", label: "Freshservice" },
  { value: "sharepoint", label: "SharePoint" },
];

const ALL_STATUSES: { value: StatusFilter; label: string }[] = [
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const ENHANCE_AI_KEY = "harmony-itsm-kb-enhance-ai";

export function KnowledgeBaseList() {
  const { session } = useSession();
  const canManage = session?.role === "admin" || session?.role === "agent";

  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const [sourceFilters, setSourceFilters] = useState<SourceFilter[]>([]);
  const [statusFilters, setStatusFilters] = useState<StatusFilter[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("lastSyncedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [enhanceAi, setEnhanceAi] = useState(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(ENHANCE_AI_KEY);
    return stored === null ? true : stored === "1";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ENHANCE_AI_KEY, enhanceAi ? "1" : "0");
    }
  }, [enhanceAi]);

  // Server-side filters: dept + q. Source/status are sent as single values when
  // exactly one is selected; otherwise we filter client-side from the wider set.
  const queryClient = useQueryClient();
  const queryParams = {
    q: search || undefined,
    departmentId: departmentId === "all" ? undefined : Number(departmentId),
  } as const;
  const { data: articles, isLoading, isFetching, refetch } =
    useListKbArticles(queryParams);

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [search, departmentId, sourceFilters, statusFilters, pageSize]);

  const filteredSorted = useMemo(() => {
    const list = articles ?? [];
    const filtered = list.filter((a) => {
      if (sourceFilters.length > 0 && !sourceFilters.includes(a.source as SourceFilter))
        return false;
      if (
        statusFilters.length > 0 &&
        !statusFilters.includes(a.syncStatus as StatusFilter)
      )
        return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") {
        cmp = a.title.localeCompare(b.title);
      } else if (sortKey === "syncStatus") {
        cmp = a.syncStatus.localeCompare(b.syncStatus);
      } else {
        const av = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
        const bv = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
        cmp = av - bv;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [articles, sourceFilters, statusFilters, sortKey, sortDir]);

  const total = filteredSorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const visible = filteredSorted.slice(start, start + pageSize);
  const visibleIds = visible.map((a) => a.id);
  const allVisibleSelected =
    visible.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const someVisibleSelected =
    visible.some((a) => selectedIds.has(a.id)) && !allVisibleSelected;

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  };

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onRefresh = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: getListKbArticlesQueryKey() });
  };

  const onSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "title" ? "asc" : "desc");
    }
  };

  const activeFilterCount =
    sourceFilters.length + statusFilters.length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Knowledge base
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Self-service articles, runbooks, and policies pulled in from your
            connected sources.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={enhanceAi}
            onCheckedChange={setEnhanceAi}
            data-testid="switch-enhance-ai"
          />
          <span className="text-sm">Enhance with general AI knowledge</span>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Toolbar
            search={search}
            onSearch={setSearch}
            departmentId={departmentId}
            onDepartmentId={setDepartmentId}
            filtersOpen={filtersOpen}
            onFiltersOpen={setFiltersOpen}
            sourceFilters={sourceFilters}
            onSourceFilters={setSourceFilters}
            statusFilters={statusFilters}
            onStatusFilters={setStatusFilters}
            activeFilterCount={activeFilterCount}
            onRefresh={onRefresh}
            isFetching={isFetching}
            canManage={canManage}
          />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        allVisibleSelected
                          ? true
                          : someVisibleSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={toggleAllVisible}
                      aria-label="Select all on this page"
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <SortableHeader
                    label="Title"
                    activeKey={sortKey}
                    activeDir={sortDir}
                    sortKey="title"
                    onClick={() => onSort("title")}
                  />
                  <TableHead>Source</TableHead>
                  <SortableHeader
                    label="Sync status"
                    activeKey={sortKey}
                    activeDir={sortDir}
                    sortKey="syncStatus"
                    onClick={() => onSort("syncStatus")}
                  />
                  <TableHead>Owner</TableHead>
                  <SortableHeader
                    label="Last synced"
                    activeKey={sortKey}
                    activeDir={sortDir}
                    sortKey="lastSyncedAt"
                    onClick={() => onSort("lastSyncedAt")}
                  />
                  <TableHead className="w-10" aria-label="Actions" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                      Loading…
                    </TableCell>
                  </TableRow>
                ) : visible.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-sm text-muted-foreground py-10"
                    >
                      No sources match your filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((a) => (
                    <ArticleRow
                      key={a.id}
                      article={a}
                      selected={selectedIds.has(a.id)}
                      onToggleSelect={() => toggleOne(a.id)}
                      onDelete={
                        canManage
                          ? () => setDeleting({ id: a.id, title: a.title })
                          : undefined
                      }
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <Footer
            total={total}
            start={total === 0 ? 0 : start + 1}
            end={Math.min(start + pageSize, total)}
            page={safePage}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageSize={setPageSize}
            onPage={setPage}
          />
        </CardContent>
      </Card>

      {deleting && (
        <DeleteArticleDialog
          articleId={deleting.id}
          articleTitle={deleting.title}
          open={deleting != null}
          onOpenChange={(o) => !o && setDeleting(null)}
        />
      )}
    </div>
  );
}

function Toolbar({
  search,
  onSearch,
  departmentId,
  onDepartmentId,
  filtersOpen,
  onFiltersOpen,
  sourceFilters,
  onSourceFilters,
  statusFilters,
  onStatusFilters,
  activeFilterCount,
  onRefresh,
  isFetching,
  canManage,
}: {
  search: string;
  onSearch: (v: string) => void;
  departmentId: string;
  onDepartmentId: (v: string) => void;
  filtersOpen: boolean;
  onFiltersOpen: (v: boolean) => void;
  sourceFilters: SourceFilter[];
  onSourceFilters: (v: SourceFilter[]) => void;
  statusFilters: StatusFilter[];
  onStatusFilters: (v: StatusFilter[]) => void;
  activeFilterCount: number;
  onRefresh: () => void;
  isFetching: boolean;
  canManage: boolean;
}) {
  const { data: departments } = useListDepartments();

  const toggle = <T extends string>(arr: T[], v: T): T[] =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-muted/30">
      <Popover open={filtersOpen} onOpenChange={onFiltersOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            data-testid="button-filters"
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 min-w-5 px-1.5 rounded-full text-[10px]"
              >
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="p-3 border-b">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Source
            </p>
            <div className="space-y-1.5">
              {ALL_SOURCES.map((s) => (
                <label
                  key={s.value}
                  className="flex items-center gap-2 text-sm cursor-pointer hover-elevate active-elevate-2 rounded px-1.5 py-1 -mx-1.5"
                  data-testid={`filter-source-${s.value}`}
                >
                  <Checkbox
                    checked={sourceFilters.includes(s.value)}
                    onCheckedChange={() =>
                      onSourceFilters(toggle(sourceFilters, s.value))
                    }
                  />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Status
            </p>
            <div className="space-y-1.5">
              {ALL_STATUSES.map((s) => (
                <label
                  key={s.value}
                  className="flex items-center gap-2 text-sm cursor-pointer hover-elevate active-elevate-2 rounded px-1.5 py-1 -mx-1.5"
                  data-testid={`filter-status-${s.value}`}
                >
                  <Checkbox
                    checked={statusFilters.includes(s.value)}
                    onCheckedChange={() =>
                      onStatusFilters(toggle(statusFilters, s.value))
                    }
                  />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </div>
          {activeFilterCount > 0 && (
            <div className="p-2 border-t flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onSourceFilters([]);
                  onStatusFilters([]);
                }}
                data-testid="button-clear-filters"
              >
                Clear all
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <div className="relative flex-1 min-w-[220px] max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/70" />
        <Input
          placeholder="Search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="pl-8 h-9"
          data-testid="input-search"
        />
      </div>

      <Select value={departmentId} onValueChange={onDepartmentId}>
        <SelectTrigger className="w-[180px] h-9" data-testid="select-department">
          <SelectValue placeholder="All departments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All departments</SelectItem>
          {departments?.map((d) => (
            <SelectItem key={d.id} value={String(d.id)}>
              {d.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9"
          onClick={onRefresh}
          aria-label="Refresh"
          data-testid="button-refresh"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </Button>
        {canManage && <AddSourceDialog />}
      </div>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  activeDir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  activeDir: SortDir;
  onClick: () => void;
}) {
  const isActive = sortKey === activeKey;
  const Icon = !isActive ? ArrowUpDown : activeDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead>
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1 -mx-2 px-2 py-1 rounded hover-elevate active-elevate-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
        data-testid={`sort-${sortKey}`}
      >
        {label}
        <Icon className={cn("h-3 w-3", !isActive && "opacity-50")} />
      </button>
    </TableHead>
  );
}

function ArticleRow({
  article,
  selected,
  onToggleSelect,
  onDelete,
}: {
  article: KbArticle;
  selected: boolean;
  onToggleSelect: () => void;
  onDelete?: () => void;
}) {
  return (
    <TableRow
      className={cn(selected && "bg-accent/40")}
      data-testid={`row-article-${article.id}`}
    >
      <TableCell className="py-2">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          aria-label={`Select ${article.title}`}
          data-testid={`checkbox-article-${article.id}`}
        />
      </TableCell>
      <TableCell className="py-2">
        <Link
          href={`/knowledge-base/${article.id}`}
          className="inline-flex items-center gap-2 hover:underline underline-offset-2"
          data-testid={`link-article-${article.id}`}
        >
          <FileText className="h-4 w-4 text-muted-foreground/80 shrink-0" />
          <span className="font-medium truncate">{article.title}</span>
        </Link>
      </TableCell>
      <TableCell className="py-2 text-sm text-muted-foreground">
        <SourceLabel source={article.source} />
      </TableCell>
      <TableCell className="py-2">
        <SyncStatusBadge status={article.syncStatus} />
      </TableCell>
      <TableCell className="py-2">
        <OwnerCell name={article.authorName} />
      </TableCell>
      <TableCell className="py-2 text-sm text-muted-foreground tabular-nums">
        {article.lastSyncedAt
          ? format(new Date(article.lastSyncedAt), "MMM d, yyyy HH:mm")
          : "—"}
      </TableCell>
      <TableCell className="py-2 text-right">
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`Delete ${article.title}`}
            data-testid={`button-delete-article-${article.id}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function SourceLabel({ source }: { source: string }) {
  const label =
    ALL_SOURCES.find((s) => s.value === source)?.label ??
    source.charAt(0).toUpperCase() + source.slice(1);
  return <span>{label}</span>;
}

function SyncStatusBadge({ status }: { status: string }) {
  const cls =
    status === "completed"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
      : status === "failed"
        ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900"
        : "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900";
  const label =
    status === "completed"
      ? "Completed"
      : status === "failed"
        ? "Failed"
        : "Pending";
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", cls)}
      data-testid={`badge-sync-${status}`}
    >
      {label}
    </Badge>
  );
}

function OwnerCell({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="flex items-center gap-2 text-sm">
      <Avatar className="h-6 w-6">
        <AvatarFallback className="text-[10px] font-medium bg-primary/10 text-primary">
          {initials || "?"}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{name}</span>
    </div>
  );
}

function Footer({
  total,
  start,
  end,
  page,
  totalPages,
  pageSize,
  onPageSize,
  onPage,
}: {
  total: number;
  start: number;
  end: number;
  page: number;
  totalPages: number;
  pageSize: number;
  onPageSize: (n: number) => void;
  onPage: (n: number) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t text-sm text-muted-foreground"
      data-testid="kb-footer"
    >
      <span data-testid="kb-range-summary">
        {total === 0 ? (
          "No results"
        ) : (
          <>
            Showing{" "}
            <span className="font-medium text-foreground">{start}-{end}</span>{" "}
            of <span className="font-medium text-foreground">{total}</span>
          </>
        )}
      </span>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSize(Number(v))}
          >
            <SelectTrigger className="h-8 w-[72px]" data-testid="select-page-size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span data-testid="kb-page-summary">
          Page <span className="font-medium text-foreground">{page}</span> of{" "}
          <span className="font-medium text-foreground">{totalPages}</span>
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1}
            onClick={() => onPage(1)}
            aria-label="First page"
            data-testid="button-first-page"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
            aria-label="Previous page"
            data-testid="button-prev-page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
            aria-label="Next page"
            data-testid="button-next-page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={page >= totalPages}
            onClick={() => onPage(totalPages)}
            aria-label="Last page"
            data-testid="button-last-page"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function KnowledgeBaseDetail() {
  const [, params] = useRoute("/knowledge-base/:id");
  const id = Number(params?.id);
  const { data: article, isLoading } = useGetKbArticle(id);

  if (!id || Number.isNaN(id)) {
    return <p className="text-sm text-muted-foreground">Invalid article id.</p>;
  }
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (!article) {
    return <p className="text-sm text-muted-foreground">Article not found.</p>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <Link
        href="/knowledge-base"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to knowledge base
      </Link>
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <BookOpen className="h-3.5 w-3.5" />
          {article.departmentName}
          <span>·</span>
          <span>{article.authorName}</span>
          <span>·</span>
          <span>
            Updated {format(new Date(article.updatedAt), "MMM d, yyyy")}
          </span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mb-4">
          {article.title}
        </h1>
      </div>
      <Card>
        <CardContent className="py-6 prose prose-slate max-w-none whitespace-pre-wrap text-sm leading-relaxed">
          {article.body}
        </CardContent>
      </Card>
    </div>
  );
}

export default KnowledgeBaseList;
