"use client";

import { useCallback, useMemo, useState } from "react";

import { Check, Copy, Link2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

export function GeneratedLinkDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
}) {
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => props.url ?? "", [props.url]);
  const hasUrl = url.length > 0;

  const handleCopy = useCallback(async () => {
    if (!hasUrl) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      toast.error("Unable to copy link", {
        description:
          (error as { message?: string }).message ?? "Please copy it manually.",
      });
    }
  }, [hasUrl, url]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="md:max-w-lg!">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2 font-bold text-balance">
            <Link2 className="text-primary h-4 w-4" />
            Secure link created
          </DialogTitle>
          <DialogDescription>
            The decryption key is stored in the URL fragment. If you lose this
            link, the secret cannot be recovered.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Textarea
            readOnly
            value={url}
            className="bg-input/50 border-border/50 resize-none font-mono text-xs"
            rows={4}
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleCopy}
            disabled={!hasUrl}
          >
            {copied ? (
              <>
                <Check data-icon="inline-start" />
                Copied
              </>
            ) : (
              <>
                <Copy data-icon="inline-start" />
                Copy link
              </>
            )}
          </Button>
          <Button type="button" onClick={() => props.onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
