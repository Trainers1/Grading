"use client";

import { useCallback, useState, type ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import { PHOTO_UPLOAD } from "@/constants/grading";

interface FileUploadProps {
  label: string;
  accept?: string;
  maxSizeMB?: number;
  value?: File | null;
  previewUrl?: string;
  onChange: (file: File | null) => void;
  className?: string;
  required?: boolean;
}

export function FileUpload({
  label,
  accept = PHOTO_UPLOAD.acceptedExtensions,
  maxSizeMB = PHOTO_UPLOAD.maxSizeMB,
  value,
  previewUrl,
  onChange,
  className,
  required,
}: FileUploadProps) {
  const [preview, setPreview] = useState<string | null>(previewUrl ?? null);
  const [error, setError] = useState<string | null>(null);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      setError(null);

      if (!file) {
        setPreview(null);
        onChange(null);
        return;
      }

      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`파일 크기는 ${maxSizeMB}MB 이하여야 합니다.`);
        return;
      }

      if (
        !PHOTO_UPLOAD.acceptedFormats.includes(
          file.type as (typeof PHOTO_UPLOAD.acceptedFormats)[number]
        )
      ) {
        setError("JPG 또는 PNG 파일만 업로드 가능합니다.");
        return;
      }

      const url = URL.createObjectURL(file);
      setPreview(url);
      onChange(file);
    },
    [maxSizeMB, onChange]
  );

  const handleRemove = useCallback(() => {
    setPreview(null);
    setError(null);
    onChange(null);
  }, [onChange]);

  return (
    <div className={cn("space-y-2", className)}>
      <span className="text-sm font-medium">
        {label}
        {required && <span className="ml-1 text-error">*</span>}
      </span>

      {preview ? (
        <div className="relative">
          <img
            src={preview}
            alt={label}
            className="h-32 w-32 rounded-md border border-border object-cover"
          />
          <button
            type="button"
            onClick={handleRemove}
            className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-error text-xs text-white hover:bg-error/90"
          >
            X
          </button>
        </div>
      ) : (
        <label className="flex h-32 w-32 cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed border-border hover:border-primary hover:bg-muted/50">
          <span className="text-2xl text-muted-foreground">+</span>
          <span className="mt-1 text-xs text-muted-foreground">사진 업로드</span>
          <input
            type="file"
            accept={accept}
            onChange={handleChange}
            className="hidden"
          />
        </label>
      )}

      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
