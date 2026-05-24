import type { GradingCompany, PickupMethod, SpoilerPreference } from "./order";
import type { PaymentMethodChoice } from "@/lib/orders/actions";

/** 그레이딩 신청 단위 (그레이딩사 + 서비스 등급별로 묶임).
 *
 * 카드별 세부 정보는 신청 시점에는 받지 않고, 매장 직원이 카드 수령 후
 * 어드민 페이지에서 직접 입력한다. 따라서 신청 폼은 (회사, 서비스, 매수)만
 * 받는다. 같은 회사·서비스 조합은 단일 주문으로 묶이고, 다른 조합은 주문이
 * 분리된다.
 */
export interface OrderGroupFormData {
  /** React key 및 안정적 참조용 */
  id: string;
  /** 그레이딩사 */
  gradingCompany: GradingCompany | "";
  /** 서비스 등급 코드 (예: psa_regular) */
  serviceLevel: string;
  /** 카드 매수 (1 이상) */
  quantity: number;
}

/** 택배 수령 시 배송 주소 출처 */
export type AddressSource = "MY" | "MANUAL";

/** 신청서 전체 폼 데이터 (신청자 정보는 회원 정보에서 자동 연동) */
export interface ApplyFormData {
  /** 주문 그룹 (그레이딩사/서비스 단위) */
  groups: OrderGroupFormData[];

  /** 수령 방법 */
  pickupMethod: PickupMethod;
  /** 배송 주소 출처 — MY: 회원 정보의 기본 주소, MANUAL: 직접 입력 */
  addressSource: AddressSource;
  /** addressSource=MANUAL 일 때 사용자가 검색한 우편번호 */
  postalCode: string;
  /** addressSource=MANUAL 일 때 사용자가 검색한 기본 주소 */
  deliveryAddress: string;
  /** addressSource=MANUAL 일 때 사용자가 직접 입력한 상세 주소 */
  deliveryAddressDetail: string;

  /** 동의/표시 설정 */
  agreePrivacy: boolean;
  agreeTerms: boolean;
  agreeNotice: boolean;
  spoilerPreference: SpoilerPreference;
  customerMemo: string;

  /** 결제 수단 */
  paymentMethod: PaymentMethodChoice;
}

/** 새 그룹 블록의 초기 상태를 반환한다. 호출마다 고유한 id 를 생성한다. */
export function createInitialGroup(): OrderGroupFormData {
  return {
    id: crypto.randomUUID(),
    gradingCompany: "",
    serviceLevel: "",
    quantity: 1,
  };
}

export const INITIAL_FORM: ApplyFormData = {
  groups: [createInitialGroup()],
  pickupMethod: "STORE_PICKUP",
  addressSource: "MY",
  postalCode: "",
  deliveryAddress: "",
  deliveryAddressDetail: "",
  agreePrivacy: false,
  agreeTerms: false,
  agreeNotice: false,
  spoilerPreference: "ALLOW",
  customerMemo: "",
  paymentMethod: "ONSITE",
};
