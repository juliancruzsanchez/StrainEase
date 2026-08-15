import { useAuth } from "@/hooks/use-auth";
import {
  addNote,
  listenToSavedStrains,
  saveStrain,
  slugify,
  type SavedNote,
  type SavedStrain,
} from "@/lib/saved-strains";
import { db } from "@/lib/firebase";
import type { StrainProfile } from "@/lib/strain-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Loader2, NotebookPen, Plus } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export function TriedNotes({ profile }: { profile: StrainProfile }) {
  const { user, isAuthenticated } = useAuth();
  const [saved, setSaved] = useState<SavedStrain | null>(null);
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!db || !user) {
      setSaved(null);
      setReady(true);
      return;
    }
    const key = slugify(profile.name);
    return listenToSavedStrains(user.uid, (list) => {
      setSaved(list.find((item) => item.slug === key) ?? null);
      setReady(true);
    });
  }, [user?.uid, profile.name]);

  if (!isAuthenticated || !db) return null;

  const notes: SavedNote[] = saved?.notes ?? [];

  const submit = async () => {
    if (!user || busy) return;
    const text = draft.trim();
    if (text === "") return;
    setBusy(true);
    try {
      if (!saved) await saveStrain(user.uid, profile);
      await addNote(user.uid, slugify(profile.name), text, false, user.name, profile.name);
      setDraft("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save the note.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-6">
      <p className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <NotebookPen className="size-3.5 text-primary" />
        Your notes
      </p>
      <p className="mb-4 text-sm leading-6 text-muted-foreground">
        Private notes on how this strain felt when you tried it.
      </p>

      {!ready ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : notes.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Nothing here yet — one sentence is enough to start a record.
        </p>
      ) : (
        <ul className="mb-4 space-y-2.5">
          {notes.map((note) => (
            <li
              key={note.id}
              className="rounded-xl border border-border/60 bg-background px-4 py-3"
            >
              <p className="text-sm leading-6">{note.text}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {new Date(note.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="How did this one treat you?"
          className="h-9"
        />
        <Button
          type="button"
          size="sm"
          className={cn("shrink-0 cursor-pointer rounded-full")}
          disabled={busy || draft.trim() === ""}
          onClick={() => void submit()}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Save note
        </Button>
      </div>
    </div>
  );
}
