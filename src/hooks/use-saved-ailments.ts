import { useAuth } from "@/hooks/use-auth";
import {
  listenToSavedAilments,
  saveAilments,
} from "@/lib/saved-ailments";
import { db } from "@/lib/firebase";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function useSavedAilments() {
  const { user } = useAuth();
  const [ailments, setAilments] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!db || !user) {
      setAilments([]);
      setReady(true);
      return;
    }
    setReady(false);
    return listenToSavedAilments(user.uid, (list) => {
      setAilments(list);
      setReady(true);
    });
  }, [user?.uid]);

  const save = async (next: string[]) => {
    if (!db || !user || busy) return;
    setBusy(true);
    try {
      await saveAilments(user.uid, next);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save ailments.");
    } finally {
      setBusy(false);
    }
  };

  return { ailments, ready, busy, save, canSave: Boolean(db && user) };
}
