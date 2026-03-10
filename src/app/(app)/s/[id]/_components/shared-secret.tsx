"use client";

import { useCallback, useMemo, useState } from "react";
import { Download, Eye, EyeOff, Copy, Check, FileText } from "lucide-react";

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

function fileExtensionFromType(fileType: string | null) {
  switch (fileType) {
    case "image":
      return "png";
    case "video":
      return "mp4";
    case "audio":
      return "mp3";
    case "document":
      return "txt";
    default:
      return "bin";
  }
}

async function downloadPayloadAsFile(opts: {
  payload: string;
  suggestedName: string;
  fileType: string | null;
}) {
  const ext = fileExtensionFromType(opts.fileType);
  const baseName =
    opts.suggestedName.trim().length > 0 ? opts.suggestedName : "secret";
  const filename = `${baseName}.${ext}`;

  const blob = await (async () => {
    if (opts.payload.startsWith("data:")) {
      const res = await fetch(opts.payload);
      return await res.blob();
    }

    // Assume base64 without data URL prefix.
    const binary = atob(opts.payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: "application/octet-stream" });
  })();

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function SharedSecret(props: { id: string; initialName: string }) {
  const { data, isLoading, error } = api.secret.get.useQuery(
    { id: props.id },
    { refetchOnWindowFocus: false },
  );

  const consume = api.secret.consume.useMutation();

  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

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

  const isFile = !!data?.fileType;

  const handleReveal = useCallback(async () => {
    try {
      if (revealed) return;
      const res = await consume.mutateAsync({ id: props.id });
      if (!res.viewCount) return;
      setRevealed(true);
    } catch (err) {
      toast.error("Unable to reveal secret", {
        description:
          (err as { message?: string }).message ?? "Reveal not available",
        position: "top-center",
        closeButton: true,
      });
    }
  }, [consume, props.id, revealed]);

  const handleCopy = useCallback(async () => {
    try {
      if (!data?.encryptedPayload) return;
      const res = await consume.mutateAsync({ id: props.id });
      if (!res.viewCount) return;
      await navigator.clipboard.writeText(data.encryptedPayload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      toast.error("Unable to copy secret", {
        description:
          (err as { message?: string }).message ?? "Copy not available",
        position: "top-center",
        closeButton: true,
      });
    }
  }, [consume, data?.encryptedPayload, props.id]);

  const handleDownload = useCallback(async () => {
    if (!data?.encryptedPayload) return;
    try {
      const res = await consume.mutateAsync({ id: props.id });
      if (!res.viewCount) {
        return;
      }
      await downloadPayloadAsFile({
        payload: data.encryptedPayload,
        suggestedName: data.name,
        fileType: data.fileType ?? null,
      });
    } catch (err) {
      toast.error("Unable to download secret", {
        description:
          (err as { message?: string }).message ?? "Download not available",
        position: "top-center",
        closeButton: true,
      });
    }
  }, [consume, data?.encryptedPayload, data?.fileType, data?.name, props.id]);

  const showUnavailable = !isLoading && (error ? true : data == null);

  return (
    <Card className="bg-card/60 border-border/50 backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-foreground text-2xl font-bold text-balance">
          {data?.name ?? props.initialName}
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          {expiresLabel ? (
            <>
              Expires <span className="font-medium">{expiresLabel}</span>
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
                    File payload ({data.fileType})
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
                    <Textarea
                      value={data.encryptedPayload}
                      readOnly
                      className={cn(
                        "bg-input/50 border-border/50 min-h-[220px] resize-none font-mono text-sm",
                      )}
                    />
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
