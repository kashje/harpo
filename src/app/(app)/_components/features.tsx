"use client";

import { Lock, Timer, Eye, Globe, Fingerprint, Zap } from "lucide-react";

const features = [
  {
    icon: Lock,
    title: "Client-side AES-256-GCM",
    description:
      "Military-grade encryption happens in your browser. We only ever see ciphertext.",
    highlight: true,
  },
  {
    icon: Timer,
    title: "Self-destruct controls",
    description:
      "Set TTLs and view limits. Secrets evaporate the moment their purpose is served.",
  },
  {
    icon: Eye,
    title: "Zero server access",
    description:
      "Decryption keys live in URL fragments. Our servers literally cannot decrypt your data.",
  },
  {
    icon: Globe,
    title: "Edge-optimized storage",
    description:
      "Encrypted payloads are stored at the edge for fast retrieval with automatic shredding.",
  },
  {
    icon: Fingerprint,
    title: "CSPRNG key generation",
    description:
      "Keys are generated using Web Crypto API's secure random number generator.",
  },
  {
    icon: Zap,
    title: "No account required",
    description:
      "Generate secure links instantly. No signup, no tracking, no friction.",
  },
];

export function Features() {
  return (
    <section className="relative py-24">
      <div className="mb-16 text-center">
        <span className="text-primary bg-primary/10 mb-3 inline-block rounded-full px-3 py-1 text-xs font-semibold tracking-[0.2em] uppercase">
          Security
        </span>
        <h2 className="text-foreground mt-3 text-3xl font-bold text-balance md:text-4xl lg:text-5xl">
          Built for paranoid security
        </h2>
        <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-pretty">
          Enterprise-grade encryption with zero trust architecture. Your secrets
          are mathematically protected.
        </p>
      </div>

      <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, index) => (
          <div
            key={feature.title}
            className={`group relative rounded-2xl border p-6 transition-all duration-300 hover:shadow-xl ${
              feature.highlight
                ? "from-primary/10 to-primary/5 border-primary/30 hover:border-primary/50 bg-gradient-to-br"
                : "bg-card/50 border-border/50 hover:bg-card/80 hover:border-primary/20"
            }`}
            style={{
              animationDelay: `${index * 50}ms`,
            }}
          >
            {/* Hover glow effect */}
            <div className="from-primary/5 pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

            <div className="relative">
              <div
                className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-110 ${
                  feature.highlight ? "bg-primary/20" : "bg-secondary/80"
                }`}
              >
                <feature.icon
                  className={`h-5 w-5 ${
                    feature.highlight ? "text-primary" : "text-primary"
                  }`}
                />
              </div>
              <h3 className="text-foreground mb-2 text-lg font-semibold">
                {feature.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
