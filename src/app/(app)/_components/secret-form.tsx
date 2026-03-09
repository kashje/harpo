"use client";

import { useRef, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Eye,
  EyeOff,
  FileText,
  FileUp,
  Lock,
  MessageSquareText,
  Shield,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

type TabType = "text" | "file";

const formSchema = z
  .object({
    mode: z.enum(["text", "file"]),
    secret: z.string().trim().optional(),
    passphrase: z.string().optional(),
    expiresIn: z.enum(["1h", "24h", "3d", "7d", "30d"]),
    maxViews: z.enum(["1", "3", "5", "10", "unlimited"]),
    files: z.array(z.instanceof(File)).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "text" && !data.secret?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Secret is required",
        path: ["secret"],
      });
    }

    if (data.mode === "file" && (!data.files || data.files.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one file is required",
        path: ["files"],
      });
    }
  });

type SecretFormValues = z.infer<typeof formSchema>;

export function SecretForm() {
  const [activeTab, setActiveTab] = useState<TabType>("text");
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<SecretFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mode: "text",
      secret: "",
      passphrase: "",
      expiresIn: "24h",
      maxViews: "1",
      files: [],
    },
  });

  const onSubmit = (values: SecretFormValues) => {
    console.log("Creating secure link...", values);
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
            onClick={() => {
              setActiveTab("text");
              form.setValue("mode", "text", { shouldValidate: true });
            }}
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
            onClick={() => {
              setActiveTab("file");
              form.setValue("mode", "file", { shouldValidate: true });
            }}
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

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          {/* Text Input */}
          {activeTab === "text" && (
            <Controller
              control={form.control}
              name="secret"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <div className="flex items-center justify-between">
                    <FieldLabel
                      htmlFor={field.name}
                      className="text-foreground font-medium"
                    >
                      Your Secret
                    </FieldLabel>
                    <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
                      <Sparkles className="h-3 w-3" />
                      Encrypted before leaving your device
                    </span>
                  </div>
                  <Textarea
                    id={field.name}
                    placeholder="Paste your secret, password, API key, or any sensitive data..."
                    className="bg-input/50 border-border/50 text-foreground placeholder:text-muted-foreground focus:ring-primary/50 focus:border-primary/50 min-h-[160px] resize-none rounded-xl transition-all"
                    aria-invalid={fieldState.invalid}
                    {...field}
                  />
                  <div className="flex justify-end">
                    <span className="text-muted-foreground text-[11px]">
                      {(field.value?.length ?? 0).toLocaleString()} characters
                    </span>
                  </div>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          )}

          {/* File Upload */}
          {activeTab === "file" && (
            <Controller
              control={form.control}
              name="files"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  {(() => {
                    const value = field.value ?? [];
                    const files = Array.isArray(value) ? value : [];

                    return (
                      <>
                        <FieldLabel className="text-foreground font-medium">
                          Upload Files
                        </FieldLabel>
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          onDragOver={(e) => {
                            e.preventDefault();
                            setIsDragging(true);
                          }}
                          onDragLeave={() => setIsDragging(false)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setIsDragging(false);
                            if (e.dataTransfer.files) {
                              const droppedFiles = Array.from(
                                e.dataTransfer.files,
                              );
                              field.onChange(droppedFiles);
                            }
                          }}
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
                            onChange={(e) => {
                              if (e.target.files) {
                                const selectedFiles = Array.from(
                                  e.target.files,
                                );
                                field.onChange(selectedFiles);
                              }
                            }}
                            className="hidden"
                          />
                        </div>
                        {files.length > 0 && (
                          <div className="space-y-2">
                            {files.map((file, index) => (
                              <div
                                key={file.name + index.toString()}
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
                                  onClick={() => {
                                    const nextFiles = files.filter(
                                      (_, i) => i !== index,
                                    );
                                    field.onChange(nextFiles);
                                  }}
                                  className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
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
              Add a passphrase
            </button>
            {usePassphrase && (
              <Controller
                control={form.control}
                name="passphrase"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <div className="relative">
                      <Input
                        type={showPassphrase ? "text" : "password"}
                        placeholder="Enter a passphrase..."
                        className="bg-input/50 border-border/50 text-foreground pr-10"
                        aria-invalid={fieldState.invalid}
                        {...field}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setShowPassphrase(!showPassphrase)}
                        className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition-colors hover:bg-transparent!"
                      >
                        {showPassphrase ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            )}
          </div>

          {/* Options Row */}
          <div className="grid grid-cols-2 gap-4">
            <Controller
              control={form.control}
              name="expiresIn"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="space-y-2">
                  <FieldLabel className="text-foreground text-sm">
                    Expires After
                  </FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              control={form.control}
              name="maxViews"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid} className="space-y-2">
                  <FieldLabel className="text-foreground text-sm">
                    View Limit
                  </FieldLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
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
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </div>

          {/* Submit Button */}
          <Button
            type="submit"
            size="lg"
            className="from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground shadow-primary/20 hover:shadow-primary/30 h-12 w-full rounded-xl bg-gradient-to-r font-semibold shadow-lg transition-all"
            disabled={form.formState.isSubmitting}
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
