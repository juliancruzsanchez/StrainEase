import { HeroSpecimen } from "@/components/landing/HeroSpecimen";
import { StrainImage } from "@/components/strain/StrainImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { usePointerTilt } from "@/hooks/use-pointer-tilt";
import { popularStrains as popularStrainsCall } from "@/lib/strain-api";
import { slugify } from "@/lib/saved-strains";
import { applyCatalogPhotos, topMedicalUses } from "@/lib/strain-catalog";
import { CONDITIONS, TYPE_LABEL, typeBadgeClass } from "@/lib/strain-ui";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.svg";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  Brain,
  Globe,
  Leaf,
  MapPin,
  MessageCircle,
  Moon,
  Pill,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

const SOURCES = [
  { name: "Leafly", icon: Leaf },
  { name: "Weedmaps", icon: MapPin },
  { name: "Reddit", icon: MessageCircle },
  { name: "Google", icon: Globe },
  { name: "Dispensary menus", icon: Store },
];

const STEPS = [
  {
    icon: Search,
    step: "01",
    title: "Tell us your symptoms",
    body: "Pick from common conditions or type any symptom — sciatica, fibromyalgia, anything that's on your mind.",
  },
  {
    icon: Pill,
    step: "02",
    title: "Get the best-fit strains",
    body: "MiniMax AI ranks the strains patients report work best for your symptoms — with reasons, best-for notes, and cautions.",
  },
  {
    icon: Brain,
    step: "03",
    title: "Compare your top picks",
    body: "Turn the finalists into a side-by-side medical comparison: differences, common ground, and what to watch out for.",
  },
];

const SOURCE_DETAILS = [
  {
    icon: Leaf,
    title: "Leafly reviews",
    body: "Thousands of patient ratings on effects, potency and reported uses.",
  },
  {
    icon: MapPin,
    title: "Weedmaps listings",
    body: "How dispensaries describe and tag strains for medical shoppers.",
  },
  {
    icon: MessageCircle,
    title: "Reddit discussions",
    body: "First-hand patient experiences in r/trees, r/medicalmarijuana and r/MMJ.",
  },
  {
    icon: BookOpen,
    title: "Dispensary menus & Google",
    body: "Local availability, pricing context and the broader public record.",
  },
];

const SAMPLE_HITS = [
  {
    label: "01  Granddaddy Purple",
    value: "Deep grape-scented body calm that helps ease into sleep",
    icon: Moon,
  },
  {
    label: "02  Northern Lights",
    value: "Smooth, heavy relaxation — a dependable sleep aid",
    icon: Sparkles,
  },
  {
    label: "03  9 Pound Hammer",
    value: "Strong sedation for nights when nothing else works",
    icon: Zap,
  },
];

type FeaturedStrain = {
  name: string;
  type: string;
  thc: string;
  uses: string[];
  terpenes: string;
  description?: string;
  leaflyNote?: string;
  imageUrl?: string;
};

const FALLBACK_STRAINS: FeaturedStrain[] = [
  {
    name: "Blue Dream",
    type: "hybrid",
    thc: "17–24%",
    uses: ["Chronic pain", "Depression", "Stress"],
    terpenes: "Myrcene · Pinene · Caryophyllene",
  },
  {
    name: "Granddaddy Purple",
    type: "indica",
    thc: "17–23%",
    uses: ["Insomnia", "Chronic pain", "Muscle spasm"],
    terpenes: "Myrcene · Caryophyllene · Pinene",
  },
  {
    name: "Sour Diesel",
    type: "sativa",
    thc: "19–24%",
    uses: ["Stress", "Depression", "Chronic pain"],
    terpenes: "Caryophyllene · Limonene · Terpinolene",
  },
  {
    name: "Jack Herer",
    type: "sativa",
    thc: "18–23%",
    uses: ["ADHD", "Fatigue", "Depression"],
    terpenes: "Terpinolene · Pinene · Caryophyllene",
  },
  {
    name: "Gelato",
    type: "hybrid",
    thc: "20–25%",
    uses: ["Stress", "Anxiety", "Depression"],
    terpenes: "Caryophyllene · Limonene · Linalool",
  },
  {
    name: "Northern Lights",
    type: "indica",
    thc: "16–21%",
    uses: ["Insomnia", "Chronic pain", "Stress"],
    terpenes: "Myrcene · Caryophyllene · Pinene",
  },
];

