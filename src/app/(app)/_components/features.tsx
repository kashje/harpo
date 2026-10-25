"use client";

import { Lock, Timer, Eye, Fingerprint, Zap, HardDrive } from "lucide-react";

const features = [
  {
    icon: Lock,
    title: "Client-side AES-256-GCM",
    description:
      "A highly secure encryption happens in your browser. We only ever see ciphertext.",
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
    icon: HardDrive,
    title: "Encrypted file sharing",
    description:
      "Files are encrypted in your browser and stored as ciphertext. File names are encrypted too.",
    needsFiles: true,
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
      "Generate secure links instantly. No signup, no friction. Only a salted hash of your IP is kept to prevent abuse.",
  },
];

export function Features({ filesEnabled }: { filesEnabled: boolean }) {
  const shown = features.filter(
    (feature) => filesEnabled || !feature.needsFiles,
  );

  return (
    <section className="relative py-24">
      <div className="mb-8 text-center">
        <span className="text-primary bg-primary/10 mb-3 inline-block px-3 py-1 text-xs font-semibold tracking-[0.2em] uppercase">
          Security
        </span>
        <h2 className="text-foreground text-2xl font-bold text-balance">
          Built for safe sharing
        </h2>
        <p className="text-muted-foreground mx-auto max-w-xl text-pretty">
          Enterprise-grade encryption with zero trust architecture. Your secrets
          are mathematically protected.
        </p>
      </div>

      <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((feature, index) => (
          <div
            key={feature.title}
            className="group hover:from-primary/10 hover:to-primary/5 hover:border-primary/50 relative rounded-2xl border p-6 transition-all duration-300 hover:bg-gradient-to-br hover:shadow-xl"
            style={{
              animationDelay: `${index * 100}ms`,
            }}
          >
            {/* Hover glow effect */}
            <div className="from-primary/5 pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

            <div className="relative">
              <div className="bg-secondary/80 group-hover:bg-primary/20 mb-4 flex h-11 w-11 items-center justify-center rounded-xl transition-transform group-hover:scale-110">
                <feature.icon className="text-primary h-5 w-5" />
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
