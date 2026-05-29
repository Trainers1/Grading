"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { OrderStatusTracker } from "@/components/user/order-status-tracker";
import { RadioGroup } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { AddressSearchFields } from "@/components/ui/address-search-input";
import { formatFullAddress, resolveOrderShippingAddress } from "@/lib/address";
import {
  ORDER_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  SHIPPING_FEE,
  getCertLookupUrl,
} from "@/constants/grading";
import { cn } from "@/lib/utils";
import {
  updateOrderPickupMethodAction,
  confirmOrderReceiptAction,
  cancelMyOrderAction,
  updateOrderSpoilerPreferenceAction,
} from "@/lib/orders/actions";
import type {
  Card,
  Order,
  OrderStatus,
  PickupMethod,
  SpoilerPreference,
} from "@/types";
import type { AddressSource } from "@/types/apply-form";

const NON_CANCELLABLE: OrderStatus[] = [
  "SHIPPED_OUT",
  "DISTRIBUTOR_SHIPPED",
  "GRADE_CONFIRMED",
  "TRAINERS_ARRIVED",
  "COMPLETED",
];

interface MyAddressSnapshot {
  postalCode: string;
  address: string;
  detail: string;
}

export function OrderDetailClient({
  order,
  cards,
  myAddress,
}: {
  order: Order;
  cards: Card[];
  /** 회원 정보에 저장된 기본 주소 — 수령 방법 변경 시 "내 주소" 옵션의 소스. */
  myAddress: MyAddressSnapshot;
}) {
  const hasMyAddress = myAddress.address.trim().length > 0;
  const myAddressDisplay = formatFullAddress({
    postalCode: myAddress.postalCode,
    address: myAddress.address,
    detail: myAddress.detail,
  });

  const [spoilerPreference, setSpoilerPreference] = useState<SpoilerPreference>(
    order.spoilerPreference
  );
  const [pickupMethod, setPickupMethod] = useState<PickupMethod>(
    order.pickupMethod
  );
  // snapshot 컬럼 — addressSource='MY' 인 경우 화면에는 보이지 않지만 fallback 으로 유지.
  const [postalCode, setPostalCode] = useState<string>(order.postalCode ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState<string>(
    order.deliveryAddress ?? ""
  );
  const [deliveryAddressDetail, setDeliveryAddressDetail] = useState<string>(
    order.deliveryAddressDetail ?? ""
  );
  // 현재 저장된 주소 출처 — 'MY' 면 화면 표시 시 항상 회원 정보 주소를 따라간다.
  const [addressSource, setAddressSource] = useState<AddressSource>(
    order.addressSource
  );
  const [isEditingPickup, setIsEditingPickup] = useState(false);
  const [draftPickupMethod, setDraftPickupMethod] = useState<PickupMethod>(
    order.pickupMethod
  );

  // 편집 진입 시 출처 초기값: 기존 저장값 우선. 회원 주소가 비어 있으면 강제 MANUAL.
  const initialDraftSource = (current: AddressSource): AddressSource =>
    current === "MY" && hasMyAddress ? "MY" : "MANUAL";

  const [draftAddressSource, setDraftAddressSource] = useState<AddressSource>(
    () => initialDraftSource(order.addressSource)
  );
  const [draftPostalCode, setDraftPostalCode] = useState<string>(
    order.postalCode ?? ""
  );
  const [draftDeliveryAddress, setDraftDeliveryAddress] = useState<string>(
    order.deliveryAddress ?? ""
  );
  const [draftDeliveryAddressDetail, setDraftDeliveryAddressDetail] =
    useState<string>(order.deliveryAddressDetail ?? "");
  const [pickupError, setPickupError] = useState<string | null>(null);
  const [isSavingPickup, startPickupTransition] = useTransition();
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [isConfirmingReceipt, startReceiptTransition] = useTransition();
  const [spoilerError, setSpoilerError] = useState<string | null>(null);
  const [isSavingSpoiler, startSpoilerTransition] = useTransition();
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCancelling, startCancelTransition] = useTransition();
  const router = useRouter();

  const canCancel = !NON_CANCELLABLE.includes(order.orderStatus);
  const showGrade =
    spoilerPreference === "ALLOW" || order.orderStatus === "COMPLETED";

  const isDelivery = pickupMethod === "DELIVERY";
  const canEditPickup =
    order.orderStatus !== "COMPLETED" &&
    order.shipmentGroupId == null &&
    order.userTrackingNumber == null;

  // 택배 선택 + "내 주소" 출처이면 회원 정보 주소, 아니면 직접 입력값.
  const useMyAddressNow =
    draftPickupMethod === "DELIVERY" &&
    hasMyAddress &&
    draftAddressSource === "MY";

  const resolvedDraftPostalCode = useMyAddressNow
    ? myAddress.postalCode.trim()
    : draftPostalCode.trim();
  const resolvedDraftAddress = useMyAddressNow
    ? myAddress.address.trim()
    : draftDeliveryAddress.trim();
  const resolvedDraftAddressDetail = useMyAddressNow
    ? myAddress.detail.trim()
    : draftDeliveryAddressDetail.trim();

  // 저장 시 출처도 함께 기록 — 'MY' 면 서버는 snapshot 을 fallback 으로만 사용한다.
  const savePickup = () => {
    setPickupError(null);
    const nextSource: AddressSource =
      draftPickupMethod === "DELIVERY" && useMyAddressNow ? "MY" : "MANUAL";
    startPickupTransition(async () => {
      const result = await updateOrderPickupMethodAction({
        orderId: order.id,
        pickupMethod: draftPickupMethod,
        addressSource: nextSource,
        postalCode: resolvedDraftPostalCode,
        deliveryAddress: resolvedDraftAddress,
        deliveryAddressDetail: resolvedDraftAddressDetail,
      });
      if (!result.ok) {
        setPickupError(result.error);
        return;
      }
      setPickupMethod(draftPickupMethod);
      setAddressSource(nextSource);
      setPostalCode(resolvedDraftPostalCode);
      setDeliveryAddress(resolvedDraftAddress);
      setDeliveryAddressDetail(resolvedDraftAddressDetail);
      setIsEditingPickup(false);
      router.refresh();
    });
  };
  const cancelPickupEdit = () => {
    setDraftPickupMethod(pickupMethod);
    setDraftPostalCode(postalCode);
    setDraftDeliveryAddress(deliveryAddress);
    setDraftDeliveryAddressDetail(deliveryAddressDetail);
    setDraftAddressSource(initialDraftSource(addressSource));
    setIsEditingPickup(false);
  };
  const isAtArrival = order.orderStatus === "TRAINERS_ARRIVED";
  const shippingFeePaid = order.shipmentGroupId != null;
  const needsShippingPayment = isDelivery && isAtArrival && !shippingFeePaid;

  const confirmReceipt = () => {
    const ok = window.confirm(
      "수령을 완료하셨나요? 확인 시 주문이 수령 완료 처리됩니다."
    );
    if (!ok) return;
    setReceiptError(null);
    startReceiptTransition(async () => {
      const result = await confirmOrderReceiptAction({ orderId: order.id });
      if (!result.ok) {
        setReceiptError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link
        href="/mypage/orders"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← 목록으로
      </Link>

      <h1 className="mt-4 text-2xl font-bold">주문 상세</h1>

      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <div className="grid gap-2 sm:grid-cols-2 sm:gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">주문번호</span>
            <p className="font-bold text-primary">{order.id}</p>
          </div>
          <div>
            <span className="text-muted-foreground">현재 상태</span>
            <p className="font-semibold">
              {ORDER_STATUS_LABELS[order.orderStatus]}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">등급사 / 서비스</span>
            <p className="font-medium">
              {order.gradingCompany} / {order.serviceLevel}
            </p>
          </div>
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">수령 방법</span>
              {canEditPickup && !isEditingPickup && (
                <button
                  type="button"
                  onClick={() => {
                    setDraftPickupMethod(pickupMethod);
                    setDraftPostalCode(postalCode);
                    setDraftDeliveryAddress(deliveryAddress);
                    setDraftDeliveryAddressDetail(deliveryAddressDetail);
                    setDraftAddressSource(initialDraftSource(addressSource));
                    setIsEditingPickup(true);
                  }}
                  className="text-xs font-medium text-primary hover:underline cursor-pointer"
                >
                  수령 방법 변경
                </button>
              )}
            </div>
            <p className="font-medium">
              {pickupMethod === "STORE_PICKUP" ? "매장 방문 수령" : "택배 수령"}
            </p>
            {pickupMethod === "DELIVERY" && (() => {
              // addressSource='MY' 면 항상 회원 정보의 최신 주소를 따라간다.
              const shown = resolveOrderShippingAddress(
                {
                  addressSource,
                  postalCode,
                  deliveryAddress,
                  deliveryAddressDetail,
                },
                hasMyAddress
                  ? {
                      postalCode: myAddress.postalCode,
                      address: myAddress.address,
                      detail: myAddress.detail,
                    }
                  : null
              );
              const display = formatFullAddress(shown);
              if (!display) return null;
              return (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {display}
                  {addressSource === "MY" && (
                    <span className="ml-1 text-[10px] text-primary">
                      (내 주소)
                    </span>
                  )}
                </p>
              );
            })()}
          </div>
          <div>
            <span className="text-muted-foreground">신청일</span>
            <p className="font-medium">
              {new Date(order.createdAt).toLocaleDateString("ko-KR")}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">결제 금액</span>
            <p className="font-medium">
              {order.prepaidAmount.toLocaleString()}원
            </p>
          </div>
        </div>

        {isEditingPickup && (
          <div className="mt-6 space-y-4 border-t border-border pt-6">
            <div>
              <h3 className="font-semibold">수령 방법 변경</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                택배비 결제 전까지 변경할 수 있습니다. 택배 수령 선택 시
                택배비({SHIPPING_FEE.toLocaleString()}원)가 별도 청구됩니다.
              </p>
            </div>
            <RadioGroup
              name={`pickup-edit-${order.id}`}
              value={draftPickupMethod}
              onChange={(v) => setDraftPickupMethod(v as PickupMethod)}
              options={[
                {
                  value: "STORE_PICKUP",
                  label: "매장 방문 수령",
                  description: "트레이너스 매장에서 직접 수령합니다.",
                },
                {
                  value: "DELIVERY",
                  label: "택배 수령",
                  description: `택배비 ${SHIPPING_FEE.toLocaleString()}원 별도 결제`,
                },
              ]}
            />
            {draftPickupMethod === "DELIVERY" && (
              <div className="space-y-3">
                <Label>
                  배송 주소 <span className="text-error">*</span>
                </Label>
                <RadioGroup
                  name={`address-source-${order.id}`}
                  value={hasMyAddress ? draftAddressSource : "MANUAL"}
                  onChange={(v) =>
                    setDraftAddressSource(v as AddressSource)
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
                      description: "이번 주문에만 사용할 주소를 입력합니다.",
                    },
                  ]}
                />
                {(!hasMyAddress || draftAddressSource === "MANUAL") && (
                  <div className="space-y-2">
                    <Label>배송 주소 입력</Label>
                    <AddressSearchFields
                      idPrefix={`draft-delivery-${order.id}`}
                      value={{
                        postalCode: draftPostalCode,
                        address: draftDeliveryAddress,
                        detail: draftDeliveryAddressDetail,
                      }}
                      onChange={(next) => {
                        setDraftPostalCode(next.postalCode);
                        setDraftDeliveryAddress(next.address);
                        setDraftDeliveryAddressDetail(next.detail);
                      }}
                    />
                  </div>
                )}
              </div>
            )}
            {pickupError && (
              <p className="text-xs text-error">{pickupError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={cancelPickupEdit}
                disabled={isSavingPickup}
              >
                취소
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={savePickup}
                disabled={
                  isSavingPickup ||
                  (draftPickupMethod === "DELIVERY" && !resolvedDraftAddress)
                }
              >
                {isSavingPickup ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold">진행 상태</h2>
        <OrderStatusTracker currentStatus={order.orderStatus} />
      </div>

      {order.orderStatus === "PAYMENT_PENDING" && (
        <div className="mt-6 rounded-xl border border-warning/30 bg-warning/5 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">결제 대기</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                결제 금액:{" "}
                <span className="font-medium text-foreground">
                  {order.prepaidAmount.toLocaleString()}원
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                결제를 완료해야 접수가 진행됩니다.
              </p>
            </div>
            <Link
              href={`/pay?type=prepay&orderIds=${order.id}`}
              className={buttonVariants({ size: "sm" })}
            >
              결제하기
            </Link>
          </div>
        </div>
      )}

      {needsShippingPayment && (
        <div className="mt-6 rounded-xl border border-error/30 bg-error/5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h2 className="font-semibold">택배비 결제</h2>
              <p className="flex justify-between gap-6 text-sm text-muted-foreground">
                <span>택배비</span>
                <span className="font-medium text-foreground">
                  {SHIPPING_FEE.toLocaleString()}원
                </span>
              </p>
            </div>
            <Link
              href={`/mypage/orders/${order.id}/shipping`}
              className={buttonVariants({ size: "sm" })}
            >
              결제하기
            </Link>
          </div>
          <p className="mt-3 text-xs text-error">
            택배비 결제 완료 후 택배 발송이 진행됩니다.
          </p>
        </div>
      )}

      {isDelivery && isAtArrival && shippingFeePaid && (
        <div className="mt-6 rounded-xl border border-success/30 bg-success/5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-success">택배비 결제 완료</h2>
              {order.userTrackingNumber ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  송장번호:{" "}
                  <span className="font-mono font-medium text-foreground">
                    {order.userTrackingNumber}
                  </span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">
                  택배 발송을 준비하고 있습니다. 발송이 시작되면 송장번호가
                  등록됩니다.
                </p>
              )}
            </div>
            {order.userTrackingNumber && (
              <Button
                type="button"
                size="sm"
                onClick={confirmReceipt}
                disabled={isConfirmingReceipt}
              >
                {isConfirmingReceipt ? "처리 중..." : "수령 완료"}
              </Button>
            )}
          </div>
          {order.userTrackingNumber && (
            <p className="mt-2 text-xs text-muted-foreground">
              택배를 받으셨다면 "수령 완료"를 눌러 주세요. 누르지 않아도 송장
              등록 5일 후 자동으로 수령 완료 처리됩니다.
            </p>
          )}
          {receiptError && (
            <p className="mt-2 text-xs text-error">{receiptError}</p>
          )}
        </div>
      )}

      {order.overchargeAmount && order.overchargeAmount > 0 && (
          <div
            className={cn(
              "mt-6 rounded-xl border p-6",
              order.paymentStatus === "OVERCHARGE_PENDING"
                ? "border-error/30 bg-error/5"
                : "border-border bg-card"
            )}
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">오버차지</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  추가 결제 금액: {order.overchargeAmount.toLocaleString()}원
                </p>
                <p className="mt-1 text-xs">
                  결제 상태:{" "}
                  <span className="font-medium">
                    {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                  </span>
                </p>
              </div>
              {order.paymentStatus === "OVERCHARGE_PENDING" && (
                <Link
                  href={`/mypage/orders/${order.id}/overcharge`}
                  className={buttonVariants({ size: "sm" })}
                >
                  결제하기
                </Link>
              )}
            </div>
            {order.paymentStatus === "OVERCHARGE_PENDING" && (
              <p className="mt-3 text-xs text-error">
                오버차지 미결제 시 카드 수령이 불가합니다.
              </p>
            )}
          </div>
        )}

      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold">카드 정보 ({cards.length}장)</h2>
        <div className="space-y-4">
          {cards.map((card, cardIndex) => {
            const photos: { label: string; url: string }[] = [];
            if (card.frontImageUrl) {
              photos.push({ label: "앞면", url: card.frontImageUrl });
            }
            if (card.backImageUrl) {
              photos.push({ label: "뒷면", url: card.backImageUrl });
            }
            if (card.slabPhotoUrl && showGrade) {
              photos.push({ label: "슬랩", url: card.slabPhotoUrl });
            }

            // 일련번호가 입력되면 그레이딩사 인증 페이지에서 등급을 직접 조회할 수 있다.
            // 사용자가 "실물 수령 후 확인" (DENY) 을 선택했으면 버튼은 비활성화.
            const hasSerial = !!card.serialNumber;
            const certUrl = hasSerial
              ? getCertLookupUrl(order.gradingCompany, card.serialNumber!)
              : null;

            return (
              <div
                key={card.id}
                className="rounded-lg border border-border p-4"
              >
                <div className="flex flex-col gap-4 sm:flex-row">
                  {photos.length > 0 ? (
                    <div className="flex flex-wrap gap-2 sm:shrink-0 sm:flex-nowrap">
                      {photos.map((p) => (
                        <div
                          key={p.label}
                          className="flex w-20 flex-col items-center sm:w-24"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.url}
                            alt={`카드 #${cardIndex + 1} ${p.label}`}
                            className="h-28 w-20 rounded-md border border-border object-cover sm:h-32 sm:w-24"
                          />
                          <span className="mt-1 text-[11px] text-muted-foreground">
                            {p.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-28 w-20 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-[10px] text-muted-foreground sm:h-32 sm:w-24">
                      사진 없음
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">카드 #{cardIndex + 1}</p>
                        {card.englishName && (
                          <p className="text-xs text-muted-foreground">
                            {card.englishName}
                          </p>
                        )}
                      </div>
                      {hasSerial && certUrl ? (
                        showGrade ? (
                          <a
                            href={certUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                          >
                            등급 확인하기 ↗
                          </a>
                        ) : (
                          <span
                            aria-disabled="true"
                            title="실물 수령 후 확인을 선택해 잠겨 있습니다."
                            className="shrink-0 cursor-not-allowed rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                          >
                            수령 시 확인
                          </span>
                        )
                      ) : null}
                    </div>

                    <dl className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                      {card.setName && (
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground">세트</dt>
                          <dd>{card.setName}</dd>
                        </div>
                      )}
                      {card.cardNumber && (
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground">카드번호</dt>
                          <dd>{card.cardNumber}</dd>
                        </div>
                      )}
                      {card.year && (
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground">연도</dt>
                          <dd>{card.year}</dd>
                        </div>
                      )}
                      {card.declaredValue ? (
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground">신고가액</dt>
                          <dd>{card.declaredValue.toLocaleString()}원</dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <div className="mb-3">
          <h2 className="font-semibold">등급 결과 미리 보기</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            등급이 확정된 후 카드를 수령하기 전, 마이페이지에서 결과를 볼지
            선택합니다. 언제든 변경할 수 있어요.
          </p>
        </div>
        <RadioGroup
          name={`spoiler-${order.id}`}
          value={spoilerPreference}
          onChange={(v) => {
            const next = v as SpoilerPreference;
            if (next === spoilerPreference) return;
            if (next === "ALLOW" && spoilerPreference === "DENY") {
              const ok = window.confirm(
                "등급 결과가 바로 표시됩니다. 정말로 설정을 변경하시겠습니까?"
              );
              if (!ok) return;
            }
            const previous = spoilerPreference;
            setSpoilerPreference(next);
            setSpoilerError(null);
            startSpoilerTransition(async () => {
              const result = await updateOrderSpoilerPreferenceAction({
                orderId: order.id,
                spoilerPreference: next,
              });
              if (!result.ok) {
                setSpoilerPreference(previous);
                setSpoilerError(result.error);
                return;
              }
              router.refresh();
            });
          }}
          options={[
            {
              value: "ALLOW",
              label: "바로 확인할게요",
              description: "등급이 확정되는 즉시 결과를 볼 수 있습니다.",
            },
            {
              value: "DENY",
              label: "실물 수령 후에 볼게요",
              description: "카드를 수령하기 전까지 등급을 감춰 둡니다.",
            },
          ]}
        />
        {isSavingSpoiler && (
          <p className="mt-2 text-xs text-muted-foreground">저장 중...</p>
        )}
        {spoilerError && (
          <p className="mt-2 text-xs text-error">{spoilerError}</p>
        )}
      </div>

      {order.customerMemo && (
        <div className="mt-6 rounded-xl border border-border bg-card p-6">
          <h2 className="mb-2 font-semibold">고객 메모</h2>
          <p className="text-sm text-muted-foreground">{order.customerMemo}</p>
        </div>
      )}

      <div className="mt-6">
        {canCancel ? (
          <div className="space-y-2">
            <Button
              variant="outline"
              className="text-error hover:text-error"
              disabled={isCancelling}
              onClick={() => {
                const ok = window.confirm(
                  "주문을 취소하시겠습니까?\n선결제가 있다면 운영자가 확인 후 환불 처리합니다."
                );
                if (!ok) return;
                setCancelError(null);
                startCancelTransition(async () => {
                  const result = await cancelMyOrderAction({ orderId: order.id });
                  if (!result.ok) {
                    setCancelError(result.error);
                    return;
                  }
                  router.refresh();
                });
              }}
            >
              {isCancelling ? "취소 처리 중..." : "주문 취소"}
            </Button>
            {cancelError && (
              <p className="text-xs text-error">{cancelError}</p>
            )}
          </div>
        ) : (
          order.orderStatus !== "COMPLETED" && (
            <p className="text-xs text-muted-foreground">
              총판 발송 이후에는 취소 및 환불이 불가합니다.
            </p>
          )
        )}
      </div>
    </div>
  );
}
