"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Lock,
  Upload,
  X,
  FileText,
  Shield,
  Eye,
  EyeOff,
  FileUp,
  MessageSquareText,
  Sparkles,
} from "lucide-react";

type TabType = "text" | "file";

export function SecretForm() {
  const [activeTab, setActiveTab] = useState<TabType>("text");
  const [secret, setSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [expiresIn, setExpiresIn] = useState("24h");
  const [maxViews, setMaxViews] = useState("1");
  const [files, setFiles] = useState<File[]>([]);
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      setFiles(Array.from(e.dataTransfer.files));
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Creating secure link...", {
      secret,
      passphrase,
      expiresIn,
      maxViews,
      files,
    });
  };

  return (
    <div className="relative">
      {/* Glow effect */}
      <div className="from-primary/20 via-primary/10 to-primary/20 absolute -inset-1 rounded-2xl bg-gradient-to-r opacity-50 blur-xl" />

      <div className="bg-card/80 border-border/50 relative rounded-2xl border p-6 shadow-2xl backdrop-blur-xl">
        {/* Tab Switcher */}
        <div className="bg-secondary/50 mb-6 flex gap-2 rounded-xl p-1">
          <button
            type="button"
            onClick={() => setActiveTab("text")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === "text"
                ? "bg-background text-foreground shadow-lg"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageSquareText className="h-4 w-4" />
            Text Secret
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("file")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === "file"
                ? "bg-background text-foreground shadow-lg"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <FileUp className="h-4 w-4" />
            File Upload
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Text Input */}
          {activeTab === "text" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="secret" className="text-foreground font-medium">
                  Your Secret
                </Label>
                <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                  <Sparkles className="h-3 w-3" />
                  Encrypted before leaving your device
                </span>
              </div>
              <Textarea
                id="secret"
                placeholder="Paste your secret, password, API key, or any sensitive data..."
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                className="bg-input/50 border-border/50 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 focus:border-primary/50 min-h-[160px] resize-none rounded-xl transition-all"
              />
              <div className="flex justify-end">
                <span className="text-muted-foreground text-[11px]">
                  {secret.length.toLocaleString()} characters
                </span>
              </div>
            </div>
          )}

          {/* File Upload */}
          {activeTab === "file" && (
            <div className="space-y-3">
              <Label className="text-foreground font-medium">
                Upload Files
              </Label>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-all duration-300 ${
                  isDragging
                    ? "border-primary bg-primary/5 scale-[1.02]"
                    : "border-border/50 hover:border-primary/50 hover:bg-secondary/30"
                }`}
              >
                <div className="bg-secondary/80 mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full">
                  <Upload className="text-primary h-5 w-5" />
                </div>
                <p className="text-foreground text-sm font-medium">
                  Drop files here or click to browse
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Files are encrypted client-side with AES-256-GCM
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="bg-secondary/30 border-border/30 flex items-center justify-between rounded-lg border px-4 py-3 backdrop-blur-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-primary/10 flex h-9 w-9 items-center justify-center rounded-lg">
                          <FileText className="text-primary h-4 w-4" />
                        </div>
                        <div>
                          <span className="text-foreground block max-w-[180px] truncate text-sm font-medium">
                            {file.name}
                          </span>
                          <span className="text-muted-foreground text-[11px]">
                            {(file.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Passphrase Toggle */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setUsePassphrase(!usePassphrase)}
              className="text-primary hover:text-primary/80 group flex items-center gap-2 text-sm transition-colors"
            >
              <div className="border-primary/50 group-hover:border-primary flex h-5 w-5 items-center justify-center rounded border transition-colors">
                {usePassphrase && (
                  <div className="bg-primary h-2.5 w-2.5 rounded-sm" />
                )}
              </div>
              <Shield className="h-4 w-4" />
              Add a passphrase for extra security
            </button>
            {usePassphrase && (
              <div className="relative pl-7">
                <Input
                  type={showPassphrase ? "text" : "password"}
                  placeholder="Enter a passphrase..."
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="bg-input/50 border-border/50 text-foreground rounded-lg pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassphrase(!showPassphrase)}
                  className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors"
                >
                  {showPassphrase ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Options Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expires" className="text-foreground text-sm">
                Expires After
              </Label>
              <Select value={expiresIn} onValueChange={setExpiresIn}>
                <SelectTrigger className="bg-input/50 border-border/50 text-foreground rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">1 hour</SelectItem>
                  <SelectItem value="24h">24 hours</SelectItem>
                  <SelectItem value="3d">3 days</SelectItem>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="views" className="text-foreground text-sm">
                View Limit
              </Label>
              <Select value={maxViews} onValueChange={setMaxViews}>
                <SelectTrigger className="bg-input/50 border-border/50 text-foreground rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 view</SelectItem>
                  <SelectItem value="3">3 views</SelectItem>
                  <SelectItem value="5">5 views</SelectItem>
                  <SelectItem value="10">10 views</SelectItem>
                  <SelectItem value="unlimited">Unlimited</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            size="lg"
            className="from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground shadow-primary/20 hover:shadow-primary/30 h-12 w-full rounded-xl bg-gradient-to-r font-semibold shadow-lg transition-all"
            disabled={
              (activeTab === "text" && !secret.trim()) ||
              (activeTab === "file" && files.length === 0)
            }
          >
            <Lock className="mr-2 h-4 w-4" />
            Generate Secure Link
          </Button>

          <p className="text-muted-foreground text-center text-[11px]">
            Your data is encrypted locally using AES-256-GCM. The decryption key
            only exists in the generated URL.
          </p>
        </form>
      </div>
    </div>
  );
}
