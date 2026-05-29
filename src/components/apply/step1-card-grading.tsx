"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { GRADING_COMPANIES } from "@/constants/grading";
import type { ApplyFormData, OrderGroupFormData } from "@/types/apply-form";
import { createInitialGroup, syncFrontImageSlots } from "@/types/apply-form";
import type { GradingCompany, GradingService } from "@/types";

interface Step1Props {
  data: ApplyFormData;
  onChange: (updates: Partial<ApplyFormData>) => void;
  services: GradingService[];
}

const MAX_QUANTITY = 50;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png"];

export function Step1CardGrading({ data, onChange, services }: Step1Props) {
  const updateGroup = (index: number, updates: Partial<OrderGroupFormData>) => {
    const next = [...data.groups];
    next[index] = { ...next[index], ...updates };
    onChange({ groups: next });
  };

  // 수량 변경 시 frontImages 슬롯 배열도 함께 동기화한다.
  const updateGroupQuantity = (index: number, quantity: number) => {
    const current = data.groups[index];
    updateGroup(index, {
      quantity,
      frontImages: syncFrontImageSlots(current.frontImages, quantity),
    });
  };

  const updateGroupImage = (
    index: number,
    slotIdx: number,
    file: File | null
  ) => {
    const current = data.groups[index];
    const arr = [...current.frontImages];
    arr[slotIdx] = file;
    updateGroup(index, { frontImages: arr });
  };

  const addGroup = () => {
    onChange({ groups: [...data.groups, createInitialGroup()] });
  };

  const removeGroup = (index: number) => {
    if (data.groups.length <= 1) return;
    onChange({ groups: data.groups.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">그레이딩 옵션 · 매수</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          그레이딩사와 서비스 등급, 카드 매수만 선택해 주세요. 카드별 상세
          정보(이름·세트·연도·사진 등)는 매장 직원이 카드 수령 시 직접 입력해
          드립니다. 서로 다른 그레이딩사 또는 서비스 등급은 별도 주문으로
          분리됩니다.
        </p>
      </div>

      {data.groups.map((group, index) => {
        const company = group.gradingCompany as GradingCompany | "";
        const companyServices = company
          ? services.filter((s) => s.company === company)
          : [];
        const selectedService = companyServices.find(
          (s) => s.code === group.serviceLevel
        );
        const lineTotal =
          selectedService && group.quantity > 0
            ? selectedService.price * group.quantity
            : 0;

        return (
          <div
            key={group.id}
            className="space-y-4 rounded-lg border border-border p-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">주문 #{index + 1}</h3>
              {data.groups.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeGroup(index)}
                  className="text-error hover:text-error/80"
                >
                  삭제
                </Button>
              )}
            </div>

            {/* 그레이딩사 */}
            <div className="space-y-2">
              <Label>
                그레이딩사 <span className="text-error">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {GRADING_COMPANIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() =>
                      updateGroup(index, {
                        gradingCompany: c.value,
                        serviceLevel: "",
                      })
                    }
                    className={cn(
                      "cursor-pointer rounded-lg border-2 p-3 text-sm font-bold transition-all hover:border-primary sm:p-2",
                      group.gradingCompany === c.value
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 서비스 등급 */}
            {company && (
              <div className="space-y-2">
                <Label>
                  서비스 등급 <span className="text-error">*</span>
                </Label>
                {companyServices.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    등록된 서비스가 없습니다.
                  </p>
                ) : (
                  <>
                    <Select
                      value={group.serviceLevel}
                      onChange={(e) =>
                        updateGroup(index, { serviceLevel: e.target.value })
                      }
                    >
                      <option value="">서비스 등급을 선택하세요</option>
                      {companyServices.map((service) => (
                        <option key={service.code} value={service.code}>
                          {company} {service.name} -{" "}
                          {service.price.toLocaleString()}원 (
                          {service.estimatedDays})
                        </option>
                      ))}
                    </Select>
                    {selectedService && (
                      <p className="text-xs text-muted-foreground">
                        카드당 {selectedService.price.toLocaleString()}원 · 예상{" "}
                        {selectedService.estimatedDays}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 매수 */}
            <div className="space-y-2">
              <Label>
                카드 매수 <span className="text-error">*</span>
              </Label>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={group.quantity <= 1}
                  onClick={() =>
                    updateGroupQuantity(
                      index,
                      Math.max(1, group.quantity - 1)
                    )
                  }
                >
                  −
                </Button>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_QUANTITY}
                  value={group.quantity}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    const v = Number.isFinite(raw)
                      ? Math.min(Math.max(1, Math.floor(raw)), MAX_QUANTITY)
                      : 1;
                    updateGroupQuantity(index, v);
                  }}
                  className="w-24 text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={group.quantity >= MAX_QUANTITY}
                  onClick={() =>
                    updateGroupQuantity(
                      index,
                      Math.min(MAX_QUANTITY, group.quantity + 1)
                    )
                  }
                >
                  +
                </Button>
                <span className="text-xs text-muted-foreground">
                  최대 {MAX_QUANTITY}장
                </span>
              </div>
              {lineTotal > 0 && (
                <p className="text-xs text-muted-foreground">
                  소계: {lineTotal.toLocaleString()}원
                </p>
              )}
            </div>

            {/* 카드 앞면 이미지 — 매수만큼 슬롯 표시 */}
            <div className="space-y-2">
              <Label>
                카드 앞면 이미지 <span className="text-error">*</span>
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  매수만큼 모든 슬롯을 업로드해 주세요
                </span>
              </Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                {group.frontImages.map((file, slotIdx) => (
                  <CardImageSlot
                    key={`${group.id}-slot-${slotIdx}`}
                    file={file}
                    slotIndex={slotIdx}
                    onChange={(next) => updateGroupImage(index, slotIdx, next)}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                JPG/PNG, 슬롯당 최대 10MB. 흐릿하거나 잘리지 않게 카드 전체가
                보이도록 촬영해 주세요.
              </p>
            </div>
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        onClick={addGroup}
        className="w-full"
      >
        + 다른 그레이딩사/등급 추가
      </Button>
    </div>
  );
}

interface CardImageSlotProps {
  file: File | null;
  slotIndex: number;
  onChange: (file: File | null) => void;
}

function CardImageSlot({ file, slotIndex, onChange }: CardImageSlotProps) {
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // 미리보기 URL은 File 이 바뀔 때만 새로 만들고 unmount 시 해제한다.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const inputId = `card-front-${slotIndex}-${Math.random().toString(36).slice(2, 8)}`;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    if (!picked) {
      onChange(null);
      setError(null);
      return;
    }
    if (!ACCEPTED_IMAGE_TYPES.includes(picked.type)) {
      setError("JPG/PNG만 가능");
      e.target.value = "";
      return;
    }
    if (picked.size > MAX_IMAGE_BYTES) {
      setError("10MB 초과");
      e.target.value = "";
      return;
    }
    setError(null);
    onChange(picked);
    // 같은 파일 재선택 가능하도록 input value 리셋
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={inputId}
        className={cn(
          "group relative flex aspect-[3/4] cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed bg-muted/30 transition-colors",
          file
            ? "border-primary/40"
            : "border-border hover:border-primary/40 hover:bg-muted/50"
        )}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={`카드 #${slotIndex + 1} 앞면`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-center text-muted-foreground">
            <span className="text-xs font-medium">카드 #{slotIndex + 1}</span>
            <span className="text-[11px]">탭하여 업로드</span>
          </div>
        )}
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png"
          onChange={handleFileChange}
          className="sr-only"
        />
      </label>
      {file && (
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setError(null);
          }}
          className="text-[11px] text-error hover:underline"
        >
          제거
        </button>
      )}
      {error && <p className="text-[11px] text-error">{error}</p>}
    </div>
  );
}
