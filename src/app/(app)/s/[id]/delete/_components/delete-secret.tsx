"use client";

import { useSyncExternalStore } from "react";
import { CheckCircle, Trash2 } from "lucide-react";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// The delete token lives in the URL fragment, which is never sent to the server.
function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getTokenFromHash() {
  return window.location.hash.slice(1) || null;
}

/** `undefined` while rendering on the server, where the fragment is unknown. */
function getServerTokenFromHash() {
  return undefined;
}

export function DeleteSecret({ idToken }: { idToken: string }) {
  const deleteSecret = api.secret.delete.useMutation();
  const deleteToken = useSyncExternalStore(
    subscribeToHash,
    getTokenFromHash,
    getServerTokenFromHash,
  );

  return (
    <Card className="bg-card/60 border-border/50 backdrop-blur-xl">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-4 text-2xl font-bold text-balance">
          <div className="bg-destructive/10 flex h-8 w-8 items-center justify-center">
            <Trash2 className="text-destructive h-4 w-4" />
          </div>
          Delete secret
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Permanently delete this secret before anyone views it. Once it has
          been viewed, it can no longer be deleted.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {deleteToken === null && (
          <Alert className="border-red-500/30 bg-red-500/10 text-red-500">
            <AlertTitle>Delete token missing</AlertTitle>
            <AlertDescription className="text-red-500/80">
              Make sure you opened the full delete link.
            </AlertDescription>
          </Alert>
        )}

        {deleteSecret.isError && (
          <Alert className="border-red-500/30 bg-red-500/10 text-red-500">
            <AlertTitle>Could not delete secret</AlertTitle>
            <AlertDescription className="text-red-500/80">
              {deleteSecret.error.message}
            </AlertDescription>
          </Alert>
        )}

        {deleteSecret.isSuccess ? (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Secret deleted</AlertTitle>
            <AlertDescription>
              The secret has been removed. The share link no longer works.
            </AlertDescription>
          </Alert>
        ) : (
          <Button
            type="button"
            variant="destructive"
            size="lg"
            className="w-full"
            disabled={!deleteToken || deleteSecret.isPending}
            onClick={() =>
              deleteToken && deleteSecret.mutate({ idToken, deleteToken })
            }
          >
            <Trash2 className="h-4 w-4" />
            Delete secret
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
