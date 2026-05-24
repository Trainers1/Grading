/**
 * 주소 3분할(우편번호 / 기본 주소 / 상세 주소) 모델 공통 헬퍼.
 *
 * UI·DB·신청 폼이 동일하게 3개 필드를 다루지만, 표시(display)할 때는
 * 단일 문자열로 합쳐 보여주는 편이 자연스럽다. 다음 형식을 표준으로 사용:
 *
 *   "[우편번호] 기본주소 상세주소"
 *
 * 입력 누락 시 해당 부분은 생략하고, 모두 비어 있으면 fallback 을 반환한다.
 */
export interface AddressParts {
  postalCode?: string | null;
  address?: string | null;
  detail?: string | null;
}

export function formatFullAddress(
  parts: AddressParts,
  fallback = ""
): string {
  const postal = parts.postalCode?.trim();
  const base = parts.address?.trim();
  const detail = parts.detail?.trim();

  const segments: string[] = [];
  if (postal) segments.push(`[${postal}]`);
  if (base) segments.push(base);
  if (detail) segments.push(detail);

  return segments.length > 0 ? segments.join(" ") : fallback;
}

/**
 * 주문 → 실제 발송에 사용할 3분할 주소를 해석한다.
 *
 *   - addressSource = 'MY'      : profileAddress(최신 회원 정보 주소)를 우선 사용.
 *                                 profileAddress 의 기본 주소가 비어 있으면 snapshot 으로 fallback
 *                                 (회원이 주소를 지워 버린 비정상 케이스 방어).
 *   - addressSource = 'MANUAL'  : 신청 시 입력한 snapshot 을 그대로 사용.
 *
 * 입력은 camelCase 도메인 타입과 호환되도록 partial 구조로 받는다.
 */
export interface OrderAddressSnapshot {
  addressSource?: "MY" | "MANUAL" | null;
  postalCode?: string | null;
  deliveryAddress?: string | null;
  deliveryAddressDetail?: string | null;
}

export interface ProfileAddress {
  postalCode?: string | null;
  address?: string | null;
  detail?: string | null;
}

export function resolveOrderShippingAddress(
  order: OrderAddressSnapshot,
  profileAddress?: ProfileAddress | null
): AddressParts {
  const snapshot: AddressParts = {
    postalCode: order.postalCode ?? "",
    address: order.deliveryAddress ?? "",
    detail: order.deliveryAddressDetail ?? "",
  };

  if (order.addressSource !== "MY" || !profileAddress) {
    return snapshot;
  }

  const profileBase = profileAddress.address?.trim() ?? "";
  if (!profileBase) {
    // 회원이 프로필 주소를 비웠다면 snapshot 으로 fallback — 미발송 박스 방지.
    return snapshot;
  }

  return {
    postalCode: profileAddress.postalCode ?? "",
    address: profileAddress.address ?? "",
    detail: profileAddress.detail ?? "",
  };
}
