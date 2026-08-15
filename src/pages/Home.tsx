import { AppHeader, AppTabBar } from "@/components/home/AppHeader";
import { HomeScreen } from "@/components/home/HomeScreen";
import { usePopularStrains } from "@/hooks/use-popular-strains";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useSavedAilments } from "@/hooks/use-saved-ailments";
import { motion } from "framer-motion";

export default function Home() {
  const { popular } = usePopularStrains();
  const recents = useRecentlyViewed();
  const { ailments: savedAilments } = useSavedAilments();

  return (
    <main className="min-h-[100dvh] bg-background pb-24 text-foreground sm:pb-10">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(55%_40%_at_80%_0%,oklch(0.86_0.07_158/0.38),transparent_62%),radial-gradient(40%_32%_at_8%_18%,oklch(0.9_0.04_140/0.28),transparent_70%)]"
      />
      <AppHeader active="home" />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
        className="mx-auto w-full max-w-6xl px-6 py-8 sm:py-10"
      >
        <HomeScreen
          popular={popular}
          recents={recents}
          savedAilments={savedAilments}
        />
      </motion.div>
      <AppTabBar active="home" />
    </main>
  );
}
