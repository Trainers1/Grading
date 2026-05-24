"use client";

import { cn } from "@/lib/utils";

interface RadioOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface RadioGroupProps {
  name: string;
  options: RadioOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function RadioGroup({
  name,
  options,
  value,
  onChange,
  className,
}: RadioGroupProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex items-start gap-3 rounded-lg border border-border p-4 transition-colors",
            option.disabled
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer hover:bg-muted",
            value === option.value &&
              !option.disabled &&
              "border-primary bg-primary/5"
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={option.disabled}
            onChange={() => onChange(option.value)}
            className="mt-0.5 h-4 w-4 text-primary focus:ring-primary"
          />
          <div>
            <div className="text-sm font-medium">{option.label}</div>
            {option.description && (
              <div className="mt-1 text-xs text-muted-foreground">
                {option.description}
              </div>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}
