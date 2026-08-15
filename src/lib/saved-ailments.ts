import { doc, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";

export const AILMENT_MAX = 16;
export const AILMENT_NAME_MAX = 47;

export function clipAilment(name: string): string {
  return name.trim().slice(0, AILMENT_NAME_MAX);
}

export function normalizeAilments(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== "string") continue;
    const name = clipAilment(item);
    if (name === "") continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= AILMENT_MAX) break;
  }
  return out;
}

export function ailmentsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map((item) => item.toLowerCase()).sort();
  const right = b.map((item) => item.toLowerCase()).sort();
  return left.every((item, i) => item === right[i]);
}

export function listenToSavedAilments(
  uid: string,
  cb: (list: string[]) => void,
): Unsubscribe {
  if (!db) {
    cb([]);
    return () => {};
  }
  return onSnapshot(
    doc(db, "users", uid),
    (snap) => {
      cb(normalizeAilments(snap.data()?.ailments));
    },
    () => cb([]),
  );
}

export async function saveAilments(uid: string, ailments: string[]): Promise<void> {
  if (!db) throw new Error("Firebase isn't configured.");
  await setDoc(
    doc(db, "users", uid),
    {
      ailments: normalizeAilments(ailments),
      ailmentsUpdatedAt: Date.now(),
    },
    { merge: true },
  );
}
