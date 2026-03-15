import { Github, Logo } from "@/components/icons";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-border/50 relative mt-12 border-t py-12">
      <div className="container mx-auto px-4">
        <div className="flex flex-col items-center justify-between gap-6 lg:flex-row">
          <div className="flex flex-col items-center gap-0 lg:flex-row lg:gap-3">
            <div className="flex h-8 w-8 items-center justify-center">
              <Logo className="text-primary h-6 w-6" />
            </div>
            <div className="text-center lg:text-left">
              <span className="text-foreground text-center text-sm font-bold md:text-left">
                Harpo
              </span>
              <p className="text-muted-foreground text-[11px]">
                Zero-knowledge secret sharing
              </p>
            </div>
          </div>

          <p className="text-muted-foreground max-w-md text-center text-sm">
            Your data is encrypted before it leaves your browser. We
            mathematically cannot access your secrets.
          </p>

          <div className="flex items-center gap-4">
            <Link
              href="https://github.com/kashje/harpo"
              target="_blank"
              className="bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary hidden h-9 w-9 items-center justify-center rounded-lg transition-all lg:flex"
            >
              <Github className="h-4 w-4" />
            </Link>
            <span className="text-muted-foreground text-xs">
              &copy; {new Date().getFullYear()} Harpo
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
