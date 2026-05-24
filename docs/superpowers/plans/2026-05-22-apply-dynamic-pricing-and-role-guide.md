# 신청 폼 동적 가격 연동 + 관리자 역할 권한 안내 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고객 신청 폼이 `grading_services` DB 의 활성 서비스/가격을 표시하도록 전환하고, 설정탭에 관리자 역할별 권한 안내 섹션을 추가한다.

**Architecture:** `apply/page.tsx` 를 서버 컴포넌트로 바꿔 활성 서비스를 DB 에서 fetch 하고, 클라이언트 폼 로직은 새 `apply-form.tsx` 로 분리해 `services` prop 으로 전달한다. 서버 결제 로직(`createOrdersAction`)은 이미 DB 기반이라 변경하지 않는다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase (Postgres).

---

## 사전 안내 — 검증 방식 / git

- **테스트 러너 없음.** 검증은 `pnpm build`(타입체크 포함) + 수동 확인으로 한다.
- **`pnpm lint` 는 프로젝트 전역 사전 이슈로 실행 불가** (Next 16 이 `next lint` 제거,
  `@eslint/eslintrc` 미설치). 본 작업과 무관 — 빌드로 갈음한다.
- **git 저장소 아님.** 커밋 단계 없음. 각 태스크는 `pnpm build` 통과로 마무리.
- `next build` 는 tsconfig include 범위의 모든 `.ts/.tsx` 를 타입체크한다.

## File Structure

**신규 파일**

| 파일 | 책임 |
|---|---|
| `src/app/(user)/apply/_components/apply-form.tsx` | 신청 폼 클라이언트 컴포넌트 (services prop 수용) |

**수정 파일**

| 파일 | 변경 |
|---|---|
| `src/lib/orders/queries.ts` | `getActiveGradingServices()` 추가 |
| `src/app/(user)/apply/page.tsx` | 서버 컴포넌트로 전환, 서비스 fetch |
| `src/components/apply/step1-card-grading.tsx` | `services` prop 수용, `SERVICE_LEVELS` 제거 |
| `src/app/(admin)/admin/settings/_components/admin-users-editor.tsx` | `RolePermissionGuide` 추가 + 2단 그리드 |

---

## Task 1: getActiveGradingServices 쿼리 추가

**Files:**
- Modify: `src/lib/orders/queries.ts` (기존 `getAllGradingServicesForAdmin` 함수 바로 뒤, 416행 이후에 추가)

`queries.ts` 에는 이미 `mapGradingService` 매퍼(342행)와 `createServiceClient` import 가
있으므로 새 import 는 필요 없다.

- [ ] **Step 1: `getAllGradingServicesForAdmin` 함수 바로 뒤에 새 함수 추가**

`getAllGradingServicesForAdmin` 함수의 닫는 `}` 다음 줄에 아래를 추가한다:

```ts

// 고객 신청 폼용 — 활성(is_active=true) 서비스만 조회.
export async function getActiveGradingServices(): Promise<GradingService[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("grading_services")
    .select("*")
    .eq("is_active", true)
    .order("company", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[orders] getActiveGradingServices failed", error);
    return [];
  }
  return (data ?? []).map(mapGradingService);
}
```

- [ ] **Step 2: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공, 타입 오류 0.

---

## Task 2: 신청 폼 동적 가격 전환

`step1-card-grading.tsx`, 신규 `apply-form.tsx`, `apply/page.tsx` 세 파일은 서로
결합돼 있어 한 태스크로 처리한다(중간 상태에서는 빌드가 깨짐).

**Files:**
- Modify: `src/components/apply/step1-card-grading.tsx` (전체 교체)
- Create: `src/app/(user)/apply/_components/apply-form.tsx`
- Modify: `src/app/(user)/apply/page.tsx` (전체 교체)

의존: Task 1 (`getActiveGradingServices`).

- [ ] **Step 1: `step1-card-grading.tsx` 전체를 아래 내용으로 교체**

`src/components/apply/step1-card-grading.tsx`:

```tsx
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
```

- [ ] **Step 2: 신규 `apply-form.tsx` 작성**

`src/app/(user)/apply/_components/apply-form.tsx`:

