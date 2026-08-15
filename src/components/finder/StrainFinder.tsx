import { recommendStrains as recommendStrainsCall } from "@/lib/strain-api";
import { useEffect, useMemo, useRef, useState } from "react";
import { ResearchReveal, celebrateResult } from "@/components/finder/ResearchReveal";
import { cacheKey, cachedRun } from "@/lib/ai-cache";
import { sourceSummary } from "@/lib/source-summary";
import {
  loadResearch,
  rememberCloud,
  rememberLocal,
} from "@/lib/research-history";
import { useAuth } from "@/hooks/use-auth";
import { SaveStrainButton } from "@/components/saved/SaveStrainButton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StrainDetailCard } from "@/components/compare/StrainDetailCard";
import { PatientPrefsFields } from "@/components/finder/PatientPrefsFields";
import {
  compactPrefs,
  type ResearchPrefs,
} from "@/lib/research-prefs";
import { CONDITIONS, TYPE_LABEL, typeBadgeClass } from "@/lib/strain-ui";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  GitCompareArrows,
  HeartPulse,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";

type Potency = "" | "mild" | "balanced" | "strong";

const POTENCY_OPTIONS: { value: Potency; label: string; hint: string }[] = [
  { value: "", label: "Any", hint: "No preference" },
  { value: "mild", label: "Mild", hint: "THC under ~15%" },
  { value: "balanced", label: "Balanced", hint: "THC 15–22%" },
  { value: "strong", label: "Strong", hint: "THC above ~22%" },
];

const QUICK_AILMENTS = ["Insomnia", "Chronic pain", "Anxiety", "Migraine"];

const RESEARCH_STEPS = [
  "Pulling full Leafly & Weedmaps profiles…",
  "Collecting Reddit quotes for your symptoms…",
  "Ranking the best strains with MiniMax AI…",
];

