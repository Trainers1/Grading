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
  uploadApplyCardImageAction,
  type PaymentMethodChoice,
} from "@/lib/orders/actions";
import type { GradingCompany, GradingService } from "@/types";

// 흐름: 1) 그레이딩 옵션+매수 → 2) 수령방식 → 3) 결제수단 선택 후 신청+결제 1회로 완료.
const TOTAL_STEPS = 3;

export interface MyAddressSnapshot {
  postalCode: string;
  address: string;
  detail: string;
}

export function ApplyForm({
  services,
  myAddress,
}: {
  services: GradingService[];
  myAddress: MyAddressSnapshot;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const hasMyAddress = myAddress.address.trim().length > 0;
  const [formData, setFormData] = useState<ApplyFormData>(() => ({
    ...INITIAL_FORM,
    // 회원 정보에 저장된 주소가 없으면 처음부터 직접 입력 모드.
    addressSource: hasMyAddress ? "MY" : "MANUAL",
  }));
  const [errors, setErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  // 택배 수령 시 실제로 제출할 주소 — 출처에 따라 결정.
  const resolvedPostalCode =
    formData.addressSource === "MY"
      ? myAddress.postalCode.trim()
      : formData.postalCode.trim();
  const resolvedDeliveryAddress =
    formData.addressSource === "MY"
      ? myAddress.address.trim()
      : formData.deliveryAddress.trim();
  const resolvedDeliveryAddressDetail =
    formData.addressSource === "MY"
      ? myAddress.detail.trim()
      : formData.deliveryAddressDetail.trim();

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
      case 1: // 그레이딩 옵션 + 매수 + 앞면 이미지
        formData.groups.forEach((g, i) => {
          if (!g.gradingCompany)
            errs.push(`주문 #${i + 1}: 그레이딩사를 선택해 주세요.`);
          if (!g.serviceLevel)
            errs.push(`주문 #${i + 1}: 서비스 등급을 선택해 주세요.`);
          if (!Number.isInteger(g.quantity) || g.quantity < 1)
            errs.push(`주문 #${i + 1}: 카드 매수는 1 이상이어야 합니다.`);
          // 카드 매수만큼 앞면 이미지 모두 업로드 필수.
          if (
            g.frontImages.length !== g.quantity ||
            g.frontImages.some((f) => !(f instanceof File))
          ) {
            errs.push(
              `주문 #${i + 1}: 매수만큼 카드 앞면 이미지를 모두 업로드해 주세요.`
            );
          }
        });
        break;
      case 2: // 수령 방식
        if (
          formData.pickupMethod === "DELIVERY" &&
          !resolvedDeliveryAddress
        ) {
          if (formData.addressSource === "MY") {
            errs.push(
              "저장된 기본 주소가 없습니다. 직접 입력을 선택하거나 내정보에서 주소를 등록해 주세요."
            );
          } else {
            errs.push("배송 주소를 입력해 주세요.");
          }
        }
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
      // 1) 모든 카드 앞면 이미지를 Supabase Storage 에 선업로드.
      //    그룹 내·그룹 간 모두 병렬 — 50장 가까이 올라가는 경우에도 체감 시간 단축.
      let uploadedUrls: string[][];
      try {
        uploadedUrls = await Promise.all(
          formData.groups.map(async (g) =>
            Promise.all(
              g.frontImages.map(async (file) => {
                if (!(file instanceof File)) {
                  throw new Error("업로드되지 않은 이미지 슬롯이 있습니다.");
                }
                const fd = new FormData();
                fd.append("file", file);
                const res = await uploadApplyCardImageAction(fd);
                if (!res.ok) throw new Error(res.error);
                return res.url;
              })
            )
          )
        );
      } catch (err) {
        setErrors([
          err instanceof Error
            ? err.message
            : "이미지 업로드 중 오류가 발생했습니다.",
        ]);
        return;
      }

      // 2) 업로드된 URL 을 그룹별로 묶어 주문 생성.
      const result = await createOrdersAction({
        pickupMethod: formData.pickupMethod,
        postalCode: resolvedPostalCode,
        deliveryAddress: resolvedDeliveryAddress,
        deliveryAddressDetail: resolvedDeliveryAddressDetail,
        spoilerPreference: formData.spoilerPreference,
        customerMemo: formData.customerMemo,
        paymentMethod: formData.paymentMethod,
        groups: formData.groups.map((g, i) => ({
          gradingCompany: g.gradingCompany as GradingCompany,
          serviceLevel: g.serviceLevel,
          quantity: g.quantity,
          frontImageUrls: uploadedUrls[i],
        })),
      });

      if (!result.ok) {
        setErrors([result.error]);
        return;
      }

      // ONSITE 는 매장에서 결제 → 바로 마이페이지로.
      // 온라인은 통합 결제 라우트 /pay 로 이동. 사용자가 고른 결제수단을 힌트로 전달.
      if (result.mode === "ONSITE") {
        router.push(`/mypage/orders?paid=${result.orderIds.join(",")}`);
      } else {
        router.push(
          `/pay?type=prepay&orderIds=${result.orderIds.join(",")}&method=${formData.paymentMethod}`
        );
      }
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
          <Step2PickupMethod
            data={formData}
            onChange={handleChange}
            myAddress={myAddress}
          />
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

      <div className="mt-6 flex justify-between gap-2">
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
              value: "TOSSPAY",
              label: "토스페이",
              description: "토스 앱으로 간편하게 결제합니다.",
            },
            {
              value: "EXTERNAL_PAY",
              label: "외부 간편결제",
              description:
                "카드/계좌이체/카카오페이/네이버페이 등 토스페이먼츠 결제창에서 결제수단을 선택합니다.",
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
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