function toFeatured(profile: {
  name: string;
  type?: string;
  thcRange?: string;
  medicalUses?: string[];
  terpenes?: { name: string }[];
  description?: string;
  communityNotes?: { source: string; text: string }[];
  leaflyRating?: number;
  leaflyReviewCount?: number;
  imageUrl?: string;
}): FeaturedStrain {
  return {
    name: profile.name,
    type: profile.type ?? "hybrid",
    thc: profile.thcRange ?? "",
    uses: topMedicalUses(profile),
    terpenes: (profile.terpenes ?? []).map((t) => t.name).join(" · "),
    description: profile.description,
    imageUrl: profile.imageUrl,
    leaflyNote:
      typeof profile.leaflyRating === "number"
        ? `${profile.leaflyRating.toFixed(1)}★${
            typeof profile.leaflyReviewCount === "number"
              ? ` · ${profile.leaflyReviewCount.toLocaleString("en-US")} reviews`
              : ""
          }`
        : profile.communityNotes?.find((n) =>
            /^\d+(?:\.\d+)?★/.test(n.text.trim()),
          )?.text,
  };
}

const EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

function fadeUp(delay: number) {
  return {
    initial: { opacity: 0, y: 28 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.18 },
    transition: { duration: 0.8, delay, ease: EASE },
  };
}

function CtaIcon() {
  return (
    <span className="flex size-7 items-center justify-center rounded-full border border-current/20 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5 group-hover:-translate-y-px group-hover:scale-105">
      <ArrowUpRight className="size-3.5" />
    </span>
  );
}