export function StrainFinder({
  onCompare,
  restoreId,
}: {
  onCompare: (names: string[], focus: string[]) => void;
  restoreId?: string;
}) {
  type RecommendResult = Awaited<ReturnType<typeof recommendStrainsCall>>;

  const { user } = useAuth();
  const [ailments, setAilments] = useState<string[]>([]);
  const [searched, setSearched] = useState<string[]>([]);
  const [customAilment, setCustomAilment] = useState("");
  const [potency, setPotency] = useState<Potency>("");
  const [prefs, setPrefs] = useState<ResearchPrefs>({});
  const [result, setResult] = useState<RecommendResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!restoreId) return;
    let cancelled = false;
    void loadResearch(restoreId).then((stored) => {
      if (cancelled || !stored || stored.kind !== "find") return;
      const args = stored.args as { conditions?: string[] };
      if (Array.isArray(args.conditions)) setSearched(args.conditions);
      setResult(stored.result as RecommendResult);
    });
    return () => {
      cancelled = true;
    };
  }, [restoreId]);

  // Cycle through research status messages while a search runs.
  useEffect(() => {
    if (!isRunning) {
      setStepIndex(0);
      return;
    }
    const timer = setInterval(
      () => setStepIndex((i) => Math.min(i + 1, RESEARCH_STEPS.length - 1)),
      1600,
    );
    return () => clearInterval(timer);
  }, [isRunning]);

  // Scroll the results into view once a search finishes rendering.
  useEffect(() => {
    if (!result) return;
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  const toggleAilment = (name: string) => {
    setAilments((prev) =>
      prev.some((a) => a.toLowerCase() === name.toLowerCase())
        ? prev.filter((a) => a.toLowerCase() !== name.toLowerCase())
        : [...prev, name],
    );
  };

  const addCustomAilment = () => {
    const trimmed = customAilment.trim();
    if (trimmed === "") return;
    toggleAilment(trimmed);
    setCustomAilment("");
  };

  const removeAilment = (name: string) =>
    setAilments((prev) =>
      prev.filter((a) => a.toLowerCase() !== name.toLowerCase()),
    );

  const customAilments = ailments.filter(
    (a) => !CONDITIONS.some((c) => c.toLowerCase() === a.toLowerCase()),
  );

  const handleFind = async (
    targets: string[] = ailments,
    pref: Potency = potency,
  ) => {
    if (targets.length === 0 || isRunning) return;
    setIsRunning(true);
    setError(null);
    setSearched(targets);
    try {
      const args = {
        conditions: targets,
        potency: pref === "" ? undefined : pref,
        prefs: compactPrefs(prefs),
      };
      const res = await cachedRun(
        cacheKey("recommend", args),
        () => recommendStrainsCall(args),
      );
      setResult(res);
      celebrateResult();
      if (res.resultId) {
        const entry = {
          id: res.resultId,
          kind: "find" as const,
          title: `Best strains for ${targets.join(", ")}`,
          createdAt: Date.now(),
        };
        rememberLocal(entry);
        if (user) void rememberCloud(user.uid, entry);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setIsRunning(false);
    }
  };

  const resetSearch = () => {
    setResult(null);
    setError(null);
    setAilments([]);
    setSearched([]);
    setPotency("");
    setPrefs({});
  };

  const profilesByName = useMemo(() => {
    const map = new Map<string, RecommendResult["strains"][number]>();
    for (const s of result?.strains ?? []) map.set(s.name.toLowerCase(), s);
    return map;
  }, [result]);

  const topNames =
    result?.recommendations.slice(0, 3).map((r) => r.strainName) ?? [];

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[340px_1fr]">
      {/* ── Config panel ───────────────────────────────── */}
      <aside className="min-w-0 lg:sticky lg:top-24">
        <Card className="border-border/70">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartPulse className="size-4 text-primary" />
              Find best strains
            </CardTitle>
            <CardDescription>
              Tell us what you&apos;re treating — we&apos;ll research the strains
              patients report work best for it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Ailments */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                1 · What are you treating?
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CONDITIONS.map((c) => {
                  const active = ailments.some(
                    (a) => a.toLowerCase() === c.toLowerCase(),
                  );
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleAilment(c)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/70 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  value={customAilment}
                  onChange={(e) => setCustomAilment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomAilment();
                    }
                  }}
                  placeholder="Any other symptom — e.g. sciatica…"
                  className="h-9"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 cursor-pointer"
                  onClick={addCustomAilment}
                >
                  <Plus className="size-4" />
                  Add
                </Button>
              </div>
              {customAilments.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {customAilments.map((a) => (
                    <span
                      key={a}
                      className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 py-1 pl-3 pr-1.5 text-xs font-medium text-primary"
                    >
                      {a}
                      <button
                        type="button"
                        aria-label={`Remove ${a}`}
                        className="rounded-full p-0.5 transition-colors hover:bg-primary/15"
                        onClick={() => removeAilment(a)}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Potency */}
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                2 · Potency preference (optional)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {POTENCY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPotency(opt.value)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      potency === opt.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/70 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {potency !== "" && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {POTENCY_OPTIONS.find((o) => o.value === potency)?.hint}
                </p>
              )}
            </div>

            <PatientPrefsFields prefs={prefs} onChange={setPrefs} startAt={3} />

            {/* Run */}
            <div className="space-y-2 pt-1">
              <Button
                type="button"
                className="w-full cursor-pointer rounded-full"
                size="lg"
                disabled={ailments.length === 0 || isRunning}
                onClick={() => void handleFind()}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Researching…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Find best strains
                  </>
                )}
              </Button>
              {ailments.length === 0 && (
                <p className="text-center text-xs text-muted-foreground">
                  Pick a symptom or two to get started.
                </p>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertTitle>Search failed</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </aside>

      {/* ── Results ─────────────────────────────────────── */}
      <section ref={resultsRef} className="min-w-0 scroll-mt-24">
        {isRunning ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card px-8 py-20 text-center">
            <Loader2 className="size-9 animate-spin text-primary" />
            <p className="mt-6 text-base font-semibold tracking-tight">
              {RESEARCH_STEPS[stepIndex]}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Ranking full strain profiles against your symptoms and attaching
              Reddit quotes when we find them — usually 8–20 seconds.
            </p>
          </div>
        ) : result ? (
          <div className="space-y-8">
            <ResearchReveal className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  Top picks
                </p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  Best strains for {searched.join(", ")}
                  {(potency !== "" || prefs.timeOfDay) && (
                    <span className="text-muted-foreground">
                      {potency !== "" ? ` · ${potency} potency` : ""}
                      {prefs.timeOfDay && prefs.timeOfDay !== "anytime"
                        ? ` · ${prefs.timeOfDay}`
                        : ""}
                    </span>
                  )}
                </h1>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="cursor-pointer rounded-full"
                onClick={resetSearch}
              >
                New search
              </Button>
            </ResearchReveal>

            <ResearchReveal delay={0.08} className="rounded-2xl border border-border/70 bg-card px-6 py-6 sm:px-8">
              <h2 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
                {result.headline}
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
                {result.summary}
              </p>
              <p className="mt-4 text-xs text-muted-foreground">
                {sourceSummary(result.strains)}
              </p>
            </ResearchReveal>

            <ResearchReveal delay={0.16} className="space-y-3">
              {result.recommendations.map((r, i) => {
                const profile = profilesByName.get(r.strainName.toLowerCase());
                return (
                  <div
                    key={`${r.strainName}-${i}`}
                    className="rounded-2xl border border-border/70 bg-card p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {i + 1}
                        </span>
                        <h3 className="text-base font-semibold tracking-tight">
                          {r.strainName}
                        </h3>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <SaveStrainButton
                          profile={
                            profile ?? {
                              name: r.strainName,
                              inKnowledgeBase: false,
                            }
                          }
                        />
                        {profile?.type && (
                          <Badge
                            className={cn(
                              typeBadgeClass(profile.type),
                              "capitalize",
                            )}
                          >
                            {TYPE_LABEL[profile.type]}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">
                      {r.reason}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {r.bestFor && (
                        <span className="rounded-full bg-primary/8 px-2.5 py-1 text-xs font-medium text-primary">
                          Best for: {r.bestFor}
                        </span>
                      )}
                      {r.caution && (
                        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700">
                          Caution: {r.caution}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </ResearchReveal>

            <ResearchReveal delay={0.24} className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold tracking-tight">
                  Narrowed it down?
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Turn your top picks into a full side-by-side comparison with
                  differences, common ground, and cautions.
                </p>
              </div>
              <Button
                type="button"
                className="cursor-pointer rounded-full"
                disabled={topNames.length < 2}
                onClick={() => onCompare(topNames, searched)}
              >
                <GitCompareArrows className="size-4" />
                Compare the top picks
              </Button>
            </ResearchReveal>
            {topNames.length < 2 && (
              <p className="-mt-4 text-xs text-muted-foreground">
                Add at least two recommendations to compare — or use the
                compare tab to pick your own strains.
              </p>
            )}

            {result.strains.length > 0 && (
              <div
                className={cn(
                  "grid gap-6",
                  result.strains.length === 3
                    ? "md:grid-cols-2 xl:grid-cols-3"
                    : "md:grid-cols-2",
                )}
              >
                {result.strains.map((s) => (
                  <StrainDetailCard key={s.name} strain={s} />
                ))}
              </div>
            )}

            <p className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
              <Sparkles className="size-3.5 shrink-0 text-primary" />
              Recommendations generated with MiniMax-M2.5-highspeed from
              aggregated public sources. Not medical advice — consult your
              healthcare provider.
            </p>
          </div>
        ) : (
          /* ── Empty state ─────────────────────────────── */
          <div className="space-y-8">
            <div className="rounded-2xl border border-border/70 bg-card px-8 py-12 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <HeartPulse className="size-7" />
              </div>
              <h1 className="mt-5 text-2xl font-semibold tracking-tight">
                Start with your symptoms
              </h1>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Pick what you&apos;re treating on the left — or jump in with a
                common starting point below. The AI ranks Leafly&apos;s strains by
                what patients report works best.
              </p>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quick starts
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {QUICK_AILMENTS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    disabled={isRunning}
                    onClick={() => {
                      setAilments([a]);
                      void handleFind([a]);
                    }}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-5 py-4 text-left transition-[border-color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-primary/40 disabled:opacity-50"
                  >
                    <div>
                      <p className="text-sm font-semibold tracking-tight">
                        Best strains for {a}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Researched across Leafly, Weedmaps &amp; Reddit
                      </p>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
