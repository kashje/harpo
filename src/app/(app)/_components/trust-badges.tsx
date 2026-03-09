"use client";

import { Shield, Key, Server, CheckCircle } from "lucide-react";

const badges = [
  {
    icon: Shield,
    label: "Client-side AES-GCM",
    description: "256-bit encryption",
  },
  {
    icon: Key,
    label: "Zero-Knowledge",
    description: "We never see your data",
  },
  {
    icon: Server,
    label: "Keyless Backend",
    description: "Keys stay in URLs",
  },
  {
    icon: CheckCircle,
    label: "Auto-Destruct",
    description: "Secrets are purged",
  },
];

export function TrustBadges() {
  return (
    <div className="flex flex-wrap items-center justify-start gap-3">
      {badges.map((badge, index) => (
        <div
          key={badge.label}
          className="group bg-secondary/30 border-border/50 hover:bg-secondary/50 hover:border-primary/30 relative flex cursor-default items-center gap-2.5 rounded-full border px-4 py-2.5 backdrop-blur-sm transition-all duration-300"
          style={{
            animationDelay: `${index * 100}ms`,
          }}
        >
          <div className="bg-primary/10 group-hover:bg-primary/20 flex h-8 w-8 items-center justify-center rounded-full transition-colors">
            <badge.icon className="text-primary h-4 w-4" />
          </div>
          <div className="flex flex-col">
            <span className="text-foreground text-sm leading-tight font-medium">
              {badge.label}
            </span>
            <span className="text-muted-foreground text-[10px] leading-tight">
              {badge.description}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
