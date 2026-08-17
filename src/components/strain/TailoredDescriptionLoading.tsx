import { Loader2, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Status messages shown in rotation while the patient-tailored
 * description is being generated. Order follows what the backend is
 * actually doing: it loads the strain, then weighs the patient's
 * ailments, then their medications, then their past strain logs,
 * then settles on the final write.
 */
export const TAILORED_LOADING_MESSAGES = [
  "Loading strain data…",
  "Cross referencing your symptoms…",
  "Analyzing medications…",
  "Looking at past strain experiences…",
  "Almost done…",
] as const;

const ROTATE_INTERVAL_MS = 1600;

function useRotatingLoadingMessage(
  messages: readonly string[],
  isActive: boolean,
): string {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    // Reset to the first message whenever a new loading cycle starts.
    setIndex(0);
    if (!isActive) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % messages.length);
    }, ROTATE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isActive, messages.length]);
  return messages[index];
}

/**
 * Loading state shown inside the strain detail card while the
 * patient-tailored three-section description is being generated.
 *
 * Replaces the static `profile.description` paragraph for the duration
 * of the fetch so the patient sees a clear "we're writing this for
 * you" affordance instead of a static block that is about to be
 * replaced. Status messages rotate every ~1.6s so the patient always
 * has feedback that something is happening.
 */
export function TailoredDescriptionLoading() {
  const message = useRotatingLoadingMessage(TAILORED_LOADING_MESSAGES, true);
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="strain-tailored-description-loading"
      className="mt-3 flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3"
    >
      <Loader2
        className="size-4 shrink-0 animate-spin text-primary"
        aria-hidden
      />
      <p className="flex items-center gap-1.5 text-sm leading-6">
        <Sparkles className="size-3.5 text-primary" aria-hidden />
        <span className="shimmer-text">{message}</span>
      </p>
    </div>
  );
}
