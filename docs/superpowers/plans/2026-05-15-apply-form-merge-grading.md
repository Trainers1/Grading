# 그레이딩 신청 폼 단계 통합 + 그레이딩사 혼합 신청 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/apply` 신청 폼의 "그레이딩사 선택" 단계와 "카드 정보 입력" 단계를 하나로 합치고, 카드마다 다른 그레이딩사·서비스 등급을 지정해도 한 번의 제출로 신청이 완료되게 한다.

**Architecture:** DB 스키마는 변경하지 않는다. 그레이딩사·서비스 등급을 폼의 카드(card) 단위 상태로 옮기고, 제출 시 서버 액션이 `(그레이딩사, 서비스등급)`이 같은 카드끼리 묶어 그레이딩사별 주문(order)을 자동 생성한다. 폼 1회 제출 → 주문 N건. 3단계 → 2단계 흐름.

**Tech Stack:** Next.js 16 (App Router, "use client"), React 19, TypeScript, Supabase (`@supabase/ssr` + service-role client), Tailwind v4.

> **저장소 비고:** 이 프로젝트는 아직 git 저장소가 아니고 테스트 러너도 없다. 따라서 각 태스크의 검증은 `pnpm tsc --noEmit` / `pnpm build` / 수동 확인으로 하며, git commit 단계는 생략한다. 한국어 UI 문자열·주석 컨벤션을 유지한다.

**Spec:** `docs/superpowers/specs/2026-05-15-apply-form-merge-grading-design.md`

---

## File Structure

| 파일 | 동작 | 책임 |
|------|------|------|
| `src/constants/grading.ts` | Modify | `SERVICE_LEVELS` 맵 추가 (그레이딩사별 서비스 등급 카탈로그) |
| `src/types/apply-form.ts` | Modify | `CardFormData`에 `gradingCompany`/`serviceLevel` 추가, `ApplyFormData`에서 최상위 두 필드 제거 |
| `src/components/apply/step1-card-grading.tsx` | Create | 통합 스텝 — 카드별 그레이딩사·등급 선택 + 카드 정보 입력 |
| `src/components/apply/step2-pickup-method.tsx` | Create (rename) | 기존 `step4-pickup-method.tsx`를 이 이름으로 이동, export 이름 정리 |
| `src/components/apply/step2-grading-option.tsx` | Delete | `step1-card-grading.tsx`로 흡수 |
| `src/components/apply/step3-card-info.tsx` | Delete | `step1-card-grading.tsx`로 흡수 |
| `src/components/apply/step4-pickup-method.tsx` | Delete | `step2-pickup-method.tsx`로 이동 완료 후 삭제 |
| `src/components/apply/step-indicator.tsx` | Modify | 3단계 → 2단계 |
| `src/lib/orders/actions.ts` | Modify | `createOrderAction` → `createOrdersAction` (그룹핑 + 다중 주문 생성 + 전체 롤백) |
| `src/app/(user)/apply/page.tsx` | Modify | `TOTAL_STEPS=2`, 검증 규칙, `createOrdersAction` 호출, 완료 페이지 리다이렉트 |
| `src/app/(user)/apply/complete/page.tsx` | Modify | `orderId`(단수) → `orderIds`(콤마 구분 복수) 수신·표시 |

---

## Task 1: `SERVICE_LEVELS` 상수 추가

`step2-grading-option.tsx`에 하드코딩돼 있던 서비스 등급 카탈로그를 공유 상수로 옮긴다. 순수 추가이므로 이 시점 `tsc`는 그대로 통과한다.

**Files:**
- Modify: `src/constants/grading.ts`

- [ ] **Step 1: `grading.ts` 끝에 `SERVICE_LEVELS` 추가**

파일 맨 끝(`PHOTO_UPLOAD` 블록 다음)에 아래를 추가한다. 파일 상단에 이미 `import type { GradingCompany } from "@/types";`가 있으므로 추가 import 불필요.

```ts
/**
 * 등급회사별 서비스 등급 선택지 (신청 폼 표시용).
 * 실제 단가 검증은 서버에서 grading_services 테이블로 수행한다.
 * (추후 grading_services 동적 로드로 대체 예정)
 */
export const SERVICE_LEVELS: Record<
  GradingCompany,
  { value: string; label: string; price: number; days: string }[]
> = {
  PSA: [
    { value: "psa_economy", label: "Economy", price: 30000, days: "65영업일" },
    { value: "psa_regular", label: "Regular", price: 55000, days: "30영업일" },
    { value: "psa_express", label: "Express", price: 110000, days: "15영업일" },
    { value: "psa_super_express", label: "Super Express", price: 220000, days: "5영업일" },
  ],
  BGS: [
    { value: "bgs_standard", label: "Standard", price: 40000, days: "50영업일" },
    { value: "bgs_express", label: "Express", price: 100000, days: "10영업일" },
    { value: "bgs_premium", label: "Premium", price: 180000, days: "5영업일" },
  ],
  CGC: [
    { value: "cgc_standard", label: "Standard", price: 35000, days: "50영업일" },
    { value: "cgc_express", label: "Express", price: 85000, days: "15영업일" },
  ],
  BRG: [
    { value: "brg_standard", label: "Standard", price: 25000, days: "45영업일" },
    { value: "brg_express", label: "Express", price: 60000, days: "15영업일" },
  ],
};
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm tsc --noEmit`
Expected: PASS (0 errors) — 순수 추가이므로 기존 코드 영향 없음.

