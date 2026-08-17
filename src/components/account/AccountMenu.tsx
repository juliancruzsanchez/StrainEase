import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useMedications } from "@/hooks/use-medications";
import { clipMedicationName } from "@/lib/medications";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { LogOut, Pill, Plus, Settings, X } from "lucide-react";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "P";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function AccountMenu({
  onOpenSettings,
}: {
  /**
   * Called when the user picks "Account settings" inside the popover.
   * Wire it up to whatever opens your displayName / email editor.
   */
  onOpenSettings?: () => void;
} = {}) {
  const { user, signOut } = useAuth();
  const { list, add, remove, isLoading } = useMedications();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setDraft("");
  }, [open]);

  if (!user) return null;

  const submit = async () => {
    const trimmed = clipMedicationName(draft);
    if (trimmed === "") return;
    setBusy(true);
    try {
      await add(trimmed);
      setDraft("");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Could not save that medication.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Open account menu"
          className="flex cursor-pointer items-center gap-2.5 rounded-full border border-border/70 bg-card px-1.5 py-1 pr-3 text-sm transition-colors hover:border-primary/40"
        >
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden font-medium tracking-tight sm:inline">
            {user.name}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[22rem] max-w-[calc(100vw-2rem)] p-0"
      >
        {/* User card */}
        <div className="flex items-center gap-3 px-4 py-3">
          <Avatar className="size-9">
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
              {initials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight">
              {user.name}
            </p>
            {user.email && (
              <p className="truncate text-xs text-muted-foreground">
                {user.email}
              </p>
            )}
          </div>
        </div>

        <Separator />

        {/* Medications editor */}
        <div className="space-y-3 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Pill className="size-3.5 text-primary" />
              Medications
            </p>
            <span className="text-[11px] text-muted-foreground">
              {list.length === 0
                ? "None saved"
                : `${list.length} saved`}
            </span>
          </div>

          {isLoading ? (
            <p className="text-xs">
              <span className="shimmer-text">Loading…</span>
            </p>
          ) : list.length === 0 ? (
            <p className="text-xs leading-5 text-muted-foreground">
              Add anything you take — prescriptions, OTC, supplements. We&apos;ll
              keep this in mind every time you research strains.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {list.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 py-1 pl-3 pr-1.5 text-xs font-medium text-primary"
                >
                  {m.name}
                  <button
                    type="button"
                    aria-label={`Remove ${m.name}`}
                    className="cursor-pointer rounded-full p-0.5 transition-colors hover:bg-primary/15"
                    onClick={() => {
                      void remove(m.id);
                    }}
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder="e.g. Lexapro, ibuprofen…"
              className="h-8 text-xs"
              maxLength={80}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "shrink-0 cursor-pointer rounded-full",
                draft.trim() === "" && "cursor-not-allowed opacity-60",
              )}
              disabled={busy || draft.trim() === ""}
              onClick={() => void submit()}
            >
              <Plus className="size-3.5" />
              Add
            </Button>
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">
            We never tell you to stop a prescription — only to check with your
            clinician.
          </p>
        </div>

        <Separator />

        {onOpenSettings && (
          <>
            <div className="px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full cursor-pointer justify-start rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setOpen(false);
                  onOpenSettings();
                }}
              >
                <Settings className="size-4" />
                Account settings
              </Button>
            </div>
            <Separator />
          </>
        )}

        {/* Sign out */}
        <div className="px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full cursor-pointer justify-start rounded-full text-muted-foreground hover:text-foreground"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}