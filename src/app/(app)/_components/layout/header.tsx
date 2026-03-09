"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export function Header() {
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
          <div className="from-primary to-primary/60 shadow-primary/20 group-hover:shadow-primary/40 relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br shadow-lg transition-shadow">
            <Lock className="text-primary-foreground h-4 w-4" />
            <div className="bg-primary/20 absolute inset-0 -z-10 rounded-xl blur-md" />
          </div>
          <span className="text-foreground text-xl font-bold tracking-tight">
            Harpo
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href="#how-it-works"
            className="text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg px-4 py-2 text-sm transition-all"
          >
            How it works
          </Link>
          <Link
            href="#features"
            className="text-muted-foreground hover:text-foreground hover:bg-secondary/50 rounded-lg px-4 py-2 text-sm transition-all"
          >
            Security
          </Link>
          <Link
            href="https://github.com"
            target="_blank"
            className="text-primary-foreground bg-primary hover:bg-primary/90 ml-2 rounded-lg px-4 py-2 text-sm font-medium transition-all"
          >
            GitHub
          </Link>
        </nav>
      </div>
    </header>
  );
}
