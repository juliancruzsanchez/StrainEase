import { useAuth } from "@/hooks/use-auth";
import {
  compareStrains as compareStrainsCall,
  popularStrains as popularStrainsCall,
  searchStrain as searchStrainCall,
} from "@/lib/strain-api";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import logo from "@/assets/logo.svg";
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
import { AnalysisPanel } from "@/components/compare/AnalysisPanel";
import { StrainDetailCard } from "@/components/compare/StrainDetailCard";
import { PatientPrefsFields } from "@/components/finder/PatientPrefsFields";
import { StrainFinder } from "@/components/finder/StrainFinder";
import { HistoryPanel } from "@/components/saved/HistoryPanel";
import { SavedStrainsPanel } from "@/components/saved/SavedStrainsPanel";
import { ResearchReveal, celebrateResult } from "@/components/finder/ResearchReveal";
import { cacheKey, cachedRun } from "@/lib/ai-cache";
import { sourceSummary } from "@/lib/source-summary";
import {
  loadResearch,
  rememberCloud,
  rememberLocal,
} from "@/lib/research-history";
import {
  compactPrefs,
  type ResearchPrefs,
} from "@/lib/research-prefs";
import { CONDITIONS, typeBadgeClass, TYPE_LABEL } from "@/lib/strain-ui";
import { cn } from "@/lib/utils";
import type { StrainProfile } from "@/lib/strain-profile";
import {
  ArrowRight,
  Bookmark,
  Check,
  Clock,
  FlaskConical,
  GitCompareArrows,
  HeartPulse,
  Loader2,
  LogOut,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";

const QUICK_PICKS: { label: string; condition: string; strains: string[] }[] = [
  {
    label: "Chronic pain",
    condition: "Chronic pain",
    strains: ["Blue Dream", "OG Kush"],
  },
  {
    label: "Insomnia",
    condition: "Insomnia",
    strains: ["Granddaddy Purple", "Northern Lights"],
  },
  {
    label: "Anxiety",
    condition: "Anxiety",
    strains: ["Blue Dream", "Gelato"],
  },
  {
    label: "Depression & fatigue",
    condition: "Depression",
    strains: ["Jack Herer", "Sour Diesel"],
  },
];

const RESEARCH_STEPS = [
  "Pulling full profiles from Leafly & Weedmaps…",
  "Collecting Reddit quotes for your ailments…",
  "Synthesizing the comparison with MiniMax AI…",
];

type SearchOutcome =
  | { type: "found"; profile: StrainProfile }
  | { type: "missing"; name: string }
  | null;

export default function Dashboard() {
  const { user, isAuthenticated, signOut } = useAuth();
  const { rid } = useParams();
  const location = useLocation();

  type CompareResult = Awaited<ReturnType<typeof compareStrainsCall>>;

  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [condition, setCondition] = useState<string[]>([]);
  const [prefs, setPrefs] = useState<ResearchPrefs>({});
  const [query, setQuery] = useState("");
  const [popular, setPopular] = useState<StrainProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchOutcome, setSearchOutcome] = useState<SearchOutcome>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [mode, setMode] = useState<"find" | "compare" | "saved" | "history">(
    location.pathname.startsWith("/compare") ? "compare" : "find",
  );
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rid) return;
    let cancelled = false;
    void loadResearch(rid).then((stored) => {
      if (cancelled || !stored) return;
      if (stored.kind === "compare") {
        setMode("compare");
        setResult(stored.result as CompareResult);
      } else {
        setMode("find");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rid]);

  // Load Leafly's popular strains once for quick-pick suggestions.
  useEffect(() => {
    let cancelled = false;
    void popularStrainsCall()
      .then((list) => {
        if (!cancelled) setPopular(list);
      })
      .catch(() => {
        // Leafly unreachable — suggestions simply stay empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Cycle through research status messages while a comparison runs.
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

  // Scroll the results into view once a comparison finishes rendering.
  useEffect(() => {
    if (!result) return;
    resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [result]);

  const toggleStrainName = (name: string) => {
    setSelectedNames((prev) => {
      const lower = name.toLowerCase();
      if (prev.some((n) => n.toLowerCase() === lower)) {
        return prev.filter((n) => n.toLowerCase() !== lower);
      }
      if (prev.length >= 3) return prev;
      return [...prev, name];
    });
  };

  const addCustomStrain = (name: string) => {
    toggleStrainName(name);
    setQuery("");
    setSearchOutcome(null);
  };

  const toggleCondition = (c: string) => {
    setCondition((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
    );
  };

  const runSearch = async (name: string) => {
    const q = name.trim();
    if (q === "" || isSearching) return;
    setIsSearching(true);
    setSearchOutcome(null);
    try {
      const profile = await searchStrainCall(q);
      setSearchOutcome(
        profile ? { type: "found", profile } : { type: "missing", name: q },
      );
    } catch {
      setSearchOutcome({ type: "missing", name: q });
    } finally {
      setIsSearching(false);
    }
  };

  const handleCompare = async (
    names: string[] = selectedNames,
    focus: string[] = condition,
  ) => {
    if (names.length < 2 || isRunning) return;
    setIsRunning(true);
    setError(null);
    try {
      const args = {
        strainNames: names,
        condition: focus.length > 0 ? focus : undefined,
        prefs: compactPrefs(prefs),
      };
      const comparison = await cachedRun(
        cacheKey("compare", args),
        () => compareStrainsCall(args),
      );
      setResult(comparison);
      celebrateResult();
      if (comparison.resultId) {
        const entry = {
          id: comparison.resultId,
          kind: "compare" as const,
          title: `${names.join(" vs. ")}${focus.length ? ` · ${focus.join(", ")}` : ""}`,
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

  const applyQuickPick = async (pick: (typeof QUICK_PICKS)[number]) => {
    setSelectedNames(pick.strains);
    setCondition([pick.condition]);
    setResult(null);
    setQuery("");
    setSearchOutcome(null);
    await handleCompare(pick.strains, [pick.condition]);
  };

  const resetComparison = () => {
    setResult(null);
    setError(null);
    setSelectedNames([]);
    setCondition([]);
    setPrefs({});
    setQuery("");
    setSearchOutcome(null);
  };

  const startCompareFromFinder = (names: string[], focus: string[]) => {
    setMode("compare");
    setSelectedNames(names);
    setCondition(focus);
    setResult(null);
    setQuery("");
    setSearchOutcome(null);
    void handleCompare(names, focus);
  };

  const atCap = selectedNames.length >= 3;

  // Instant name matches within the popular list as the user types.
  const instantMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return [];
    return popular
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 5);
  }, [query, popular]);

  return (
    <main className="min-h-screen overflow-x-clip bg-background text-foreground">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src={logo}
              alt="StrainWise logo"
              width={30}
              height={30}
              className="rounded-lg"
            />
            <span className="text-base font-semibold tracking-tight">
              StrainWise
            </span>
          </Link>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                {user?.name && (
                  <span className="hidden text-sm text-muted-foreground sm:block">
                    {user.name}
                  </span>
                )}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="cursor-pointer gap-2"
                  onClick={() => void signOut()}
                >
                  <LogOut className="size-4" />
                  Sign out
                </Button>
              </>
            ) : (
              <Button asChild size="sm" className="cursor-pointer rounded-full">
                <Link to="/auth?returnTo=/dashboard">Sign in to save</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* ── Mode tabs ─────────────────────────────────────── */}
        <div className="mb-8 flex justify-center">
          <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border/70 bg-card p-1">
            <button
              type="button"
              onClick={() => setMode("find")}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors sm:px-4",
                mode === "find"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <HeartPulse className="size-4" />
              <span className="sm:hidden">Find</span>
              <span className="hidden sm:inline">Find for ailments</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("compare")}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors sm:px-4",
                mode === "compare"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <GitCompareArrows className="size-4" />
              Compare
              <span className="hidden sm:inline">strains</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("saved")}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors sm:px-4",
                mode === "saved"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Bookmark className="size-4" />
              Saved
              <span className="hidden sm:inline">strains</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("history")}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors sm:px-4",
                mode === "history"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Clock className="size-4" />
              History
            </button>
          </div>
        </div>

        {/* ── Strain finder (main focus) ────────────────────── */}
        {!isAuthenticated && (
          <p className="mb-6 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            You can research without an account.{" "}
            <Link to="/auth?returnTo=/dashboard" className="font-medium text-primary">
              Sign in
            </Link>{" "}
            to save strains and keep a private relief log.
          </p>
        )}

        <div className={cn(mode !== "find" && "hidden")}>
          <StrainFinder
            onCompare={startCompareFromFinder}
            restoreId={
              location.pathname.startsWith("/find/") ? rid : undefined
            }
          />
        </div>

        {/* ── Saved strains ────────────────────────────────── */}
        <div className={cn(mode !== "saved" && "hidden")}>
          {isAuthenticated ? (
            <SavedStrainsPanel />
          ) : (
            <div className="rounded-2xl border border-border/70 bg-card px-8 py-12 text-center">
              <Bookmark className="mx-auto size-8 text-primary" />
              <h2 className="mt-4 text-lg font-semibold tracking-tight">
                Sign in to save strains
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Research is free. Saving favorites and notes needs an account.
              </p>
              <Button asChild className="mt-6 cursor-pointer rounded-full">
                <Link to="/auth?returnTo=/dashboard">Sign in</Link>
              </Button>
            </div>
          )}
        </div>

        <div className={cn(mode !== "history" && "hidden")}>
          <HistoryPanel />
        </div>

        {/* ── Compare workspace (secondary) ─────────────────── */}
        <div
          className={cn(
            "grid items-start gap-8 lg:grid-cols-[340px_1fr]",
            mode !== "compare" && "hidden",
          )}
        >
          {/* ── Config panel ───────────────────────────────── */}
          <aside className="min-w-0 lg:sticky lg:top-24">
            <Card className="border-border/70">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FlaskConical className="size-4 text-primary" />
                  New comparison
                </CardTitle>
                <CardDescription>
                  Pick 2–3 strains. Search pulls live data from Leafly — no
                  database to maintain. Type any strain name and press Enter.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Strain picker */}
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    1 · Choose strains (2–3)
                  </p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setSearchOutcome(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void runSearch(query);
                        }
                      }}
                      placeholder="Search Leafly — e.g. Blue Dream…"
                      className="pl-9"
                    />
                    {isSearching && (
                      <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                  </div>

                  {selectedNames.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {selectedNames.map((name) => (
                        <span
                          key={name}
                          className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 py-1 pl-3 pr-1.5 text-xs font-medium text-primary"
                        >
                          {name}
                          <button
                            type="button"
                            aria-label={`Remove ${name}`}
                            className="cursor-pointer rounded-full p-0.5 transition-colors hover:bg-primary/15"
                            onClick={() => toggleStrainName(name)}
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Search outcome (Enter search) */}
                  {searchOutcome?.type === "found" && (
                    <StrainRow
                      name={searchOutcome.profile.name}
                      subtitle={[
                        searchOutcome.profile.thcRange
                          ? `THC ${searchOutcome.profile.thcRange}`
                          : null,
                        searchOutcome.profile.effects
                          ?.slice(0, 2)
                          .map((e) => e.name)
                          .join(" · "),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      type={searchOutcome.profile.type}
                      isSelected={selectedNames.some(
                        (n) =>
                          n.toLowerCase() ===
                          searchOutcome.profile.name.toLowerCase(),
                      )}
                      disabled={atCap}
                      onClick={() =>
                        toggleStrainName(searchOutcome.profile.name)
                      }
                    />
                  )}
                  {searchOutcome?.type === "missing" && (
                    <div className="mt-2">
                      <button
                        type="button"
                        disabled={atCap}
                        onClick={() => addCustomStrain(searchOutcome.name)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-3.5 py-2.5 text-left transition-colors hover:border-primary/70 hover:bg-primary/10",
                          atCap && "cursor-not-allowed opacity-40",
                        )}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            Use “{searchOutcome.name}”
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            Not found on Leafly — the AI will research it during
                            the comparison
                          </p>
                        </div>
                        <Plus className="size-4 shrink-0 text-primary" />
                      </button>
                    </div>
                  )}

                  {/* Instant matches + popular suggestions */}
                  {query.trim() === "" ? (
                    popular.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Popular on Leafly right now
                        </p>
                        <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border/70 bg-background p-1">
                          {popular.slice(0, 10).map((p) => (
                            <StrainRow
                              key={p.name}
                              name={p.name}
                              subtitle={[
                                p.thcRange ? `THC ${p.thcRange}` : null,
                                p.communityNotes?.[0]?.text,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                              type={p.type}
                              isSelected={selectedNames.some(
                                (n) => n.toLowerCase() === p.name.toLowerCase(),
                              )}
                              disabled={atCap}
                              onClick={() => toggleStrainName(p.name)}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  ) : (
                    <>
                      {instantMatches.length > 0 && (
                        <div className="mt-2">
                          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            Matches in popular strains
                          </p>
                          <div className="space-y-1">
                            {instantMatches.map((p) => (
                              <StrainRow
                                key={p.name}
                                name={p.name}
                                subtitle={p.thcRange ? `THC ${p.thcRange}` : ""}
                                type={p.type}
                                isSelected={selectedNames.some(
                                  (n) =>
                                    n.toLowerCase() === p.name.toLowerCase(),
                                )}
                                disabled={atCap}
                                onClick={() => toggleStrainName(p.name)}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      {!isSearching && !searchOutcome && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Press Enter to search Leafly for “{query}”.
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* Condition focus */}
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    2 · Condition focus (optional — pick several)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {CONDITIONS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleCondition(c)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          condition.includes(c)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border/70 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>

                <PatientPrefsFields
                  prefs={prefs}
                  onChange={setPrefs}
                  startAt={3}
                />

                {/* Run */}
                <div className="space-y-2 pt-1">
                  <Button
                    type="button"
                    className="w-full cursor-pointer rounded-full"
                    size="lg"
                    disabled={selectedNames.length < 2 || isRunning}
                    onClick={() => void handleCompare()}
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Researching…
                      </>
                    ) : (
                      <>
                        <Sparkles className="size-4" />
                        Compare strains
                      </>
                    )}
                  </Button>
                  {selectedNames.length < 2 && (
                    <p className="text-center text-xs text-muted-foreground">
                      Select at least two strains to compare.
                    </p>
                  )}
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertTitle>Comparison failed</AlertTitle>
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
                <div className="relative">
                  <Loader2 className="size-9 animate-spin text-primary" />
                </div>
                <p className="mt-6 text-base font-semibold tracking-tight">
                  {RESEARCH_STEPS[stepIndex]}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Full profiles from Leafly and Weedmaps, plus Reddit quotes
                  when patients mention your symptoms — usually 8–20 seconds.
                </p>
              </div>
            ) : result ? (
              <div className="space-y-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                      Your comparison
                    </p>
                    <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                      {result.strains.map((s) => s.name).join(" vs. ")}
                      {result.analysis.forCondition && (
                        <span className="text-muted-foreground">
                          {" "}
                          · for{" "}
                          {condition.length > 0
                            ? condition.join(", ")
                            : "your condition"}
                        </span>
                      )}
                    </h1>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="cursor-pointer rounded-full"
                    onClick={resetComparison}
                  >
                    New comparison
                  </Button>
                </div>

                <ResearchReveal>
                  <AnalysisPanel analysis={result.analysis} />
                  <p className="mt-3 text-xs text-muted-foreground">
                    {sourceSummary(result.strains)}
                  </p>
                </ResearchReveal>

                <div
                  className={cn(
                    "grid gap-6",
                    result.strains.length === 3
                      ? "md:grid-cols-2 xl:grid-cols-3"
                      : "md:grid-cols-2",
                  )}
                >
                  {result.strains.map((s) => {
                    const best = result.analysis.forCondition?.best;
                    const runnerUp = result.analysis.forCondition?.runnerUp;
                    const norm = (v: string) => v.trim().toLowerCase();
                    let badge: "best" | "runnerUp" | null = null;
                    if (best && norm(s.name) === norm(best)) badge = "best";
                    else if (runnerUp && norm(s.name) === norm(runnerUp))
                      badge = "runnerUp";
                    return (
                      <StrainDetailCard key={s.name} strain={s} badge={badge} />
                    );
                  })}
                </div>

                <p className="flex items-center gap-2 text-xs leading-5 text-muted-foreground">
                  <Sparkles className="size-3.5 shrink-0 text-primary" />
                  Comparison generated with MiniMax-M2.5-highspeed from live
                  Leafly data. Not medical advice — consult your healthcare
                  provider.
                </p>
              </div>
            ) : (
              /* ── Empty state ─────────────────────────────── */
              <div className="space-y-8">
                <div className="rounded-2xl border border-border/70 bg-card px-8 py-12 text-center">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <FlaskConical className="size-7" />
                  </div>
                  <h1 className="mt-5 text-2xl font-semibold tracking-tight">
                    Pick two or three strains to begin
                  </h1>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                    Search any strain by name — profiles are pulled live from
                    Leafly. Save your favorites and keep private notes, or
                    share them with other patients.
                  </p>
                </div>

                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Quick starts
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {QUICK_PICKS.map((pick) => (
                      <button
                        key={pick.label}
                        type="button"
                        disabled={isRunning}
                        onClick={() => void applyQuickPick(pick)}
                        className="group flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-5 py-4 text-left transition-[border-color,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-primary/40 disabled:opacity-50"
                      >
                        <div>
                          <p className="text-sm font-semibold tracking-tight">
                            {pick.strains.join(" vs. ")}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            Focus: {pick.condition}
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
      </div>
    </main>
  );
}

function StrainRow({
  name,
  subtitle,
  type,
  isSelected,
  disabled,
  onClick,
}: {
  name: string;
  subtitle?: string;
  type?: string;
  isSelected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors",
        isSelected ? "bg-primary/5" : "hover:bg-accent/60",
        disabled && !isSelected && "cursor-not-allowed opacity-40",
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {type && (
          <Badge className={cn(typeBadgeClass(type), "capitalize")}>
            {TYPE_LABEL[type] ?? type}
          </Badge>
        )}
        {isSelected ? (
          <Check className="size-4 text-primary" />
        ) : (
          <Plus className="size-4 text-muted-foreground" />
        )}
      </div>
    </button>
  );
}

