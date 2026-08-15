import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";

const LOCAL_KEY = "strainwise:history:v1";

export type HistoryKind = "find" | "compare";

export type HistoryEntry = {
  id: string;
  kind: HistoryKind;
  title: string;
  createdAt: number;
};

export type StoredResearch = {
  kind: HistoryKind;
  args: Record<string, unknown>;
  result: unknown;
};

function readLocal(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(list: HistoryEntry[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    // quota
  }
}

export function rememberLocal(entry: HistoryEntry) {
  const next = [entry, ...readLocal().filter((e) => e.id !== entry.id)];
  writeLocal(next);
}

export function listLocalHistory(): HistoryEntry[] {
  return readLocal();
}

export async function rememberCloud(uid: string, entry: HistoryEntry) {
  if (!db) return;
  await setDoc(doc(db, "users", uid, "history", entry.id), {
    kind: entry.kind,
    title: entry.title,
    createdAt: entry.createdAt,
  });
}

export function listenToHistory(
  uid: string,
  cb: (list: HistoryEntry[]) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db!, "users", uid, "history")),
    (snap) => {
      const list: HistoryEntry[] = [];
      snap.forEach((d) => {
        const data = d.data() as Omit<HistoryEntry, "id">;
        list.push({ id: d.id, ...data });
      });
      cb(list.sort((a, b) => b.createdAt - a.createdAt));
    },
    () => cb([]),
  );
}

export async function removeHistory(uid: string, id: string) {
  if (!db) return;
  await deleteDoc(doc(db, "users", uid, "history", id));
}

export async function loadResearch(id: string): Promise<StoredResearch | null> {
  if (!db) return null;
  const snap = await getDoc(doc(db, "researchResults", id));
  if (!snap.exists()) return null;
  return snap.data() as StoredResearch;
}
