"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  Download,
  Eye,
  Copy,
  Check,
  FileText,
  FileKey,
  BookKey,
  Lock,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { Secret } from "@/types";
import {
  base64urlDecode,
  decryptBytes,
  decryptMeta,
  decryptText,
  deriveSecretKeys,
  type SecretMeta,
} from "@/lib/secret-crypto";

// The decryption key lives in the URL fragment, which is never sent to the
// server, so it can only be read on the client.
function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getKeyFromHash() {
  return window.location.hash.slice(1) || null;
}

/** `undefined` while rendering on the server, where the fragment is unknown. */
function getServerKeyFromHash() {
  return undefined;
}

function formatExpiresAt(expiresAt: Date) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(expiresAt);
  } catch {
    return expiresAt.toISOString();
  }
}

const getErrorMessage = (err: unknown, fallback: string) =>
  err instanceof Error && err.message ? err.message : fallback;

function saveFile(bytes: Uint8Array<ArrayBuffer>, meta: SecretMeta | null) {
  const blob = new Blob([bytes], {
    type: meta?.mimeType ?? "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);

  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = meta?.fileName ?? "secret-file";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function SharedSecret({
  secret,
  idToken,
}: {
  secret: NonNullable<Secret>;
  idToken: string;
}) {
  const reveal = api.secret.reveal.useMutation();
  const download = api.storage.download.useMutation();

  const linkKey = useSyncExternalStore(
    subscribeToHash,
    getKeyFromHash,
    getServerKeyFromHash,
  );
  const [metaResult, setMetaResult] = useState<{
    linkKey: string;
    meta: SecretMeta | null;
  } | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [revealedText, setRevealedText] = useState<string | null>(null);
  const [views, setViews] = useState({
    viewCount: secret.viewCount,
    maxViews: secret.maxViews,
  });
  const [destroyed, setDestroyed] = useState(false);
  const [copied, setCopied] = useState(false);

  const isFile = secret.type === "file";
  const needsPassphrase = secret.passphrase !== null;
  const isBusy = reveal.isPending || download.isPending;
  const isLastView =
    views.maxViews > 0 && views.viewCount + 1 >= views.maxViews;

  useEffect(() => {
    if (!linkKey) return;
    let cancelled = false;

    deriveSecretKeys({ linkKey })
      .then(({ metaKey }) => decryptMeta(metaKey, secret.meta))
      .then((meta) => !cancelled && setMetaResult({ linkKey, meta }))
      .catch(() => !cancelled && setMetaResult({ linkKey, meta: null }));

    return () => {
      cancelled = true;
    };
  }, [linkKey, secret.meta]);

  // Only trust a result that belongs to the key currently in the URL.
  const metaForKey = metaResult?.linkKey === linkKey ? metaResult : null;
  const meta = metaForKey?.meta ?? null;
  const keyError =
    linkKey === null
      ? "The decryption key is missing from the link. Make sure you used the full link."
      : metaForKey && !metaForKey.meta
        ? "The decryption key in the link is invalid. Make sure you used the full link."
        : null;
  const expiresLabel = formatExpiresAt(secret.expiresAt);

  const getKeys = async () => {
    if (!linkKey || keyError) {
      throw new Error(keyError ?? "The decryption key is missing.");
    }
    if (secret.passphrase && !passphrase) {
      throw new Error("Enter the passphrase to unlock this secret.");
    }

    return deriveSecretKeys({
      linkKey,
      passphrase: secret.passphrase
        ? { ...secret.passphrase, value: passphrase }
        : null,
    });
  };

  /** Reveals the text once; after that the decrypted text is reused without using a view. */
  const revealText = async (): Promise<string> => {
    if (revealedText !== null) return revealedText;

    const keys = await getKeys();
    const result = await reveal.mutateAsync({
      idToken,
      authToken: keys.authToken ?? undefined,
    });
    const text = await decryptText(keys.contentKey, result.content);

    setRevealedText(text);
    setViews({ viewCount: result.viewCount, maxViews: result.maxViews });
    setDestroyed(result.destroyed);
    return text;
  };

  const handleReveal = async () => {
    try {
      await revealText();
    } catch (err) {
      toast.error("Unable to reveal secret", {
        description: getErrorMessage(err, "Reveal not available"),
        position: "top-center",
        closeButton: true,
      });
    }
  };

  const handleCopy = async () => {
    try {
      const text = await revealText();
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      toast.error("Unable to copy secret", {
        description: getErrorMessage(err, "Copy not available"),
        position: "top-center",
        closeButton: true,
      });
    }
  };

  const handleDownload = async () => {
    try {
      const keys = await getKeys();
      const result = await download.mutateAsync({
        idToken,
        authToken: keys.authToken ?? undefined,
      });
      setViews({ viewCount: result.viewCount, maxViews: result.maxViews });
      setDestroyed(result.destroyed);

      const bytes = await decryptBytes(
        keys.contentKey,
        base64urlDecode(result.encryptedBytes),
        base64urlDecode(result.iv),
      );
      saveFile(bytes, meta);
    } catch (err) {
      toast.error("Unable to download secret", {
        description: getErrorMessage(err, "Download not available"),
        position: "top-center",
        closeButton: true,
      });
    }
  };

  const title =
    meta?.name ?? meta?.fileName ?? (isFile ? "Shared file" : "Shared secret");
  const canAct = !keyError && !!linkKey && !!metaForKey && !destroyed;
  const revealed = revealedText !== null;

  return (
    <Card className="bg-card/60 border-border/50 backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-4 text-2xl font-bold text-balance">
          <div className="bg-primary/10 group-hover:bg-primary/20 flex h-8 w-8 items-center justify-center transition-colors">
            {isFile ? (
              <FileKey className="text-primary h-4 w-4" />
            ) : (
              <BookKey className="text-primary h-4 w-4" />
            )}
          </div>
          {title}
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Expires{" "}
          <span className="font-medium" suppressHydrationWarning>
            {expiresLabel}
          </span>
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {keyError && (
          <Alert className="border-red-500/30 bg-red-500/10 text-red-500">
            <AlertTitle>Cannot decrypt</AlertTitle>
            <AlertDescription className="text-red-500/80">
              {keyError}
            </AlertDescription>
          </Alert>
        )}

        {destroyed && (
          <Alert className="border-amber-500/30 bg-amber-500/30 text-amber-500">
            <AlertTitle>Secret destroyed</AlertTitle>
            <AlertDescription className="text-amber-500/80">
              This was the last view and the secret has been deleted from the
              server. Save it before you leave this page.
            </AlertDescription>
          </Alert>
        )}

        {!destroyed && !revealed && isLastView && (
          <Alert className="border-amber-500/30 bg-amber-500/30 text-amber-500">
            <AlertTitle>Last view</AlertTitle>
            <AlertDescription className="text-amber-500/80">
              This secret is destroyed as soon as you{" "}
              {isFile ? "download it" : "reveal or copy it"}.
            </AlertDescription>
          </Alert>
        )}

        {!destroyed && !revealed && !isLastView && views.maxViews > 1 && (
          <Alert>
            <AlertTitle>Views are limited</AlertTitle>
            <AlertDescription>
              {isFile
                ? "Every download counts as a view."
                : "Revealing or copying the secret counts as one view."}
            </AlertDescription>
          </Alert>
        )}

        {needsPassphrase && !revealed && !destroyed && (
          <Field>
            <FieldLabel
              htmlFor="passphrase"
              className="text-foreground flex items-center gap-2 font-medium"
            >
              <Lock className="text-primary h-4 w-4" />
              Passphrase
            </FieldLabel>
            <Input
              id="passphrase"
              type="password"
              autoComplete="off"
              placeholder="Enter the passphrase for this secret"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </Field>
        )}

        <div className="space-y-2">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <FileText className="h-4 w-4" />
            {isFile
              ? `File payload${meta?.mimeType ? ` (${meta.mimeType})` : ""}`
              : "Text payload"}
            <span className="text-muted-foreground/70">
              • views: {views.viewCount}/
              {views.maxViews > 0 ? views.maxViews : "∞"}
            </span>
          </div>

          {isFile ? (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={handleDownload}
              disabled={!canAct || isBusy}
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          ) : revealed ? (
            <div className="relative">
              <Textarea
                value={revealedText}
                readOnly
                className={cn(
                  "bg-input/50 border-border/50 min-h-[220px] resize-none pr-32 font-mono text-sm",
                )}
              />
              <div className="absolute top-4 right-4">
                <Button type="button" variant="outline" onClick={handleCopy}>
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <Card className="relative min-h-[220px]">
              <div className="absolute top-4 right-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCopy}
                  disabled={!canAct || isBusy}
                >
                  <Copy className="h-4 w-4" />
                  Copy
                </Button>
              </div>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleReveal}
                  disabled={!canAct || isBusy}
                >
                  <Eye className="h-4 w-4" />
                  Reveal
                </Button>
              </div>
            </Card>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
