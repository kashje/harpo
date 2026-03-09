import { HydrateClient } from "@/trpc/server";
import { SecretForm } from "./_components/secret-form";
import { TrustBadges } from "./_components/trust-badges";
import { Features } from "./_components/features";
import { HowItWorks } from "./_components/how-it-works";

export default function AppPage() {
  return (
    <HydrateClient>
      {/* Hero Section */}
      <section className="pt-32 pb-20 md:pt-40 md:pb-28">
        <div className="container mx-auto px-4">
          <div className="flex flex-col gap-12 lg:flex-row lg:items-start lg:justify-center lg:gap-12">
            <div className="lg:max-w-lg">
              <div className="bg-primary/10 border-primary/20 mb-6 inline-flex items-center gap-2 border px-3 py-1.5">
                <div className="bg-primary h-1.5 w-1.5 animate-pulse" />
                <span className="text-primary text-xs font-medium tracking-wider uppercase">
                  End-to-end encrypted
                </span>
              </div>

              <h1 className="text-foreground mb-6 text-3xl leading-[1.1] font-bold text-balance md:text-4xl">
                Share secrets without
                <span className="from-primary via-primary mt-2 block bg-gradient-to-r to-emerald-400 bg-clip-text text-transparent">
                  giving up control
                </span>
              </h1>

              <p className="text-muted-foreground mb-8 text-sm leading-relaxed text-pretty">
                Harpo encrypts every secret in your browser, splits the key from
                the data, and permanently destroys the payload the moment your
                instructions are fulfilled.
              </p>

              <TrustBadges />
            </div>

            <div className="w-full flex-1 lg:max-w-lg">
              <SecretForm />
            </div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="container mx-auto px-4">
        <HowItWorks />
      </section>

      <section id="features" className="container mx-auto px-4">
        <Features />
      </section>
    </HydrateClient>
  );
}
