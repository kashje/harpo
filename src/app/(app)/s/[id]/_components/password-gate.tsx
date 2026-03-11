"use client";

import { useState } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Lock } from "lucide-react";
import { toast } from "sonner";

import type { Secret } from "@/types";
import { api } from "@/trpc/react";
import { hashPassphrase } from "@/lib/secret-crypto";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { SharedSecret } from "./shared-secret";

const passwordSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

type PasswordFormValues = z.infer<typeof passwordSchema>;

export function PasswordGate({
  secret,
  secretIdHash,
}: {
  secret: NonNullable<Secret>;
  secretIdHash: string;
}) {
  const [unlocked, setUnlocked] = useState(!secret.hasPassword);

  const form = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      password: "",
    },
  });

  const checkPassword = api.secret.checkPassword.useMutation();

  const onSubmit = async (values: PasswordFormValues) => {
    try {
      const passwordHash = await hashPassphrase(values.password);
      await checkPassword.mutateAsync({
        id: secret.id,
        password: passwordHash,
      });
      setUnlocked(true);
    } catch (err) {
      toast.error("Error", {
        description:
          (err as { message?: string }).message ??
          "The password you entered is not correct.",
        position: "top-center",
        closeButton: true,
      });
    }
  };

  if (unlocked) {
    return <SharedSecret secret={secret} secretIdHash={secretIdHash} />;
  }

  return (
    <Card className="bg-card/60 border-border/50 backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-4 text-2xl font-bold text-balance">
          <div className="bg-primary/10 group-hover:bg-primary/20 flex h-8 w-8 items-center justify-center transition-colors">
            <Lock className="text-primary h-4 w-4" />
          </div>
          Protected Secret
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          This secret is protected by a password. Enter the password to unlock
          and reveal it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <Field data-invalid={!!form.formState.errors.password}>
            <FieldLabel
              htmlFor="password"
              className="text-foreground font-medium"
            >
              Password
            </FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter the password for this secret"
              {...form.register("password")}
              aria-invalid={!!form.formState.errors.password}
            />
            {form.formState.errors.password && (
              <FieldError errors={[form.formState.errors.password]} />
            )}
          </Field>
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={form.formState.isSubmitting || checkPassword.isPending}
          >
            <Lock className="h-4 w-4" />
            Unlock Secret
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
