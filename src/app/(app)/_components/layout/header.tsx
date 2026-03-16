"use client";

import { Github, Logo } from "@/components/icons";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FeedbackDialog } from "./feedback-dialog";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export function Header() {
  const path = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 right-0 left-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 border-border/50 border-b backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        <Link href="/" className="group flex items-center gap-2.5">
          <div className="group-hover:shadow-primary/40 relative flex h-6 w-6 items-center justify-center rounded-xl bg-gradient-to-br transition-shadow">
            <Logo className="text-primary size-6" />
            <div className="group-hover:bg-primary/20 absolute inset-0 -z-10 transition-all group-hover:blur-md" />
          </div>
          <span className="text-foreground text-base font-bold tracking-tight">
            Harpo
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          {!path.includes("/s/") && (
            <>
              <Link
                href="#how-it-works"
                className="text-muted-foreground hover:text-foreground hover:bg-secondary/50 hidden rounded-lg px-4 py-2 text-sm transition-all md:block"
              >
                How it works
              </Link>
              <Link
                href="#features"
                className="text-muted-foreground hover:text-foreground hover:bg-secondary/50 hidden rounded-lg px-4 py-2 text-sm transition-all md:block"
              >
                Security
              </Link>
            </>
          )}

          <FeedbackDialog />
          <Button size="icon" variant="link" asChild>
            <Link href="https://github.com/kashje/harpo" target="_blank">
              <Github className="size-5" />
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  );
}
