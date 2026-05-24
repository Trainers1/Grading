"use client";

import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import { AddressSearchFields } from "@/components/ui/address-search-input";
import { formatFullAddress } from "@/lib/address";
import type { AddressSource, ApplyFormData } from "@/types/apply-form";
import type { PickupMethod, SpoilerPreference } from "@/types";

export interface MyAddressSnapshot {
  postalCode: string;
  address: string;
  detail: string;
}

interface Step2Props {
  data: ApplyFormData;
  onChange: (updates: Partial<ApplyFormData>) => void;
  /** 회원 정보에 저장된 기본 주소 — 비어 있으면 "내 주소" 선택지를 비활성화. */
  myAddress: MyAddressSnapshot;
}

export function Step2PickupMethod({ data, onChange, myAddress }: Step2Props) {
  const hasMyAddress = myAddress.address.trim().length > 0;
  const myAddressDisplay = formatFullAddress({
    postalCode: myAddress.postalCode,
    address: myAddress.address,
    detail: myAddress.detail,
  });
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
        <div className="space-y-3 rounded-lg bg-muted p-4">
          <div>
            <Label>
              배송 주소 <span className="text-error">*</span>
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              택배비는 오버차지와 함께 후결제됩니다.
            </p>
          </div>

          <RadioGroup
            name="addressSource"
            value={hasMyAddress ? data.addressSource : "MANUAL"}
            onChange={(value) =>
              onChange({ addressSource: value as AddressSource })
            }
            options={[
              {
                value: "MY",
                label: "내 주소",
                description: hasMyAddress
                  ? myAddressDisplay
                  : "내정보에 저장된 주소가 없어 사용할 수 없습니다.",
                disabled: !hasMyAddress,
              },
              {
                value: "MANUAL",
                label: "직접 입력",
                description: "이번 신청에만 사용할 주소를 입력합니다.",
              },
            ]}
          />

          {(!hasMyAddress || data.addressSource === "MANUAL") && (
            <div className="space-y-2">
              <Label>배송 주소 입력</Label>
              <AddressSearchFields
                idPrefix="apply-delivery"
                value={{
                  postalCode: data.postalCode,
                  address: data.deliveryAddress,
                  detail: data.deliveryAddressDetail,
                }}
                onChange={(next) =>
                  onChange({
                    postalCode: next.postalCode,
                    deliveryAddress: next.address,
                    deliveryAddressDetail: next.detail,
                  })
                }
              />
            </div>
          )}
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