function StrainCard({
  strain,
  delay,
  href,
}: {
  strain: FeaturedStrain;
  delay: number;
  href: string;
}) {
  const tiltRef = usePointerTilt<HTMLAnchorElement>(8);

  const hasFooter = Boolean(strain.terpenes) || Boolean(strain.leaflyNote);

  return (
    <motion.div {...fadeUp(delay)} className="h-full">
      <Link
        ref={tiltRef}
        to={href}
        className="tilt-card group flex h-full flex-col rounded-2xl border border-border/70 bg-card p-6 transition-[border-color] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-primary/40"
      >
        <StrainImage
          src={strain.imageUrl}
          alt=""
          type={strain.type}
          className="mb-4 h-36 w-full rounded-xl border border-border/70"
        />
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold tracking-tight">{strain.name}</h3>
          <Badge className={cn(typeBadgeClass(strain.type), "capitalize")}>
            {TYPE_LABEL[strain.type] ?? strain.type}
          </Badge>
        </div>
        {strain.thc && (
          <p className="mt-1 font-mono text-[11px] tracking-wide text-muted-foreground">
            THC {strain.thc}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {strain.uses.map((use) => (
            <span
              key={use}
              className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground"
            >
              {use}
            </span>
          ))}
        </div>
        {strain.description && (
          <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">
            {strain.description}
          </p>
        )}
        {hasFooter && (
          <div className="mt-auto pt-4">
            {strain.terpenes && (
              <p className="border-t border-border/60 pt-4 text-xs leading-5 text-muted-foreground">
                <span className="font-medium text-foreground">Terpenes</span> —{" "}
                {strain.terpenes}
              </p>
            )}
            {strain.leaflyNote && (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-primary">
                <Leaf className="size-3.5" />
                Leafly · {strain.leaflyNote}
              </p>
            )}
          </div>
        )}
      </Link>
    </motion.div>
  );
}

function LandingNav({
  appHref,
  appLabel,
}: {
  appHref: string;
  appLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const links = [
    { href: "#how-it-works", label: "How it works" },
    { href: "#strains", label: "Strains" },
    { href: "#sources", label: "Sources" },
  ];

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 px-4 pt-4 sm:px-6">
      <div className="pointer-events-auto mx-auto flex w-full max-w-5xl items-center justify-between rounded-full border border-border/70 bg-background/75 px-3 py-2 backdrop-blur-md md:px-4">
        <Link to="/" className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2">
          <img
            src={logo}
            alt="StrainEase logo"
            width={32}
            height={32}
            className="rounded-[10px]"
          />
          <span className="text-[15px] font-semibold tracking-tight">
            StrainEase
          </span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3.5 py-1.5 transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-secondary hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <Button
            asChild
            size="sm"
            className="group hidden cursor-pointer rounded-full pl-4 pr-1.5 md:inline-flex"
          >
            <Link to={appHref}>
              {appLabel}
              <CtaIcon />
            </Link>
          </Button>
          <button
            type="button"
            className="relative flex size-10 items-center justify-center rounded-full border border-border/70 md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">Menu</span>
            <span className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  "nav-burger-line",
                  open && "translate-y-[3.5px] rotate-45",
                )}
              />
              <span
                className={cn("nav-burger-line", open && "-translate-y-[3.5px] -rotate-45")}
              />
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="pointer-events-auto mx-auto mt-2 w-full max-w-5xl overflow-hidden rounded-[1.75rem] border border-border/70 bg-background/90 p-5 backdrop-blur-md md:hidden"
          >
            <nav className="flex flex-col gap-1">
              {links.map((link, i) => (
                <motion.a
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  initial={reduce ? false : { opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.06 * i, ease: EASE }}
                  className="rounded-2xl px-4 py-3 text-lg font-medium tracking-tight"
                >
                  {link.label}
                </motion.a>
              ))}
              <Button asChild className="group mt-3 w-full cursor-pointer rounded-full">
                <Link to={appHref} onClick={() => setOpen(false)}>
                  {appLabel}
                  <CtaIcon />
                </Link>
              </Button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

export default function Landing() {
  const { isAuthenticated } = useAuth();
  const [live, setLive] = useState<FeaturedStrain[] | null>(null);

  const appHref = "/dashboard";
  const appLabel = isAuthenticated ? "Dashboard" : "Find strains";
  const featured =
    live ??
    FALLBACK_STRAINS.map((strain) => {
      const [filled] = applyCatalogPhotos([
        { name: strain.name, inKnowledgeBase: true },
      ]);
      return { ...strain, imageUrl: filled?.imageUrl };
    });

  useEffect(() => {
    let cancelled = false;
    void popularStrainsCall()
      .then((list) => {
        if (!cancelled && Array.isArray(list) && list.length > 0) {
          setLive(applyCatalogPhotos(list).map(toFeatured));
        }
      })
      .catch(() => {
        // Leafly or Firebase unreachable — keep the static fallback list.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="landing-grain min-h-[100dvh] bg-background text-foreground">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:border focus:bg-background focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      <LandingNav appHref={appHref} appLabel={appLabel} />

      <section
        id="main"
        className="relative flex min-h-[100dvh] items-center overflow-x-clip pt-24"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_48%_at_78%_18%,oklch(0.86_0.07_158/0.45),transparent_62%),radial-gradient(40%_36%_at_12%_88%,oklch(0.9_0.04_140/0.35),transparent_70%)]"
        />
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-6 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6 lg:pb-24 lg:pt-6">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.85, ease: EASE }}
            className="max-w-xl"
          >
            <span className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
              <ShieldCheck className="size-3.5 text-primary" />
              Built for medical cannabis patients
            </span>
            <h1 className="text-4xl font-semibold leading-[0.96] tracking-tight text-balance sm:text-6xl lg:text-[4.25rem]">
              Find cannabis strains for the{" "}
              <em className="font-display font-normal italic text-primary">
                relief
              </em>{" "}
              you need
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
              Tell StrainEase what you&apos;re treating — it researches Leafly,
              Weedmaps, Reddit, Google and dispensary menus, then uses AI to
              rank the strains patients report work best for your symptoms.
            </p>
            <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <Button
                asChild
                size="lg"
                className="group h-12 w-full cursor-pointer rounded-full px-6 sm:w-auto"
              >
                <Link to={appHref}>
                  {isAuthenticated ? "Go to dashboard" : "Find strains for me"}
                  <CtaIcon />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 w-full cursor-pointer rounded-full px-8 sm:w-auto"
              >
                <a href="#how-it-works">See how it works</a>
              </Button>
            </div>

            <div className="mt-12 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Sources
              </span>
              {SOURCES.map(({ name, icon: Icon }) => (
                <span
                  key={name}
                  className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground"
                >
                  <Icon className="size-3.5" />
                  {name}
                </span>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.12, ease: EASE }}
            className="relative"
          >
            <HeroSpecimen />
            <div className="pointer-events-none absolute inset-x-8 bottom-6 hidden justify-between font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground sm:flex">
              <span>Cannabis leaf</span>
              <span>Live specimen</span>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="border-y border-border/60">
        <div className="mx-auto w-full max-w-6xl px-6 py-24">
          <motion.div
            {...fadeUp(0)}
            className="flex flex-col items-center gap-6 text-center"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
              For your symptoms
            </p>
            <h2 className="max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Start with what you&apos;re treating,{" "}
              <em className="font-display font-normal italic text-primary">
                not the jargon
              </em>
            </h2>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {CONDITIONS.map((condition) => (
                <Link
                  key={condition}
                  to={appHref}
                  className="rounded-full border border-border/70 bg-card px-4 py-1.5 text-sm text-muted-foreground transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-primary/40 hover:text-foreground"
                >
                  {condition}
                </Link>
              ))}
            </div>
            <p className="max-w-xl text-sm leading-6 text-muted-foreground">
              Pick your symptoms and StrainEase researches the strains patients
              report work best for them — then ranks the top matches so you
              can compare the finalists side by side.
            </p>
          </motion.div>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto w-full max-w-6xl px-6 py-24">
        <motion.div {...fadeUp(0)} className="mb-14 max-w-xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
            How it works
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Three steps to the strains you need
          </h2>
        </motion.div>
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.step}
              {...fadeUp(i * 0.08)}
              className={cn(
                "relative rounded-2xl border border-border/70 bg-card p-7",
                i === 1 && "md:translate-y-6",
              )}
            >
              <span className="font-display absolute right-6 top-5 text-4xl italic text-primary/20">
                {step.step}
              </span>
              <div className="mb-6 flex size-11 items-center justify-center rounded-full border border-border/70 text-primary">
                <step.icon className="size-5" />
              </div>
              <h3 className="text-base font-semibold tracking-tight">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {step.body}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="strains" className="border-y border-border/60">
        <div className="mx-auto w-full max-w-6xl px-6 py-24">
          <motion.div
            {...fadeUp(0)}
            className="mb-14 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end"
          >
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
                Live from Leafly
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                Popular strains right now
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">
              These are the strains patients are looking at most on Leafly
              today — pulled live, no database to maintain. Compare any of them
              in the app.
            </p>
          </motion.div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((strain, i) => (
              <StrainCard
                key={strain.name}
                strain={strain}
                delay={(i % 3) * 0.08}
                href={`/strain/${slugify(strain.name)}`}
              />
            ))}
          </div>
          <motion.div {...fadeUp(0.1)} className="mt-12 text-center">
            <Button
              asChild
              variant="outline"
              className="group cursor-pointer rounded-full pl-5 pr-1.5"
            >
              <Link to={appHref}>
                <Sparkles className="size-4 text-primary" />
                Find your match
                <CtaIcon />
              </Link>
            </Button>
          </motion.div>
        </div>
      </section>

      <section id="sources" className="mx-auto w-full max-w-6xl px-6 py-24">
        <div className="grid items-start gap-16 lg:grid-cols-2">
          <motion.div {...fadeUp(0)}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
              Where the knowledge comes from
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              One comparison,{" "}
              <em className="font-display font-normal italic text-primary">
                many voices
              </em>
            </h2>
            <p className="mt-4 max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">
              StrainEase doesn&apos;t guess. Each strain profile aggregates
              commonly reported information from the sources patients actually
              use, then our AI weighs them together for a practical,
              medical-focused verdict.
            </p>
            <ul className="mt-10 space-y-6">
              {SOURCE_DETAILS.map((source, i) => (
                <motion.li
                  key={source.title}
                  {...fadeUp(0.05 * i)}
                  className="flex items-start gap-4"
                >
                  <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-border/70 text-primary">
                    <source.icon className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{source.title}</p>
                    <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
                      {source.body}
                    </p>
                  </div>
                </motion.li>
              ))}
            </ul>
          </motion.div>

          <motion.div {...fadeUp(0.1)} className="lg:pt-10">
            <div className="rounded-3xl border border-border/70 bg-card p-8">
              <div className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                <Activity className="size-3.5 text-primary" />
                Sample search — insomnia
              </div>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight">
                Best strains for insomnia
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                What patients commonly report across our sources
              </p>
              <div className="mt-8 divide-y divide-border/60">
                {SAMPLE_HITS.map((row) => (
                  <div key={row.label} className="flex items-start gap-3 py-4 first:pt-0 last:pb-0">
                    <row.icon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <div>
                      <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {row.label}
                      </p>
                      <p className="mt-1 text-sm leading-6">{row.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-4xl px-6 pb-16">
        <div className="flex items-start gap-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-semibold">Not medical advice</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              StrainEase is an information and comparison tool. Nothing here is
              a diagnosis, prescription, or treatment recommendation. Always
              consult a qualified healthcare provider before using cannabis for
              medical purposes — especially if you take other medication.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-[2rem] bg-primary px-8 py-20 text-center text-primary-foreground sm:px-16">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_80%_at_50%_0%,oklch(1_0_0/0.14),transparent_65%)]"
          />
          <h2 className="relative text-3xl font-semibold tracking-tight text-balance sm:text-5xl">
            Find the strain that fits{" "}
            <em className="font-display font-normal italic">your symptoms</em>
          </h2>
          <p className="relative mx-auto mt-5 max-w-xl text-sm leading-6 text-primary-foreground/80 sm:text-base">
            Tell us what you&apos;re treating — get the strains patients report
            work best, then compare your top picks in seconds.
          </p>
          <div className="relative mt-10 flex justify-center">
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="group h-12 cursor-pointer rounded-full pl-6 pr-1.5"
            >
              <Link to={appHref}>
                {isAuthenticated
                  ? "Back to dashboard"
                  : "Find my strains — it's free"}
                <CtaIcon />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 px-6 py-10 sm:flex-row">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src={logo}
              alt="StrainEase logo"
              width={28}
              height={28}
              className="rounded-lg"
            />
            <span className="text-sm font-semibold tracking-tight">
              StrainEase
            </span>
          </Link>
          <p className="text-center text-xs text-muted-foreground">
            Find and compare cannabis strains for medical relief. 21+ only ·
            Know your local laws.
          </p>
          <div className="flex items-center gap-5 text-xs text-muted-foreground">
            <a
              href="#how-it-works"
              className="transition-colors hover:text-foreground"
            >
              How it works
            </a>
            <Link to={appHref} className="transition-colors hover:text-foreground">
              {isAuthenticated ? "Dashboard" : "Sign in"}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