---

## Task 2: 폼 타입 갱신

그레이딩사·서비스 등급을 카드 단위로 옮긴다. **이 태스크 직후 `tsc`는 의도적으로 RED**다 — `apply/page.tsx`, `actions.ts`, 삭제 예정인 `step2-grading-option.tsx`가 제거된 필드를 참조하기 때문. 이 오류들은 Task 3~8에서 모두 해소된다.

**Files:**
- Modify: `src/types/apply-form.ts`

- [ ] **Step 1: `apply-form.ts` 전체를 아래 내용으로 교체**

```ts
import type { GradingCompany, PickupMethod, SpoilerPreference } from "./order";

/** 카드 입력 폼 데이터 */
export interface CardFormData {
  /** 이 카드를 보낼 그레이딩사 */
  gradingCompany: GradingCompany | "";
  /** 선택한 서비스 등급 코드 (예: psa_regular) */
  serviceLevel: string;
  /** 카드 별명 — 사용자가 지정하는 식별용 이름 (예: 피카츄 100덱 AR) */
  cardName: string;
  /** 카드 영문명 (예: Pikachu) — 선택, 미입력 시 직원이 보완 */
  englishName: string;
  setName: string;
  cardNumber: string;
  year: string;
  frontImage: File | null;
  backImage: File | null;
  declaredValue: string; // 폼에서는 문자열로 관리
  /** 상세 정보 직접 입력 모드 여부 (기본 false → 간편 입력) */
  isDetailed: boolean;
}

/** 신청서 전체 폼 데이터 (신청자 정보는 회원 정보에서 자동 연동) */
export interface ApplyFormData {
  // Step 1: 카드 정보 + 그레이딩 옵션 (카드별 그레이딩사·등급은 CardFormData 참조)
  cards: CardFormData[];

  // Step 2: 수령 방법
  pickupMethod: PickupMethod;
  deliveryAddress: string;

  // 동의/표시 설정 (수령 단계에서 수집)
  agreePrivacy: boolean;
  agreeTerms: boolean;
  agreeNotice: boolean;
  spoilerPreference: SpoilerPreference;
  customerMemo: string;
}

/** 폼 초기값 */
export const INITIAL_CARD: CardFormData = {
  gradingCompany: "",
  serviceLevel: "",
  cardName: "",
  englishName: "",
  setName: "",
  cardNumber: "",
  year: "",
  frontImage: null,
  backImage: null,
  declaredValue: "",
  isDetailed: false,
};

export const INITIAL_FORM: ApplyFormData = {
  cards: [{ ...INITIAL_CARD }],
  pickupMethod: "STORE_PICKUP",
  deliveryAddress: "",
  agreePrivacy: false,
  agreeTerms: false,
  agreeNotice: false,
  spoilerPreference: "ALLOW",
  customerMemo: "",
};
```

- [ ] **Step 2: 영향 범위 확인 (오류가 예상 파일에만 있는지)**

Run: `pnpm tsc --noEmit`
Expected: RED. 오류는 **다음 파일에서만** 나와야 한다:
- `src/app/(user)/apply/page.tsx` (`formData.gradingCompany` 등 참조)
- `src/lib/orders/actions.ts` (`Omit<ApplyFormData, "cards">`, `input.gradingCompany` 등)
- `src/components/apply/step2-grading-option.tsx` (`data.gradingCompany` 참조 — Task 7에서 삭제)

그 외 파일에서 오류가 나면 멈추고 원인을 조사한다. 위 3개 파일 오류는 Task 3~7에서 해소되므로 정상이다.

---

## Task 3: 통합 스텝 컴포넌트 생성

`step2-grading-option.tsx`(그레이딩사·등급)와 `step3-card-info.tsx`(카드 정보)를 하나로 합친 컴포넌트. 그레이딩사·등급 선택을 각 카드 블록 안으로 인라인 배치한다.

**Files:**
- Create: `src/components/apply/step1-card-grading.tsx`

- [ ] **Step 1: `step1-card-grading.tsx` 생성**

