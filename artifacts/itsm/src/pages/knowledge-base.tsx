import {
  useListKbArticles,
  useGetKbArticle,
  useListDepartments,
} from "@workspace/api-client-react";
import { useState } from "react";
import { useRoute, Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, BookOpen, ArrowLeft } from "lucide-react";
import { format } from "date-fns";

export function KnowledgeBaseList() {
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("all");
  const { data: departments } = useListDepartments();
  const { data: articles, isLoading } = useListKbArticles({
    q: search || undefined,
    departmentId:
      departmentId === "all" ? undefined : Number(departmentId),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Knowledge Base
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Self-service articles, runbooks, and policies.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative w-[320px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground/70" />
          <Input
            placeholder="Search articles…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
            data-testid="input-search"
          />
        </div>
        <Select value={departmentId} onValueChange={setDepartmentId}>
          <SelectTrigger
            className="w-[200px] h-9"
            data-testid="select-department"
          >
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
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : articles?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No articles found.</p>
        ) : (
          articles?.map((a) => (
            <Link
              key={a.id}
              href={`/knowledge-base/${a.id}`}
              data-testid={`card-article-${a.id}`}
            >
              <Card className="hover:border-indigo-300 hover:shadow-md transition cursor-pointer h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <BookOpen className="h-3.5 w-3.5" />
                    {a.departmentName}
                  </div>
                  <CardTitle className="text-base">{a.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {a.body}
                  </p>
                  <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                    <span>{a.authorName}</span>
                    <span>{a.views} views</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))
        )}
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
