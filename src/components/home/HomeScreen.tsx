import { AilmentCarousel } from "@/components/home/AilmentCarousel";
import { StrainRail } from "@/components/home/StrainRail";
import {
  HOME_AILMENTS,
  previewFor,
  sectionHref,
  sectionTitle,
  type HomeSection,
} from "@/lib/home-sections";
import type { StrainProfile } from "@/lib/strain-profile";

export function HomeScreen({
  popular,
  recents,
  savedAilments = [],
}: {
  popular: StrainProfile[];
  recents: StrainProfile[];
  savedAilments?: string[];
}) {
  const ailments =
    savedAilments.length > 0
      ? [
          ...savedAilments,
          ...HOME_AILMENTS.filter(
            (name) =>
              !savedAilments.some(
                (saved) => saved.toLowerCase() === name.toLowerCase(),
              ),
          ),
        ]
      : HOME_AILMENTS;
  const rail = (
    section: Exclude<HomeSection, { kind: "ailment" | "recents" }>,
  ) => (
    <StrainRail
      title={sectionTitle(section)}
      strains={previewFor(section, popular)}
      seeMoreHref={sectionHref(section)}
    />
  );

  return (
    <div className="space-y-10">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary">
          Browse
        </p>
        <h1 className="mt-2 font-display text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl">
          Find a strain that fits tonight
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-6 text-muted-foreground">
          Popular picks, symptoms, and phenotypes — tap See more for the full
          grid.
        </p>
      </div>

      {rail({ kind: "directory" })}
      {rail({ kind: "popular" })}

      <AilmentCarousel
        ailments={ailments}
        preview={(name) => previewFor({ kind: "ailment", name }, popular)}
      />

      {rail({ kind: "sativa" })}
      {rail({ kind: "hybrid" })}
      {rail({ kind: "indica" })}

      <StrainRail
        title="Recently viewed"
        strains={previewFor({ kind: "recents" }, popular, recents)}
        seeMoreHref={
          recents.length > 0 ? sectionHref({ kind: "recents" }) : undefined
        }
        emptyText="Open a strain and it’ll land here."
      />
    </div>
  );
}
