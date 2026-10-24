"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FileText, Share2, Trash2, ArrowRight, ArrowDown } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: FileText,
    title: "Encrypt",
    subtitle: "In your browser",
    description:
      "Your data is encrypted locally using AES-256-GCM with a cryptographically secure random key. Only ciphertext ever leaves your device.",
    color: "from-emerald-500 to-teal-600",
  },
  {
    number: "02",
    icon: Share2,
    title: "Share",
    subtitle: "Send the link",
    description:
      "Share the generated link. The decryption key lives in the URL fragment and never touches our servers.",
    color: "from-teal-500 to-cyan-600",
  },
  {
    number: "03",
    icon: Trash2,
    title: "Destroy",
    subtitle: "Auto-purge",
    description:
      "Once viewed or expired, your secret is permanently deleted from the server and its storage.",
    color: "from-cyan-500 to-blue-600",
  },
];

export function HowItWorks() {
  return (
    <section className="relative py-24">
      <Card className="bg-card/30 relative w-full px-6 lg:mx-auto lg:w-max">
        <CardHeader className="pt-6">
          <CardTitle>
            <span className="text-primary bg-primary/10 inline-block px-3 py-1 text-xs font-semibold tracking-[0.2em] uppercase">
              How it works
            </span>
            <h2 className="text-foreground mt-3 text-3xl font-bold text-balance">
              Three steps to secure sharing
            </h2>
          </CardTitle>
          <CardDescription className="text-base">
            End-to-end encryption without the complexity. Your secrets stay
            yours.
          </CardDescription>
        </CardHeader>
        <CardContent className="pb-6">
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.number} className="group relative">
                {/* Connector arrow */}
                {index < steps.length - 1 && (
                  <>
                    <div className="text-muted-foreground/30 absolute top-12 -right-3 z-10 hidden h-6 w-6 items-center justify-center md:flex">
                      <ArrowRight className="h-5 w-5" />
                    </div>
                    <div className="text-muted-foreground/30 absolute right-1/2 -bottom-3 z-10 flex h-6 w-6 -translate-x-1/2 items-center justify-center md:hidden">
                      <ArrowDown className="h-5 w-5" />
                    </div>
                  </>
                )}

                <div className="bg-card/50 border-border/50 hover:bg-card/80 hover:border-primary/20 h-full rounded-2xl border p-6 backdrop-blur-sm transition-all duration-300">
                  {/* Hover glow effect */}
                  <div className="from-primary/5 pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                  {/* Icon */}
                  <div className="relative mb-5">
                    <div
                      className={`bg-primary/20 flex h-14 w-14 items-center justify-center rounded-xl shadow-lg`}
                    >
                      <step.icon className="text-primary h-6 w-6" />
                    </div>
                    <span className="text-primary bg-background border-border absolute -top-2 -left-2 rounded-md border px-1.5 py-0.5 text-[10px] font-bold">
                      {step.number}
                    </span>
                  </div>

                  {/* Content */}
                  <h3 className="text-foreground mb-1 text-xl font-bold">
                    {step.title}
                  </h3>
                  <p className="text-primary mb-3 text-xs font-medium tracking-wide uppercase">
                    {step.subtitle}
                  </p>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