```tsx
"use client";

import { useState, useCallback, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StepIndicator } from "@/components/apply/step-indicator";
import { Step1CardGrading } from "@/components/apply/step1-card-grading";
import { Step2PickupMethod } from "@/components/apply/step2-pickup-method";
import { RadioGroup } from "@/components/ui/radio-group";
import { INITIAL_FORM, type ApplyFormData } from "@/types/apply-form";
import {
  createOrdersAction,
  type PaymentMethodChoice,
} from "@/lib/orders/actions";
import { TOSS_PAYMENT_STUB_DESCRIPTION } from "@/constants/grading";
import type { GradingCompany, GradingService } from "@/types";

// 흐름: 1) 그레이딩 옵션+매수 → 2) 수령방식 → 3) 결제수단 선택 후 신청+결제 1회로 완료.
const TOTAL_STEPS = 3;

export function ApplyForm({ services }: { services: GradingService[] }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<ApplyFormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const handleChange = useCallback((updates: Partial<ApplyFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
    setErrors([]);
  }, []);

  // 결제 금액 합산 (실시간 미리보기) — grading_services DB 단가 기준
  const totalAmount = useMemo(() => {
    let sum = 0;
    for (const g of formData.groups) {
      if (!g.gradingCompany || !g.serviceLevel) continue;
      const svc = services.find(
        (s) => s.company === g.gradingCompany && s.code === g.serviceLevel
      );
      if (!svc) continue;
      sum += svc.price * g.quantity;
    }
    return sum;
  }, [formData.groups, services]);

  const totalCards = useMemo(
    () => formData.groups.reduce((sum, g) => sum + g.quantity, 0),
    [formData.groups]
  );

  const validateStep = (currentStep: number): string[] => {
    const errs: string[] = [];

    switch (currentStep) {
      case 1: // 그레이딩 옵션 + 매수
        formData.groups.forEach((g, i) => {
          if (!g.gradingCompany)
            errs.push(`주문 #${i + 1}: 그레이딩사를 선택해 주세요.`);
          if (!g.serviceLevel)
            errs.push(`주문 #${i + 1}: 서비스 등급을 선택해 주세요.`);
          if (!Number.isInteger(g.quantity) || g.quantity < 1)
            errs.push(`주문 #${i + 1}: 카드 매수는 1 이상이어야 합니다.`);
        });
        break;
      case 2: // 수령 방식
        if (
          formData.pickupMethod === "DELIVERY" &&
          !formData.deliveryAddress.trim()
        )
          errs.push("배송 주소를 입력해 주세요.");
        break;
      case 3: // 결제 수단
        if (!formData.paymentMethod) errs.push("결제 수단을 선택해 주세요.");
        break;
    }

    return errs;
  };

  const handleNext = () => {
    const errs = validateStep(step);
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePrev = () => {
    setErrors([]);
    setStep((s) => Math.max(s - 1, 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = () => {
    const errs = [
      ...validateStep(1),
      ...validateStep(2),
      ...validateStep(3),
    ];
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }

    startTransition(async () => {
      const result = await createOrdersAction({
        pickupMethod: formData.pickupMethod,
        deliveryAddress: formData.deliveryAddress,
        spoilerPreference: formData.spoilerPreference,
        customerMemo: formData.customerMemo,
        paymentMethod: formData.paymentMethod,
        groups: formData.groups.map((g) => ({
          gradingCompany: g.gradingCompany as GradingCompany,
          serviceLevel: g.serviceLevel,
          quantity: g.quantity,
        })),
      });

      if (!result.ok) {
        setErrors([result.error]);
        return;
      }

      router.push(`/mypage?paid=${result.orderIds.join(",")}`);
    });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-center text-2xl font-bold">그레이딩 신청</h1>
      <p className="mb-8 text-center text-sm text-muted-foreground">
        옵션과 매수를 선택하고 결제하면 신청이 완료됩니다. 카드별 정보는 매장
        직원이 카드 수령 시 직접 입력해 드립니다.
      </p>

      <StepIndicator currentStep={step} />

      {errors.length > 0 && (
        <div className="mb-6 rounded-lg border border-error/30 bg-error/5 p-4">
          <ul className="space-y-1 text-sm text-error">
            {errors.map((err, i) => (
              <li key={i}>• {err}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-6">
        {step === 1 && (
          <Step1CardGrading
            data={formData}
            onChange={handleChange}
            services={services}
          />
        )}
        {step === 2 && (
          <Step2PickupMethod data={formData} onChange={handleChange} />
        )}
        {step === 3 && (
          <PaymentStep
            formData={formData}
            onChange={handleChange}
            totalAmount={totalAmount}
            totalCards={totalCards}
          />
        )}
      </div>

      <div className="mt-6 flex justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={handlePrev}
          disabled={step === 1 || isPending}
        >
          이전
        </Button>

        {step < TOTAL_STEPS ? (
          <Button type="button" onClick={handleNext}>
            다음
          </Button>
        ) : (
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending
              ? "결제 처리 중..."
              : `${totalAmount.toLocaleString()}원 결제하기`}
          </Button>
        )}
      </div>
    </div>
  );
}

function PaymentStep({
  formData,
  onChange,
  totalAmount,
  totalCards,
}: {
  formData: ApplyFormData;
  onChange: (updates: Partial<ApplyFormData>) => void;
  totalAmount: number;
  totalCards: number;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">결제</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          신청 내용을 확인하고 결제 수단을 선택해 주세요. 결제 완료 시 즉시
          신청이 접수됩니다.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-4 text-sm">
        <SummaryRow label="총 카드 매수" value={`${totalCards}장`} />
        <SummaryRow
          label="신청 건수"
          value={`${formData.groups.length}건`}
        />
        <SummaryRow
          label="수령 방식"
          value={
            formData.pickupMethod === "STORE_PICKUP" ? "매장 수령" : "택배"
          }
        />
        <div className="border-t border-border pt-2">
          <SummaryRow
            label={<span className="font-medium">총 결제 금액</span>}
            value={
              <span className="font-bold text-primary">
                {totalAmount.toLocaleString()}원
              </span>
            }
          />
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-semibold">결제 수단</h3>
        <RadioGroup
          name="apply-payment-method"
          value={formData.paymentMethod}
          onChange={(v) =>
            onChange({ paymentMethod: v as PaymentMethodChoice })
          }
          options={[
            {
              value: "ONSITE",
              label: "현장결제",
              description:
                "매장에서 카드 전달 시 직접 결제합니다. 결제 처리 즉시 카드 전달 대기 상태로 전환됩니다.",
            },
            {
              value: "CARD",
              label: "신용카드 (토스페이먼츠)",
              description: TOSS_PAYMENT_STUB_DESCRIPTION,
            },
            {
              value: "TRANSFER",
              label: "계좌이체 (토스페이먼츠)",
              description: TOSS_PAYMENT_STUB_DESCRIPTION,
            },
            {
              value: "EASY_PAY",
              label: "간편결제 (토스페이먼츠)",
              description: TOSS_PAYMENT_STUB_DESCRIPTION,
            },
          ]}
        />
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
```

- [ ] **Step 3: `apply/page.tsx` 전체를 아래 내용으로 교체**

`src/app/(user)/apply/page.tsx`:

```tsx
import { getActiveGradingServices } from "@/lib/orders/queries";
import { ApplyForm } from "./_components/apply-form";

// 서비스 가격 변경이 즉시 반영되도록 동적 렌더링.
export const dynamic = "force-dynamic";

export default async function ApplyPage() {
  const services = await getActiveGradingServices();
  return <ApplyForm services={services} />;
}
```

- [ ] **Step 4: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공, 타입 오류 0. `/apply` 라우트가 정상 생성됨.

---

## Task 3: 관리자 역할별 권한 안내 섹션

**Files:**
- Modify: `src/app/(admin)/admin/settings/_components/admin-users-editor.tsx`

- [ ] **Step 1: `AdminUsersEditor` 의 CreateAdminForm 렌더를 2단 그리드로 변경**

`admin-users-editor.tsx` 에서 아래 한 줄을 찾는다:

```tsx
      {canManage && <CreateAdminForm />}
```

아래로 교체한다:

```tsx
      {canManage && (
        <div className="grid gap-4 lg:grid-cols-2">
          <CreateAdminForm />
          <RolePermissionGuide />
        </div>
      )}
```

- [ ] **Step 2: `RolePermissionGuide` 컴포넌트 추가**

`admin-users-editor.tsx` 에서 `CreateAdminForm` 함수의 닫는 `}` 를 찾는다 — 다음 줄로
끝난다:

```tsx
    </section>
  );
}
```

(이는 `CreateAdminForm` 의 끝이며, 바로 다음은 `function ApprovedRow({` 이다.)

`CreateAdminForm` 의 닫는 `}` 와 `function ApprovedRow(` 사이에 아래 컴포넌트를
삽입한다:

```tsx

function RolePermissionGuide() {
  const rows: { role: string; summary: string; tone: string }[] = [
    {
      role: "슈퍼 관리자",
      summary:
        "모든 기능 — 주문 상태 변경·카드 정보 입력·주문 취소·환불, 주문 영구 삭제, 관리자 계정 관리, 서비스 가격표 변경",
      tone: "text-primary",
    },
    {
      role: "일반 관리자",
      summary:
        "주문 상태 변경·카드 정보 입력·주문 취소·환불 처리 가능. 주문 영구 삭제·관리자 계정 관리·가격표 변경 불가.",
      tone: "text-foreground",
    },
    {
      role: "매장 공유 계정",
      summary:
        "주문 조회 + 주문 상태 변경만 가능. 카드 정보 입력·주문 취소·환불·삭제 불가.",
      tone: "text-muted-foreground",
    },
  ];

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">역할별 권한</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          관리자 계정 역할에 따른 기능 차이입니다.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.role} className="px-4 py-2.5">
            <p className={`text-xs font-semibold ${r.tone}`}>{r.role}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {r.summary}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공, 타입 오류 0.

---

## Task 4: 최종 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 빌드**

Run: `pnpm build`
Expected: 빌드 성공, 타입 오류 0, `/apply` 포함 전 라우트 생성.

- [ ] **Step 2: 수동 확인 (`pnpm dev`)**

- [ ] 설정탭에서 서비스 가격 수정 후 `/apply` 1단계 진입 → 드롭다운 가격·소계·하단
      총액 버튼이 수정된 값으로 표시된다.
- [ ] 설정탭에서 서비스를 비활성화 → `/apply` 드롭다운에서 사라진다.
- [ ] 활성 서비스가 없는 회사를 선택 → "등록된 서비스가 없습니다" 안내가 표시된다.
- [ ] 신청 폼에 표시된 총액과 결제 후 생성된 주문의 `prepaid_amount` 가 일치한다.
- [ ] 설정탭 "새 관리자 추가" 옆에 "역할별 권한" 안내가 데스크톱에서 2단으로,
      모바일에서 세로 스택으로 표시된다.

---

## Self-Review (작성자 점검 결과)

**1. Spec coverage**

- Part 1.1 `getActiveGradingServices()` → Task 1. ✅
- Part 1.2 `apply/page.tsx` 서버 컴포넌트 전환 + `force-dynamic` → Task 2 Step 3. ✅
- Part 1.3 신규 `apply-form.tsx` (services prop, totalAmount DB 기반) → Task 2 Step 2. ✅
- Part 1.4 `step1-card-grading.tsx` services prop + 빈 카탈로그 안내 → Task 2 Step 1. ✅
- Part 1.5 `SERVICE_LEVELS` 유지 → 어느 태스크도 삭제하지 않음. ✅
- Part 1.6 `createOrdersAction` 변경 없음 → 어느 태스크도 건드리지 않음. ✅
- Part 2 `RolePermissionGuide` + 2단 그리드 → Task 3. ✅

**2. Placeholder scan:** TBD/TODO/모호 표현 없음. 모든 코드 단계에 완전한 코드 포함. ✅

**3. Type consistency**

- `getActiveGradingServices(): Promise<GradingService[]>` — Task 1 정의, Task 2 Step 3
  page.tsx 에서 호출, 결과를 `ApplyForm services` prop 으로 전달. ✅
- `ApplyForm` props `{ services: GradingService[] }` — Task 2 Step 2 정의, Step 3 에서
  동일하게 사용. ✅
- `Step1Props.services: GradingService[]` — Task 2 Step 1 정의, Step 2 의 `ApplyForm`
  이 `<Step1CardGrading services={services}>` 로 전달. ✅
- `GradingService` 필드 사용(`company`/`code`/`name`/`price`/`estimatedDays`) — `@/types`
  의 `GradingService` 인터페이스와 일치. ✅
- `RolePermissionGuide` — Task 3 Step 2 정의, Step 1 에서 렌더. ✅
