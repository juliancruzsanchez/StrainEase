import {
  listenToHistory,
  listLocalHistory,
  type HistoryEntry,
} from "@/lib/research-history";
import { useAuth } from "@/hooks/use-auth";
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

export function HistoryPanel() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<HistoryEntry[]>(() =>
    listLocalHistory(),
  );

  useEffect(() => {
    if (!user) {
      setEntries(listLocalHistory());
      return;
    }
    return listenToHistory(user.uid, setEntries);
  }, [user]);

  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-border/70 bg-card px-8 py-12 text-center">
        <Clock className="mx-auto size-8 text-primary" />
        <h2 className="mt-4 text-lg font-semibold tracking-tight">
          No past searches yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          After you find or compare strains, they land here so you can reopen
          the exact result.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">Past research</h2>
      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            <Link
              to={
                entry.kind === "compare"
                  ? `/compare/${entry.id}`
                  : `/find/${entry.id}`
              }
              className="flex items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-5 py-4 hover:border-primary/40"
            >
              <div>
                <p className="text-sm font-semibold tracking-tight">
                  {entry.title}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {entry.kind === "compare" ? "Comparison" : "Find"} ·{" "}
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
              </div>
              <Clock className="size-4 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