```tsx
"use client";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FileUpload } from "@/components/ui/file-upload";
import { GRADING_COMPANIES, SERVICE_LEVELS } from "@/constants/grading";
import type { ApplyFormData, CardFormData } from "@/types/apply-form";
import { INITIAL_CARD } from "@/types/apply-form";
import type { GradingCompany } from "@/types";

interface Step1Props {
  data: ApplyFormData;
  onChange: (updates: Partial<ApplyFormData>) => void;
}

export function Step1CardGrading({ data, onChange }: Step1Props) {
  const updateCard = (index: number, updates: Partial<CardFormData>) => {
    const newCards = [...data.cards];
    newCards[index] = { ...newCards[index], ...updates };
    onChange({ cards: newCards });
  };

  const addCard = () => {
    onChange({ cards: [...data.cards, { ...INITIAL_CARD }] });
  };

  const removeCard = (index: number) => {
    if (data.cards.length <= 1) return;
    onChange({ cards: data.cards.filter((_, i) => i !== index) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">카드 정보 · 그레이딩 옵션</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          카드마다 그레이딩사와 서비스 등급을 선택하고 정보를 입력하세요. 서로 다른
          그레이딩사를 함께 신청할 수 있습니다. 입력하지 않은 세부 정보는 매장
          직원이 보완하며, 마이페이지의 신청 내역에서 확인하실 수 있습니다.
        </p>
      </div>

      {data.cards.map((card, index) => {
        const company = card.gradingCompany as GradingCompany | "";
        const services = company ? SERVICE_LEVELS[company] : [];
        const selectedService = services.find(
          (s) => s.value === card.serviceLevel
        );

        return (
          <div
            key={index}
            className="rounded-lg border border-border p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">카드 #{index + 1}</h3>
              {data.cards.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeCard(index)}
                  className="text-error hover:text-error/80"
                >
                  삭제
                </Button>
              )}
            </div>

            {/* 그레이딩사 선택 */}
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
                      updateCard(index, {
                        gradingCompany: c.value,
                        serviceLevel: "",
                      })
                    }
                    className={cn(
                      "rounded-lg border-2 p-2 text-sm font-bold transition-all hover:border-primary cursor-pointer",
                      card.gradingCompany === c.value
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 서비스 등급 선택 */}
            {company && (
              <div className="space-y-2">
                <Label>
                  서비스 등급 <span className="text-error">*</span>
                </Label>
                <Select
                  value={card.serviceLevel}
                  onChange={(e) =>
                    updateCard(index, { serviceLevel: e.target.value })
                  }
                >
                  <option value="">서비스 등급을 선택하세요</option>
                  {services.map((service) => (
                    <option key={service.value} value={service.value}>
                      {company} {service.label} -{" "}
                      {service.price.toLocaleString()}원 ({service.days})
                    </option>
                  ))}
                </Select>
                {selectedService && (
                  <p className="text-xs text-muted-foreground">
                    카드당 {selectedService.price.toLocaleString()}원 · 예상{" "}
                    {selectedService.days}
                  </p>
                )}
              </div>
            )}

            {/* 카드 별명 */}
            <div className="space-y-2">
              <Label>
                카드 별명 <span className="text-error">*</span>
              </Label>
              <Input
                value={card.cardName ?? ""}
                onChange={(e) =>
                  updateCard(index, { cardName: e.target.value })
                }
                placeholder="예: 피카츄 100덱 AR"
              />
              <p className="text-xs text-muted-foreground">
                카드를 구분할 수 있는 이름을 자유롭게 적어 주세요.
              </p>
            </div>

            {/* 앞면 사진 */}
            <div>
              <FileUpload
                label="앞면 사진"
                required
                value={card.frontImage}
                onChange={(file) => updateCard(index, { frontImage: file })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                JPG/PNG 형식, 최대 10MB. 선명한 사진을 권장합니다.
              </p>
            </div>

            {/* 세부 정보 직접 입력 토글 */}
            {!card.isDetailed ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => updateCard(index, { isDetailed: true })}
                className="w-full"
              >
                + 세부 정보 직접 입력 (영문명, 세트, 카드번호, 신고가액, 연도, 뒷면 사진)
              </Button>
            ) : (
              <div className="space-y-4 rounded-md border border-dashed border-border bg-muted/30 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">세부 정보</p>
                    <p className="text-xs text-muted-foreground">
                      입력하지 않은 항목은 매장 직원이 보완합니다.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => updateCard(index, { isDetailed: false })}
                  >
                    접기
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>카드 이름 (영문)</Label>
                    <Input
                      value={card.englishName ?? ""}
                      onChange={(e) =>
                        updateCard(index, { englishName: e.target.value })
                      }
                      placeholder="예: Pikachu"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>카드 세트</Label>
                    <Input
                      value={card.setName ?? ""}
                      onChange={(e) =>
                        updateCard(index, { setName: e.target.value })
                      }
                      placeholder="예: 2025 POKEMON MC KR"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>카드 번호</Label>
                    <Input
                      value={card.cardNumber ?? ""}
                      onChange={(e) =>
                        updateCard(index, { cardNumber: e.target.value })
                      }
                      placeholder="예: 764/742"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>연도</Label>
                    <Input
                      value={card.year ?? ""}
                      onChange={(e) => {
                        const v = e.target.value
                          .replace(/[^0-9]/g, "")
                          .slice(0, 4);
                        updateCard(index, { year: v });
                      }}
                      placeholder="예: 2025"
                      maxLength={4}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>신고가액 (원)</Label>
                    <Input
                      type="number"
                      value={card.declaredValue ?? ""}
                      onChange={(e) =>
                        updateCard(index, { declaredValue: e.target.value })
                      }
                      placeholder="고가 카드만 입력 (오버차지용)"
                      min={0}
                    />
                  </div>
                </div>

                <div>
                  <FileUpload
                    label="뒷면 사진"
                    value={card.backImage}
                    onChange={(file) => updateCard(index, { backImage: file })}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    선택 사항. 정확한 등급 판정을 위해 권장합니다.
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <Button
        type="button"
        variant="outline"
        onClick={addCard}
        className="w-full"
      >
        + 카드 추가
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: 컴포넌트 단독 타입 체크**

Run: `pnpm tsc --noEmit`
Expected: 새 파일 자체에는 오류 없음. 전체 결과는 여전히 RED(Task 2의 미해소 오류 3건). `step1-card-grading.tsx` 줄에 오류가 표시되면 멈추고 수정한다.

---

## Task 4: 수령 스텝 컴포넌트 이름 정리

`step4-pickup-method.tsx`를 `step2-pickup-method.tsx`로 옮기고 export 이름을 `Step2PickupMethod`로 정리한다. 내용(수령 방식 + 스포일러 설정 UI)은 동일하다.

**Files:**
- Create: `src/components/apply/step2-pickup-method.tsx`
- Delete: `src/components/apply/step4-pickup-method.tsx`

- [ ] **Step 1: `step2-pickup-method.tsx` 생성**

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import type { ApplyFormData } from "@/types/apply-form";
import type { PickupMethod, SpoilerPreference } from "@/types";

interface Step2Props {
  data: ApplyFormData;
  onChange: (updates: Partial<ApplyFormData>) => void;
}

export function Step2PickupMethod({ data, onChange }: Step2Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">수령 방법 선택</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          그레이딩 완료 후 카드를 수령할 방법을 선택하세요.
        </p>
      </div>

      <RadioGroup
        name="pickupMethod"
        value={data.pickupMethod}
        onChange={(value) => onChange({ pickupMethod: value as PickupMethod })}
        options={[
          {
            value: "STORE_PICKUP",
            label: "매장 방문 수령 (기본)",
            description: "트레이너스 매장에 직접 방문하여 카드를 수령합니다.",
          },
          {
            value: "DELIVERY",
            label: "택배 수령",
            description: "택배로 배송받습니다. 택배비는 별도 후결제됩니다.",
          },
        ]}
      />

      {data.pickupMethod === "DELIVERY" && (
        <div className="space-y-2 rounded-lg bg-muted p-4">
          <Label htmlFor="deliveryAddress">
            배송 주소 <span className="text-error">*</span>
          </Label>
          <Input
            id="deliveryAddress"
            value={data.deliveryAddress}
            onChange={(e) => onChange({ deliveryAddress: e.target.value })}
            placeholder="배송받을 주소를 입력하세요"
          />
          <p className="text-xs text-muted-foreground">
            택배비는 오버차지와 함께 후결제됩니다.
          </p>
        </div>
      )}

      {data.pickupMethod === "STORE_PICKUP" && (
        <div className="rounded-lg bg-muted p-4">
          <h4 className="font-semibold">매장 안내</h4>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            <p>주소: 경기 안양시 동안구 평촌대로217번길 15 3층, 트레이너스</p>
            <p>영업시간: 월-토 12:00 ~ 22:00 / 일 12:00 ~ 21:00</p>
            <p>연락처: 0507-1352-2370</p>
          </div>
        </div>
      )}

      <div className="space-y-3 border-t border-border pt-6">
        <div>
          <h3 className="font-semibold">등급 결과 미리 보기</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            그레이딩사에서 등급이 확정된 뒤, 카드를 수령하기 전에 마이페이지에서
            결과를 확인할지 선택해 주세요.
          </p>
        </div>

        <RadioGroup
          name="spoilerPreference"
          value={data.spoilerPreference}
          onChange={(value) =>
            onChange({ spoilerPreference: value as SpoilerPreference })
          }
          options={[
            {
              value: "ALLOW",
              label: "바로 확인할게요",
              description:
                "등급이 확정되는 즉시 마이페이지에서 결과를 볼 수 있습니다.",
            },
            {
              value: "DENY",
              label: "실물 수령 후에 볼게요",
              description:
                "카드를 수령하기 전까지 등급 결과를 감춰 둡니다. 개봉 순간의 재미를 위해 추천해요.",
            },
          ]}
        />

        <p className="text-xs text-muted-foreground">
          수령방법과 미리보기 설정은 언제든지 마이페이지 &gt; 주문 상세에서
          변경하실 수 있습니다.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 옛 파일 삭제**

`src/components/apply/step4-pickup-method.tsx`를 삭제한다.

Run: `pnpm exec rm "src/components/apply/step4-pickup-method.tsx"` (Windows PowerShell: `Remove-Item "src/components/apply/step4-pickup-method.tsx"`)
Expected: 파일 삭제됨.

---

## Task 5: StepIndicator 2단계로 축소

**Files:**
- Modify: `src/components/apply/step-indicator.tsx`

- [ ] **Step 1: `STEPS` 배열과 그리드 컬럼 수정**

`step-indicator.tsx`에서 `STEPS` 정의를 아래로 교체한다:

```tsx
const STEPS = [
  { step: 1, label: "카드 · 그레이딩 옵션" },
  { step: 2, label: "수령 방식" },
];
```

같은 파일에서 그리드 컨테이너의 `grid-cols-3`을 `grid-cols-2`로 바꾼다:

```tsx
      <div className="grid grid-cols-2">
