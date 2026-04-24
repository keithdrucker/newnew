import { Link } from "wouter";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="py-16 sm:py-24 text-center">
      <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-muted text-muted-foreground mb-4">
        <Compass className="h-6 w-6" strokeWidth={2} />
      </div>
      <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">
        We couldn&apos;t find that page
      </h1>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-sm mx-auto">
        The page you&apos;re looking for doesn&apos;t exist, or the link may be out of date.
      </p>
      <Button
        asChild
        className="mt-5"
        data-testid="button-back-home-from-404"
      >
        <Link href="/">Back to your conversations</Link>
      </Button>
    </div>
  );
}
