"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Daum Postcode (Kakao 우편번호 서비스) — 도로명/지번 주소 검색 표준 라이브러리.
// 클라이언트 키가 필요 없으며, 모달 팝업으로 검색 → 선택 → 콜백 형태로 동작.
const POSTCODE_SCRIPT_SRC =
  "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

interface PostcodeCompleteData {
  /** 우편번호 (5자리) */
  zonecode: string;
  /** 지번 주소 */
  address: string;
  /** 도로명 주소 (있으면 우선 사용) */
  roadAddress: string;
  /** 지번 주소 (alias) */
  jibunAddress: string;
  /** 사용자 자동 채움된 추가 정보 (예: 건물명) */
  buildingName?: string;
}

interface PostcodeConstructorOptions {
  oncomplete: (data: PostcodeCompleteData) => void;
  onclose?: () => void;
  width?: string | number;
  height?: string | number;
}

interface PostcodeInstance {
  open: () => void;
  embed: (el: HTMLElement) => void;
}

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: PostcodeConstructorOptions) => PostcodeInstance;
    };
  }
}

let scriptLoader: Promise<void> | null = null;

function loadPostcodeScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.daum?.Postcode) return Promise.resolve();
  if (scriptLoader) return scriptLoader;
  scriptLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${POSTCODE_SCRIPT_SRC}"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("load")));
      return;
    }
    const script = document.createElement("script");
    script.src = POSTCODE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoader = null;
      reject(new Error("Daum Postcode SDK 로드 실패"));
    };
    document.head.appendChild(script);
  });
  return scriptLoader;
}

export interface AddressValue {
  postalCode: string;
  address: string;
  detail: string;
}

interface AddressSearchFieldsProps {
  /** label/input id prefix — 같은 화면에 여러 개 둘 때 충돌 방지용 */
  idPrefix?: string;
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  disabled?: boolean;
}

/**
 * 우편번호·기본주소·상세주소 3분할 주소 입력 컴포넌트.
 *
 * - 우편번호 / 기본 주소: readonly. "주소 검색" 버튼을 통해서만 채워진다.
 * - 상세 주소: 자유 입력 (동/호수 등).
 *
 * Daum Postcode 팝업에서 사용자가 항목을 선택하면 도로명 주소(없으면 지번 주소)와
 * 우편번호가 자동 입력되고, 사용자는 상세 주소만 추가 입력하면 된다.
 */
export function AddressSearchFields({
  idPrefix = "address",
  value,
  onChange,
  disabled,
}: AddressSearchFieldsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openSearch = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await loadPostcodeScript();
      if (!window.daum?.Postcode) {
        setError("주소 검색 서비스를 불러오지 못했습니다.");
        return;
      }
      new window.daum.Postcode({
        oncomplete: (data) => {
          const baseAddress =
            data.roadAddress || data.address || data.jibunAddress;
          onChange({
            postalCode: data.zonecode ?? "",
            address: baseAddress,
            // 새 주소 검색 시 상세 주소는 비워서 사용자에게 다시 입력하게 한다.
            detail: "",
          });
        },
      }).open();
    } catch (err) {
      console.error("[address-search] open failed", err);
      setError("주소 검색을 열 수 없습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [onChange]);

  const postalId = `${idPrefix}-postal`;
  const baseId = `${idPrefix}-base`;
  const detailId = `${idPrefix}-detail`;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          id={postalId}
          value={value.postalCode}
          readOnly
          placeholder="우편번호"
          aria-label="우편번호"
          className="w-32 cursor-not-allowed bg-muted/40"
        />
        <Button
          type="button"
          variant="outline"
          onClick={openSearch}
          disabled={disabled || loading}
          className="shrink-0"
        >
          {loading ? "로딩..." : "주소 검색"}
        </Button>
      </div>
      <Input
        id={baseId}
        value={value.address}
        readOnly
        placeholder="기본 주소 (주소 검색 버튼으로 입력)"
        aria-label="기본 주소"
        className="cursor-not-allowed bg-muted/40"
      />
      <div>
        <Label htmlFor={detailId} className="sr-only">
          상세 주소
        </Label>
        <Input
          id={detailId}
          value={value.detail}
          onChange={(e) =>
            onChange({ ...value, detail: e.target.value })
          }
          placeholder="상세 주소 (동·호수 등)"
          disabled={disabled}
        />
      </div>
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}