```

(나머지 렌더링 로직은 `STEPS` 길이에 따라 동작하므로 변경 불필요.)

- [ ] **Step 2: 타입 체크**

Run: `pnpm tsc --noEmit`
Expected: 여전히 RED (Task 2 미해소 오류). `step-indicator.tsx` 줄에는 오류가 없어야 한다.

---

## Task 6: 서버 액션 `createOrdersAction`

`createOrderAction`(단일 주문)을 `createOrdersAction`(그룹핑 + 다중 주문)으로 교체한다.

**Files:**
- Modify: `src/lib/orders/actions.ts`

- [ ] **Step 1: `actions.ts` 전체를 아래 내용으로 교체**

```ts
"use server";

// 주문 생성 Server Action (고객 측 apply 폼)
//
// 흐름:
//   1) auth.getUser() 로 인증 확인 — 미로그인 시 거부
//   2) profiles 조회: name/phone 보강 (orders 에 NOT NULL 로 저장)
//   3) 카드를 (그레이딩사, 서비스등급) 조합으로 그룹핑
//   4) 그룹마다: grading_services 단가 스냅샷 → generate_order_id() RPC →
//      orders + 해당 그룹 cards 일괄 삽입 (service-role; RLS 우회 — 인증/소유자 검증으로 안전)
//   5) 그룹 도중 실패 시 이번 제출로 생성된 주문 전체 롤백 (all-or-nothing)
//   6) 성공 시 { ok: true, orderIds } 반환
//
// 이미지: 카드 사진은 별도 Storage 결정 전까지 NULL (마이그레이션 005 에서 컬럼 nullable 화 완료).
// 결제: 본 액션은 PAYMENT_PENDING 상태 주문만 생성. 결제 플로우는 별도 작업.

