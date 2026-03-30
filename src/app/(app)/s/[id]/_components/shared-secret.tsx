"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  Copy,
  Check,
  FileText,
  FileKey,
  BookKey,
} from "lucide-react";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Secret, SecretPayload } from "@/types";
import { env } from "@/env";
import {
  decryptText,
  decryptFile,
  importAesKey,
  base64urlDecodeBytes,
  type EncryptedPayload,
  type EncryptedFilePayload,
} from "@/lib/secret-crypto";

async function triggerFileDownload(opts: {
  encryptedBytesB64: string;
  encryptedPayload: string;
  keyBase64url: string;
}) {
  const metadata = JSON.parse(opts.encryptedPayload) as EncryptedFilePayload;
  const encryptedBytes = base64urlDecodeBytes(opts.encryptedBytesB64);
  const iv = base64urlDecodeBytes(metadata.iv);

  const key = await importAesKey(opts.keyBase64url);
  const decryptedBytes = await decryptFile({ encryptedBytes, iv, key });

  const blob = new Blob([decryptedBytes.buffer as ArrayBuffer], {
    type: metadata.mimeType ?? "application/octet-stream",
  });
  const url = URL.createObjectURL(blob);

  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = metadata.originalName ?? "secret-file";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function SharedSecret({
  secret,
  secretIdHash,
}: {
  secret: NonNullable<Secret>;
  secretIdHash: string;
}) {
  const { data, isLoading, error, refetch } = api.secret.get.useQuery(
    { id: secretIdHash },
    { refetchOnWindowFocus: false, initialData: secret },
  );

  const tagDestruction = api.secret.tagDeletion.useMutation();
  const consume = api.secret.consume.useMutation();
  const downloadFile = api.storage.download.useMutation();

  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [destroyCountdown, setDestroyCountdown] = useState<number | null>(null);
  const [decryptedText, setDecryptedText] = useState<string | null>(null);
  const [keyBase64url, setKeyBase64url] = useState<string | null>(null);

  const hasLimitedViews =
    data?.maxViews !== undefined &&
    data?.maxViews !== null &&
    data.maxViews > 0;
  const isLastView =
    !!data && hasLimitedViews && data.viewCount + 1 >= data.maxViews;

  const expiresLabel = useMemo(() => {
    if (!data?.expiresAt) return null;
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(data.expiresAt);
    } catch {
      return data.expiresAt.toISOString();
    }
  }, [data?.expiresAt]);

  const encryptedPayload = JSON.parse(
    data?.encryptedPayload ?? "{}",
  ) as SecretPayload;
  const isFile = encryptedPayload.type === "file";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash ?? "";
    const value = hash.startsWith("#") ? hash.slice(1) : hash;
    setKeyBase64url(value || null);
  }, []);

  const getDecryptedSecret = useCallback(async () => {
    if (!data || isFile) return null;
    if (decryptedText !== null) return decryptedText;

    try {
      const payload = JSON.parse(data.encryptedPayload) as EncryptedPayload;

      if (!keyBase64url) {
        throw new Error(
          "Missing decryption key in URL fragment. Make sure you used the full link.",
        );
      }

      const key = await importAesKey(keyBase64url);
      const plaintext = await decryptText({ encrypted: payload, key });

      return plaintext;
    } catch (error) {
      const message =
        (error as { message?: string }).message ??
        "Unable to decrypt this secret.";
      toast.error("Decryption failed", {
        description: message,
        closeButton: true,
        position: "top-center",
      });
      return null;
    }
  }, [data, decryptedText, isFile, keyBase64url]);

  const handleReveal = useCallback(async () => {
    if (revealed) return;

    // On the very last allowed view, schedule destruction server-side and then
    // start a client-side countdown so the user can read/copy before it goes
    // away.
    if (isLastView && !destroyCountdown) {
      try {
        await tagDestruction.mutateAsync({ id: secret.id });
        const ttlSeconds = Number(
          env.NEXT_PUBLIC_LAST_VIEW_COUNTDOWN_SECONDS ?? 30,
        );
        const descryptedSecret = await getDecryptedSecret();
        setDecryptedText(descryptedSecret);
        setRevealed(true);
        setDestroyCountdown(ttlSeconds);
        await refetch();
      } catch (err) {
        toast.error("Secrets", {
          description:
            (err as { message?: string }).message ??
            "Reveal countdown not available",
          position: "top-center",
          closeButton: true,
        });
        const ttlSeconds = Math.ceil(
          (data?.expiresAt.getTime() - new Date().getTime()) / 1000,
        );
        setRevealed(true);
        setDestroyCountdown(ttlSeconds);
      }
      return;
    }

    try {
      const res = await consume.mutateAsync({ id: secret.id });
      if (!res.viewCount) return;
      const descryptedSecret = await getDecryptedSecret();
      setDecryptedText(descryptedSecret);
      setRevealed(true);
      await refetch();
    } catch (err) {
      toast.error("Unable to reveal secret", {
        description:
          (err as { message?: string }).message ?? "Reveal not available",
        position: "top-center",
        closeButton: true,
      });
    }
  }, [
    tagDestruction,
    consume,
    secret.id,
    data?.expiresAt,
    getDecryptedSecret,
    revealed,
    refetch,
    isLastView,
    destroyCountdown,
  ]);

  const handleCopy = useCallback(async () => {
    if (!data?.encryptedPayload) return;

    // If we're already on the last-view countdown, just allow copying without
    // consuming another view; the countdown will handle destruction.
    if (destroyCountdown !== null && revealed) {
      const text = isFile ? data.encryptedPayload : await getDecryptedSecret();
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      return;
    }

    try {
      const res = await consume.mutateAsync({ id: secret.id });
      if (!res.viewCount) return;
      const text = isFile ? data.encryptedPayload : await getDecryptedSecret();
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      await refetch();
    } catch (err) {
      toast.error("Unable to copy secret", {
        description:
          (err as { message?: string }).message ?? "Copy not available",
        position: "top-center",
        closeButton: true,
      });
    }
  }, [
    consume,
    data?.encryptedPayload,
    secret.id,
    refetch,
    destroyCountdown,
    revealed,
    getDecryptedSecret,
    isFile,
  ]);

  const handleDownload = useCallback(async () => {
    if (!data?.encryptedPayload) return;
    if (!keyBase64url) {
      toast.error("Missing decryption key", {
        description:
          "Make sure you opened the full share link including the #key part.",
        position: "top-center",
        closeButton: true,
      });
      return;
    }
    try {
      const { encryptedBytes: encryptedBytesB64 } =
        await downloadFile.mutateAsync({ idToken: secretIdHash });
      await triggerFileDownload({
        encryptedBytesB64,
        encryptedPayload: data.encryptedPayload,
        keyBase64url,
      });
      await consume.mutateAsync({ id: secret.id });
      await refetch();
    } catch (err) {
      toast.error("Unable to download secret", {
        description:
          (err as { message?: string }).message ?? "Download not available",
        position: "top-center",
        closeButton: true,
      });
    }
  }, [
    consume,
    downloadFile,
    data?.encryptedPayload,
    keyBase64url,
    secret.id,
    secretIdHash,
    refetch,
  ]);

  useEffect(() => {
    if (destroyCountdown === null) return;

    if (destroyCountdown <= 0) {
      // Countdown finished: the server-side expiry has already been armed, so
      // just clear local state and refetch.
      setDestroyCountdown(null);
      void refetch();
      return;
    }

    const id = window.setTimeout(() => {
      setDestroyCountdown((current) =>
        current === null ? null : Math.max(current - 1, 0),
      );
    }, 1000);

    return () => window.clearTimeout(id);
  }, [destroyCountdown, refetch]);

  const showUnavailable = !isLoading && (error ? true : data == null);

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
          {data?.name ?? secret.name}
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {expiresLabel ? (
            <>
              Expires{" "}
              <span className="font-medium" suppressHydrationWarning>
                {expiresLabel}
              </span>
            </>
          ) : (
            "Securely shared secret"
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && (
          <Alert>
            <AlertTitle>Loading…</AlertTitle>
            <AlertDescription>Fetching the secret payload.</AlertDescription>
          </Alert>
        )}

        {showUnavailable && (
          <Alert className="border-red-500/30 bg-red-500/10 text-red-500">
            <AlertTitle>Secret unavailable</AlertTitle>
            <AlertDescription className="text-red-500/80">
              This link is invalid, expired, or the secret has already been
              consumed.
            </AlertDescription>
          </Alert>
        )}

        {!showUnavailable &&
          !isLoading &&
          data?.maxViews &&
          data?.maxViews > 1 && (
            <Alert>
              <AlertTitle>Copying or Revealing</AlertTitle>
              <AlertDescription>
                When you copy or reveal the secret it will count as a view added
              </AlertDescription>
            </Alert>
          )}

        {!showUnavailable && !isLoading && data?.maxViews === 1 && (
          <Alert className="border-amber-500/30 bg-amber-500/30 text-amber-500">
            <AlertTitle>Instant Destruction</AlertTitle>
            <AlertDescription className="text-amber-500/80">
              This secret will be immediately destroyed after revealing or
              copying
            </AlertDescription>
          </Alert>
        )}

        {!isLoading && data && (
          <>
            <div className="space-y-2">
              <div className="text-muted-foreground flex items-center gap-2 text-xs">
                {isFile ? (
                  <>
                    <FileText className="h-4 w-4" />
                    File payload
                    {encryptedPayload.type === "file"
                      ? ` (${encryptedPayload.mimeType})`
                      : ""}
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    Text payload
                  </>
                )}
                <span className="text-muted-foreground/70">
                  • views: {data.viewCount}/{data.maxViews}
                </span>
              </div>

              {isFile ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  onClick={handleDownload}
                  disabled={consume.isPending}
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              ) : (
                <>
                  {revealed ? (
                    <div className="relative">
                      <Textarea
                        value={decryptedText ?? "Decrypting secret…"}
                        readOnly
                        className={cn(
                          "bg-input/50 border-border/50 min-h-[220px] resize-none pr-32 font-mono text-sm",
                        )}
                      />
                      {destroyCountdown !== null && (
                        <div className="text-muted-foreground pointer-events-none absolute right-3 bottom-2 text-xs">
                          Secret will be destroyed in {destroyCountdown}s
                        </div>
                      )}
                    </div>
                  ) : (
                    <Card className="relative min-h-[220px]">
                      {!isFile && (
                        <div className="absolute top-4 right-4">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleCopy}
                            disabled={consume.isPending}
                          >
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
                      )}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={handleReveal}
                          disabled={consume.isPending || revealed}
                        >
                          <Eye className="h-4 w-4" />
                          Reveal
                        </Button>
                      </div>
                    </Card>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
