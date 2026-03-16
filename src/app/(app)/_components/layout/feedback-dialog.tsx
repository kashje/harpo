"use client";

import { Bug, MessageCirclePlus, Sparkles } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const GITHUB_REPO = "https://github.com/kashje/harpo";
const BUG_REPORT_URL = `${GITHUB_REPO}/issues/new?template=bug_report.yml`;
const FEATURE_REQUEST_URL = `${GITHUB_REPO}/issues/new?template=feature_request.yml`;

export function FeedbackDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button aria-label="Submit feedback" className="text-sm">
          Feedback
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Submit feedback</DialogTitle>
          <DialogDescription>
            Report a bug or suggest a new feature on GitHub. You’ll be taken to
            the repository to open an issue.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <Button variant="outline" className="gap-3" asChild>
            <Link
              href={BUG_REPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Bug className="size-3" />
              <span>Report a bug</span>
            </Link>
          </Button>
          <Button variant="outline" className="gap-3" asChild>
            <Link
              href={FEATURE_REQUEST_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Sparkles className="size-3" />
              <span>Request a feature</span>
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