import { createClient as createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  GradingCompany,
  PickupMethod,
  SpoilerPreference,
} from "@/types/order";

type CreateOrdersResult =
  | { ok: false; error: string }
  | { ok: true; orderIds: string[] };

type CardSubmission = {
  gradingCompany: GradingCompany;
  serviceLevel: string;
  cardName: string;
  englishName?: string;
  setName?: string;
  cardNumber?: string;
  year?: string;
  declaredValue?: number;
};

export type CreateOrdersInput = {
  cards: CardSubmission[];
  pickupMethod: PickupMethod;
  deliveryAddress: string;
  spoilerPreference: SpoilerPreference;
  customerMemo: string;
};

// 보상: 이번 제출로 생성된 주문(및 카드) 전체 삭제.
// cards 를 먼저 지운 뒤 orders 를 지운다 (FK CASCADE 여부와 무관하게 안전).
async function rollbackOrders(
  service: ReturnType<typeof createServiceClient>,
  orderIds: string[]
): Promise<void> {
  if (orderIds.length === 0) return;
  const { error: cErr } = await service
    .from("cards")
    .delete()
    .in("order_id", orderIds);
  if (cErr) {
    console.error("[orders] rollback cards failed ids=" + orderIds.join(","), cErr);
  }
  const { error: oErr } = await service
    .from("orders")
    .delete()
    .in("id", orderIds);
  if (oErr) {
    console.error("[orders] rollback orders failed ids=" + orderIds.join(","), oErr);
  }
}

