import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.svg";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router";

export default function NotFound() {
  return (
    <motion.main
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-foreground"
    >
      <Link to="/" className="mb-10 flex items-center gap-2.5">
        <img
          src={logo}
          alt="StrainEase logo"
          width={32}
          height={32}
          className="rounded-[10px]"
        />
        <span className="text-sm font-semibold tracking-tight">StrainEase</span>
      </Link>
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-muted-foreground">
        404
      </p>
      <h1 className="mt-3 text-center text-3xl font-semibold tracking-tight sm:text-4xl">
        This page doesn&apos;t grow here
      </h1>
      <p className="mt-3 max-w-md text-center text-sm leading-6 text-muted-foreground">
        The link is broken or the page moved. Head back to find strains for
        your symptoms.
      </p>
      <Button asChild className="group mt-8 cursor-pointer rounded-full pl-5 pr-1.5">
        <Link to="/">
          Back to StrainEase
          <span className="flex size-7 items-center justify-center rounded-full border border-current/20">
            <ArrowUpRight className="size-3.5" />
          </span>
        </Link>
      </Button>
    </motion.main>
  );
}
