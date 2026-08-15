import { useSavedAilments } from "@/hooks/use-saved-ailments";
import { CONDITIONS } from "@/lib/strain-ui";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HeartPulse, Loader2 } from "lucide-react";
import { Link } from "react-router";

export function SavedAilmentsCard() {
  const { ailments, ready, busy, save, canSave } = useSavedAilments();

  if (!canSave) return null;

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <HeartPulse className="size-3.5 text-primary" />
            Your ailments
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Saved so Find and Home can jump back to them.
          </p>
        </div>
        {ailments.length > 0 && (
          <Button
            asChild
            size="sm"
            className="shrink-0 cursor-pointer rounded-full"
          >
            <Link
              to={`/dashboard?conditions=${encodeURIComponent(ailments.join(","))}`}
            >
              Find for these
            </Link>
          </Button>
        )}
      </div>
      {!ready ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {CONDITIONS.map((name) => {
            const active = ailments.some(
              (item) => item.toLowerCase() === name.toLowerCase(),
            );
            return (
              <button
                key={name}
                type="button"
                disabled={busy}
                onClick={() => {
                  const next = active
                    ? ailments.filter(
                        (item) => item.toLowerCase() !== name.toLowerCase(),
                      )
                    : [...ailments, name];
                  void save(next);
                }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border/70 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                {name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
