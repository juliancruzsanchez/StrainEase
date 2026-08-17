import type { QuoteNote } from "@/lib/quotes";
import type { RedditSource } from "@/lib/strain-profile";
import { RedditThreads } from "@/components/compare/RedditThreads";
import {
  Award,
  Brain,
  CheckCircle2,
  ExternalLink,
  GitCompareArrows,
  MessageCircle,
  Quote,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";

export type StrainAnalysis = {
  headline: string;
  summary: string;
  forCondition: {
    best: string;
    why: string;
    runnerUp: string;
  } | null;
  keyDifferences: string[];
  commonGround: string[];
  cautions: string[];
  redditSources?: RedditSource[];
};

function BulletList({
  title,
  items,
  icon,
  tone = "default",
}: {
  title: string;
  items: string[];
  icon: ReactNode;
  tone?: "default" | "warn";
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li
            key={i}
            className={`flex items-start gap-2.5 text-sm leading-6 ${
              tone === "warn" ? "text-amber-900 dark:text-amber-100/90" : ""
            }`}
          >
            {tone === "warn" ? (
              <TriangleAlert className="mt-1 size-3.5 shrink-0 text-amber-500" />
            ) : (
              <CheckCircle2 className="mt-1 size-3.5 shrink-0 text-primary" />
            )}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RedditThreadsBlock({ sources }: { sources: RedditSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="border-t border-border/60 px-6 py-6 sm:px-8">
      <RedditThreads
        sources={sources}
        title="Reddit threads for these strains"
        description="Pointed to from public discussion — surfaced from a curated list, not live-scraped."
      />
    </div>
  );
}

export function AnalysisPanel({
  analysis,
  quotes = [],
}: {
  analysis: StrainAnalysis;
  quotes?: { strain: string; note: QuoteNote }[];
}) {
  const { headline, summary, forCondition } = analysis;

  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      {/* Verdict header */}
      <div className="border-b border-border/60 bg-gradient-to-br from-primary/8 to-transparent px-6 py-6 sm:px-8">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="size-3.5" />
          AI comparison · Dr. Kaya
        </div>
        <h2 className="mt-3 text-xl font-semibold tracking-tight text-balance sm:text-2xl">
          {headline}
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
          {summary}
        </p>
        {quotes.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {quotes.map(({ strain, note }) => (
              <blockquote
                key={`${strain}-${note.source}`}
                className="rounded-xl border border-primary/20 bg-background/70 px-4 py-3"
              >
                <Quote className="mb-2 size-3.5 text-primary/60" />
                <p className="text-sm leading-6 text-foreground/90">
                  “{note.text}”
                </p>
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
                  {strain} · {note.source}
                </p>
              </blockquote>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-8 px-6 py-6 sm:px-8 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-7">
          {forCondition && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <Brain className="size-3.5" />
                Best for your condition
              </div>
              <p className="mt-2 text-base font-semibold tracking-tight">
                {forCondition.best}
              </p>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                {forCondition.why}
              </p>
              {forCondition.runnerUp && (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Award className="size-3.5 text-primary" />
                  Runner-up: <span className="font-medium text-foreground">{forCondition.runnerUp}</span>
                </p>
              )}
            </div>
          )}

          <BulletList
            title="Key differences"
            items={analysis.keyDifferences}
            icon={<GitCompareArrows className="size-3.5 text-primary" />}
          />
          <BulletList
            title="Where they agree"
            items={analysis.commonGround}
            icon={<CheckCircle2 className="size-3.5 text-primary" />}
          />
        </div>

        <div>
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-amber-600">
              <ShieldAlert className="size-3.5" />
              Cautions
            </div>
            <ul className="mt-3 space-y-2.5">
              {analysis.cautions.map((caution, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 text-sm leading-6 text-amber-900 dark:text-amber-100/90"
                >
                  <TriangleAlert className="mt-1 size-3.5 shrink-0 text-amber-500" />
                  <span>{caution}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <RedditThreadsBlock sources={analysis.redditSources ?? []} />
    </div>
  );
}