export async function createOrdersAction(
  input: CreateOrdersInput
): Promise<CreateOrdersResult> {
  // 1) 인증
  let authUserId: string;
  let authEmail: string | null;
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      return { ok: false, error: "로그인이 필요합니다." };
    }
    authUserId = data.user.id;
    authEmail = data.user.email ?? null;
  } catch (err) {
    console.error("[orders] create auth failed", err);
    return { ok: false, error: "인증 확인 중 오류가 발생했습니다." };
  }

  // 폼 기본 검증
  if (!input.cards || input.cards.length === 0) {
    return { ok: false, error: "카드를 1장 이상 추가해 주세요." };
  }
  for (const [i, c] of input.cards.entries()) {
    if (!c.cardName?.trim()) {
      return { ok: false, error: `카드 #${i + 1}: 카드명을 입력해 주세요.` };
    }
    if (!c.gradingCompany) {
      return { ok: false, error: `카드 #${i + 1}: 그레이딩사를 선택해 주세요.` };
    }
    if (!c.serviceLevel) {
      return { ok: false, error: `카드 #${i + 1}: 서비스 등급을 선택해 주세요.` };
    }
  }
  if (input.pickupMethod === "DELIVERY" && !input.deliveryAddress?.trim()) {
    return { ok: false, error: "배송 주소를 입력해 주세요." };
  }

  let service;
  try {
    service = createServiceClient();
  } catch (err) {
    console.error("[orders] create service-role unavailable", err);
    return { ok: false, error: "서비스가 일시적으로 불가능합니다." };
  }

  // 2) profiles 조회
  const { data: profile, error: pErr } = await service
    .from("profiles")
    .select("id, name, phone, email")
    .eq("id", authUserId)
    .maybeSingle();

  if (pErr || !profile) {
    console.error("[orders] create profile lookup failed", pErr);
    return {
      ok: false,
      error: "회원 정보를 찾을 수 없습니다. 다시 로그인해 주세요.",
    };
  }
  if (!profile.name || !profile.phone) {
    return {
      ok: false,
      error:
        "회원 정보(성함/연락처)가 누락되어 있습니다. 마이페이지에서 먼저 등록해 주세요.",
    };
  }

  // 3) 카드를 (그레이딩사, 서비스등급) 조합으로 그룹핑
  const groups = new Map<string, CardSubmission[]>();
  for (const c of input.cards) {
    const key = `${c.gradingCompany}::${c.serviceLevel}`;
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }

  const createdOrderIds: string[] = [];

  // 4) 그룹마다 주문 생성
  for (const [key, groupCards] of groups) {
    const sep = key.indexOf("::");
    const gradingCompany = key.slice(0, sep) as GradingCompany;
    const serviceLevel = key.slice(sep + 2);

    // 4a) 서비스 단가 스냅샷
    const { data: svc, error: sErr } = await service
      .from("grading_services")
      .select("price, is_active, code, company")
      .eq("company", gradingCompany)
      .eq("code", serviceLevel)
      .maybeSingle();

    if (sErr || !svc) {
      await rollbackOrders(service, createdOrderIds);
      console.error("[orders] create grading_services lookup failed", sErr);
      return { ok: false, error: "선택한 서비스 등급을 찾을 수 없습니다." };
    }
    if (!svc.is_active) {
      await rollbackOrders(service, createdOrderIds);
      return { ok: false, error: "선택한 서비스는 현재 신청을 받지 않습니다." };
    }

    // 4b) 신규 ID
    const { data: idData, error: idErr } = await service.rpc(
      "generate_order_id"
    );
    if (idErr || !idData) {
      await rollbackOrders(service, createdOrderIds);
      console.error("[orders] generate_order_id RPC failed", idErr);
      return {
        ok: false,
        error: "주문번호 발급에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      };
    }
    const newOrderId = idData as string;

    // 4c) orders 삽입
    const prepaidAmount = svc.price * groupCards.length;
    const { error: oInsertErr } = await service.from("orders").insert({
      id: newOrderId,
      user_id: authUserId,
      name: profile.name,
      phone: profile.phone,
      pickup_method: input.pickupMethod,
      delivery_address:
        input.pickupMethod === "DELIVERY" ? input.deliveryAddress : null,
      grading_company: gradingCompany,
      service_level: svc.code,
      service_price_snapshot: svc.price,
      payment_status: "PENDING",
      prepaid_amount: prepaidAmount,
      shipping_fee: 0,
      order_status: "PAYMENT_PENDING",
      spoiler_preference: input.spoilerPreference ?? "ALLOW",
      customer_memo: input.customerMemo?.trim() || null,
    });

    if (oInsertErr) {
      await rollbackOrders(service, createdOrderIds);
      console.error("[orders] insert orders failed", oInsertErr);
      return {
        ok: false,
        error: "주문 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      };
    }
    createdOrderIds.push(newOrderId);

    // 4d) cards 삽입 (이미지 URL 은 nullable — 추후 Storage 통합 시 보강)
    const cardRows = groupCards.map((c) => ({
      order_id: newOrderId,
      card_name: c.cardName.trim(),
      english_name: c.englishName?.trim() || null,
      set_name: c.setName?.trim() || null,
      card_number: c.cardNumber?.trim() || null,
      year: c.year?.trim() || null,
      declared_value:
        typeof c.declaredValue === "number" && Number.isFinite(c.declaredValue)
          ? c.declaredValue
          : null,
      front_image_url: null,
      back_image_url: null,
    }));

    const { error: cInsertErr } = await service.from("cards").insert(cardRows);
    if (cInsertErr) {
      await rollbackOrders(service, createdOrderIds);
      console.error("[orders] insert cards failed (orders rolled back)", cInsertErr);
      return {
        ok: false,
        error: "카드 정보 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
      };
    }
  }

  // 작업자 추적용 로깅 (PII 최소화)
  const maskedEmail = authEmail
    ? authEmail.replace(/^(.).*(@.*)$/, "$1***$2")
    : "unknown";
  console.info(
    `[orders] created ids=${createdOrderIds.join(",")} user=${maskedEmail} orders=${createdOrderIds.length} cards=${input.cards.length}`
  );

  return { ok: true, orderIds: createdOrderIds };
}
```

- [ ] **Step 2: 다른 곳에서 옛 export를 참조하지 않는지 확인**

Run: `pnpm exec grep -rn "createOrderAction\|CreateOrderInput" src/` (PowerShell: `Select-String -Path src/**/*.ts*,src/**/*.ts -Pattern "createOrderAction|CreateOrderInput"`)
Expected: `src/app/(user)/apply/page.tsx`에서만 매치 (Task 7에서 교체). 그 외 파일에서 매치되면 멈추고 조사한다.

---

## Task 7: 신청 페이지 오케스트레이션 + 옛 컴포넌트 삭제

`apply/page.tsx`를 2단계 흐름으로 바꾸고, 흡수된 옛 컴포넌트 2개를 삭제한다. **이 태스크 끝에서 `tsc`가 GREEN이 되어야 한다.**

**Files:**
- Modify: `src/app/(user)/apply/page.tsx`
- Delete: `src/components/apply/step2-grading-option.tsx`
- Delete: `src/components/apply/step3-card-info.tsx`

- [ ] **Step 1: `apply/page.tsx` 전체를 아래 내용으로 교체**

```tsx
"use client";

import { useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { StepIndicator } from "@/components/apply/step-indicator";
import { Step1CardGrading } from "@/components/apply/step1-card-grading";
import { Step2PickupMethod } from "@/components/apply/step2-pickup-method";
import { INITIAL_FORM, type ApplyFormData } from "@/types/apply-form";
import { createOrdersAction } from "@/lib/orders/actions";
import type { GradingCompany } from "@/types";

// 동의 및 확인 단계는 관리자가 주문 내용을 보완한 뒤 마이페이지에서 진행되는 별도 플로우로 이동됨
const TOTAL_STEPS = 2;

export default function ApplyPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<ApplyFormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const handleChange = useCallback((updates: Partial<ApplyFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }));
    setErrors([]);
  }, []);

  const validateStep = (currentStep: number): string[] => {
    const errs: string[] = [];

    switch (currentStep) {
      case 1: // 카드 정보 + 그레이딩 옵션
        formData.cards.forEach((card, i) => {
          if (!card.gradingCompany)
            errs.push(`카드 #${i + 1}: 그레이딩사를 선택해 주세요.`);
          if (!card.serviceLevel)
            errs.push(`카드 #${i + 1}: 서비스 등급을 선택해 주세요.`);
          if (!card.cardName.trim())
            errs.push(`카드 #${i + 1}: 카드명을 입력해 주세요.`);
          if (!card.frontImage)
            errs.push(`카드 #${i + 1}: 앞면 사진을 업로드해 주세요.`);
        });
        break;
      case 2: // 수령 방법
        if (
          formData.pickupMethod === "DELIVERY" &&
          !formData.deliveryAddress.trim()
        )
          errs.push("배송 주소를 입력해 주세요.");
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
    const errs = [...validateStep(1), ...validateStep(TOTAL_STEPS)];
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
        cards: formData.cards.map((c) => ({
          gradingCompany: c.gradingCompany as GradingCompany,
          serviceLevel: c.serviceLevel,
          cardName: c.cardName,
          englishName: c.englishName || undefined,
          setName: c.setName || undefined,
          cardNumber: c.cardNumber || undefined,
          year: c.year || undefined,
          declaredValue: c.declaredValue
            ? Number.parseInt(c.declaredValue, 10)
            : undefined,
        })),
      });

      if (!result.ok) {
        setErrors([result.error]);
        return;
      }

      router.push(`/apply/complete?orderIds=${result.orderIds.join(",")}`);
    });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-center">그레이딩 신청</h1>
      <p className="mb-8 text-center text-sm text-muted-foreground">
        신청서를 접수하면 관리자가 내용을 확인·보완합니다. 이후 마이페이지에서
        최종 동의 및 결제를 진행해 주세요.
      </p>

      <StepIndicator currentStep={step} />

      {/* 에러 메시지 */}
      {errors.length > 0 && (
        <div className="mb-6 rounded-lg border border-error/30 bg-error/5 p-4">
          <ul className="space-y-1 text-sm text-error">
            {errors.map((err, i) => (
              <li key={i}>• {err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 스텝 컨텐츠 */}
      <div className="rounded-xl border border-border bg-card p-6">
        {step === 1 && (
          <Step1CardGrading data={formData} onChange={handleChange} />
        )}
        {step === 2 && (
          <Step2PickupMethod data={formData} onChange={handleChange} />
        )}
      </div>

      {/* 네비게이션 버튼 */}
      <div className="mt-6 flex justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={handlePrev}
          disabled={step === 1}
        >
          이전
        </Button>

        {step < TOTAL_STEPS ? (
          <Button type="button" onClick={handleNext}>
            다음
          </Button>
        ) : (
          <Button type="button" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "접수 중..." : "신청서 접수"}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 흡수된 옛 컴포넌트 삭제**

다음 두 파일을 삭제한다:
- `src/components/apply/step2-grading-option.tsx`
- `src/components/apply/step3-card-info.tsx`

PowerShell: `Remove-Item "src/components/apply/step2-grading-option.tsx","src/components/apply/step3-card-info.tsx"`

- [ ] **Step 3: 전체 타입 체크 — GREEN 기대**

Run: `pnpm tsc --noEmit`
Expected: **PASS (0 errors).** Task 2에서 발생한 오류 3건이 모두 해소되어야 한다. 오류가 남아 있으면 멈추고 해당 파일을 조사한다.

---

## Task 8: 완료 페이지 다중 주문 표시

`/apply/complete`가 `orderId`(단수) 대신 `orderIds`(콤마 구분 복수)를 받아 생성된 주문번호를 모두 나열한다.

**Files:**
- Modify: `src/app/(user)/apply/complete/page.tsx`

- [ ] **Step 1: `complete/page.tsx` 전체를 아래 내용으로 교체**

```tsx
"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";

export default function CompletePage() {
  return (
    <Suspense>
      <CompleteContent />
    </Suspense>
  );
}

function CompleteContent() {
  const searchParams = useSearchParams();
  const orderIdsParam = searchParams.get("orderIds") ?? "";
  const orderIds = orderIdsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-success/10 text-4xl">
        ✓
      </div>

      <h1 className="mt-6 text-2xl font-bold">신청서가 접수되었습니다</h1>
      <p className="mt-2 text-muted-foreground">
        관리자가 신청 내용을 확인·보완한 뒤 마이페이지로 알림을 드립니다.
      </p>

      {/* 주문 정보 */}
      <div className="mt-8 rounded-xl border border-border bg-card p-6 text-left">
        <div className="space-y-3 text-sm">
          {orderIds.length > 0 ? (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">생성된 주문</span>
                <span className="font-medium">{orderIds.length}건</span>
              </div>
              <div className="space-y-2 border-t border-border pt-3">
                {orderIds.map((id) => (
                  <div key={id} className="flex justify-between">
                    <span className="text-muted-foreground">주문번호</span>
                    <span className="font-bold text-primary">{id}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex justify-between">
              <span className="text-muted-foreground">주문번호</span>
              <span className="font-bold text-primary">-</span>
            </div>
          )}
          <div className="flex justify-between border-t border-border pt-3">
            <span className="text-muted-foreground">주문 상태</span>
            <span className="font-medium">관리자 확인 대기 중</span>
          </div>
        </div>
      </div>

      {/* 다음 단계 안내 */}
      <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-6 text-left">
        <h2 className="font-semibold text-primary">다음 단계</h2>
        <ol className="mt-3 space-y-2 text-sm text-muted-foreground list-decimal pl-4">
          <li>관리자가 신청 내용을 검토하고 누락된 정보를 보완합니다.</li>
          <li>
            보완이 완료되면 마이페이지에서{" "}
            <span className="font-medium text-foreground">
              동의 및 확인 단계
            </span>
            를 진행해 주세요.
          </li>
          <li>동의·결제가 완료되면 매장 방문 또는 택배 접수로 이어집니다.</li>
        </ol>
      </div>

      <div className="mt-8 flex gap-3">
        <Link
          href="/"
          className={buttonVariants({ variant: "outline", className: "flex-1" })}
        >
          홈으로
        </Link>
        <Link
          href="/mypage"
          className={buttonVariants({ className: "flex-1" })}
        >
          마이페이지에서 확인하기
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 타입 체크**

Run: `pnpm tsc --noEmit`
Expected: PASS (0 errors).

---

## Task 9: 최종 검증

**Files:** (없음 — 검증 전용)

- [ ] **Step 1: 프로덕션 빌드**

Run: `pnpm build`
Expected: 성공 (exit 0). 빌드 라우트맵에 `/apply`, `/apply/complete`가 정상 포함되어야 한다.

- [ ] **Step 2: 잔존 참조 없음 확인**

Run (PowerShell): `Select-String -Path src/**/* -Pattern "step2-grading-option|step3-card-info|step4-pickup-method|createOrderAction\b"`
Expected: 매치 없음. (옛 컴포넌트 파일명·옛 액션명이 코드 어디에도 남아 있지 않아야 한다.)

- [ ] **Step 3: 수동 확인 체크리스트**

`pnpm dev`로 띄운 뒤 `/apply`에서 확인한다:
- [ ] StepIndicator가 2단계("카드 · 그레이딩 옵션", "수령 방식")로 표시된다
- [ ] 1단계: 카드 블록마다 그레이딩사 버튼 4개 + 서비스 등급 드롭다운이 보인다
- [ ] 그레이딩사를 바꾸면 그 카드의 서비스 등급 선택이 초기화된다
- [ ] 그레이딩사/등급 미선택 후 "다음" → `카드 #N: 그레이딩사를 선택해 주세요.` 등 카드별 오류 표시
- [ ] **혼합 신청:** 카드 2장을 서로 다른 그레이딩사로 지정 → 제출 → `/apply/complete`에 주문 2건·각 주문번호 표시 → 마이페이지에 주문 2건 생성 확인
- [ ] **단일 신청 회귀:** 카드 2장을 같은 그레이딩사·등급으로 지정 → 제출 → 주문 1건만 생성
- [ ] "이전" 버튼이 1단계에서 비활성, 2단계에서 활성

---

## Self-Review (작성자 점검 완료)

**1. Spec 커버리지:** 스펙 §1~§7 + 오류 처리 + 테스트 항목을 Task 1~9에 매핑 완료 — 미커버 항목 없음. (스펙 §2의 동의 필드 정리는 "선택"으로 명시됐고, 본 플랜은 `INITIAL_FORM`에 필드를 유지하는 쪽으로 결정 — 미사용이지만 회귀 위험 0.)
**2. Placeholder 스캔:** TBD/TODO/"적절히 처리" 류 없음. 모든 코드 단계에 전체 코드 포함.
**3. 타입 일관성:** `createOrdersAction` / `CreateOrdersInput` / `CardSubmission` / `orderIds` 네이밍이 Task 6·7·8에서 일치. `Step1CardGrading` / `Step2PickupMethod` 컴포넌트명이 Task 3·4·7에서 일치. `SERVICE_LEVELS` 시그니처가 Task 1·3에서 일치.
