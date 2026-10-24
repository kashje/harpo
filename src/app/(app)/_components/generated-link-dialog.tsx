"use client";

import { useCallback, useState } from "react";

import { Check, Copy, Link2, Trash2 } from "lucide-react";
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

function CopyableLink(props: {
  label: string;
  description: string;
  url: string;
  icon: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!props.url) return;
    try {
      await navigator.clipboard.writeText(props.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      toast.error("Unable to copy link", {
        description:
          (error as { message?: string }).message ?? "Please copy it manually.",
      });
    }
  }, [props.url]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-foreground flex items-center gap-2 text-sm font-medium">
          {props.icon}
          {props.label}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          disabled={!props.url}
        >
          {copied ? (
            <>
              <Check data-icon="inline-start" />
              Copied
            </>
          ) : (
            <>
              <Copy data-icon="inline-start" />
              Copy
            </>
          )}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">{props.description}</p>
      <Textarea
        readOnly
        value={props.url}
        className="bg-input/50 border-border/50 resize-none font-mono text-xs"
        rows={3}
      />
    </div>
  );
}

export function GeneratedLinkDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string | null;
  deleteUrl: string | null;
}) {
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

        <CopyableLink
          label="Share link"
          description="Send this link to the recipient."
          url={props.url ?? ""}
          icon={<Link2 className="text-primary h-4 w-4" />}
        />

        <CopyableLink
          label="Delete link"
          description="Keep this link to yourself. It deletes the secret, as long as nobody has viewed it yet."
          url={props.deleteUrl ?? ""}
          icon={<Trash2 className="text-destructive h-4 w-4" />}
        />

        <DialogFooter>
          <Button type="button" onClick={() => props.onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
