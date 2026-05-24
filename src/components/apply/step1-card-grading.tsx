"use client";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { GRADING_COMPANIES } from "@/constants/grading";
import type { ApplyFormData, OrderGroupFormData } from "@/types/apply-form";
import { createInitialGroup } from "@/types/apply-form";
import type { GradingCompany, GradingService } from "@/types";

interface Step1Props {
  data: ApplyFormData;
  onChange: (updates: Partial<ApplyFormData>) => void;
  services: GradingService[];
}

const MAX_QUANTITY = 50;

export function Step1CardGrading({ data, onChange, services }: Step1Props) {
  const updateGroup = (index: number, updates: Partial<OrderGroupFormData>) => {
    const next = [...data.groups];
    next[index] = { ...next[index], ...updates };
    onChange({ groups: next });
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
                      "cursor-pointer rounded-lg border-2 p-2 text-sm font-bold transition-all hover:border-primary",
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
                    updateGroup(index, {
                      quantity: Math.max(1, group.quantity - 1),
                    })
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
                    updateGroup(index, { quantity: v });
                  }}
                  className="w-24 text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={group.quantity >= MAX_QUANTITY}
                  onClick={() =>
                    updateGroup(index, {
                      quantity: Math.min(MAX_QUANTITY, group.quantity + 1),
                    })
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
