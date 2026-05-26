"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressSearchFields } from "@/components/ui/address-search-input";
import { PushToggle } from "@/components/mypage/push-toggle";
import {
  changeMyPasswordAction,
  updateMyProfileAction,
} from "@/lib/auth/actions";

export type MyProfile = {
  email: string;
  name: string;
  phone: string;
  postalCode: string;
  address: string;
  addressDetail: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
};

function formatPhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits
    .replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3")
    .replace(/^(\d{3})(\d{1,4})$/, "$1-$2");
}

export function MyInfoPanel({ profile }: { profile: MyProfile }) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  const [postalCode, setPostalCode] = useState(profile.postalCode);
  const [address, setAddress] = useState(profile.address);
  const [addressDetail, setAddressDetail] = useState(profile.addressDetail);
  const [bankName, setBankName] = useState(profile.bankName);
  const [accountNumber, setAccountNumber] = useState(profile.accountNumber);
  const [accountHolder, setAccountHolder] = useState(profile.accountHolder);
  const [infoError, setInfoError] = useState("");
  const [infoNotice, setInfoNotice] = useState("");
  const [savingInfo, startSaveInfo] = useTransition();

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwError, setPwError] = useState("");
  const [pwNotice, setPwNotice] = useState("");
  const [savingPw, startSavePw] = useTransition();

  const saveInfo = () => {
    setInfoError("");
    setInfoNotice("");
    if (!name.trim() || !phone.trim()) {
      setInfoError("이름과 연락처를 모두 입력해 주세요.");
      return;
    }
    startSaveInfo(async () => {
      const r = await updateMyProfileAction({
        name: name.trim(),
        phone: phone.trim(),
        postalCode: postalCode.trim(),
        address: address.trim(),
        addressDetail: addressDetail.trim(),
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountHolder: accountHolder.trim(),
      });
      if (!r.ok) {
        setInfoError(r.error);
        return;
      }
      setInfoNotice("저장되었습니다.");
    });
  };

  const savePw = () => {
    setPwError("");
    setPwNotice("");
    if (pw.next !== pw.confirm) {
      setPwError("새 비밀번호가 일치하지 않습니다.");
      return;
    }
    if (pw.next.length < 8) {
      setPwError("새 비밀번호는 8자 이상이어야 합니다.");
      return;
    }
    if (!/(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/.test(pw.next)) {
      setPwError(
        "새 비밀번호는 영문+숫자+특수문자(!@#$%^&*) 조합이어야 합니다."
      );
      return;
    }
    startSavePw(async () => {
      const r = await changeMyPasswordAction({
        currentPassword: pw.current,
        newPassword: pw.next,
      });
      if (!r.ok) {
        setPwError(r.error);
        return;
      }
      setPwNotice("비밀번호가 변경되었습니다.");
      setPw({ current: "", next: "", confirm: "" });
    });
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="text-2xl font-bold">내정보</h1>

      {/* 회원 정보 */}
      <div className="mt-6 space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">회원 정보</h2>
        <div className="space-y-2">
          <Label htmlFor="my-email">이메일</Label>
          <Input id="my-email" value={profile.email} disabled />
          <p className="text-xs text-muted-foreground">
            이메일은 변경할 수 없습니다.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="my-name">이름</Label>
          <Input
            id="my-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="my-phone">연락처</Label>
          <Input
            id="my-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <Label>주소 (선택)</Label>
          <AddressSearchFields
            idPrefix="my-address"
            value={{ postalCode, address, detail: addressDetail }}
            onChange={(next) => {
              setPostalCode(next.postalCode);
              setAddress(next.address);
              setAddressDetail(next.detail);
            }}
          />
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium">환불·정산 계좌 (선택)</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            환불 또는 정산이 필요할 때 사용됩니다.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="my-bank-name">은행</Label>
          <Input
            id="my-bank-name"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="예: 국민은행"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="my-account-number">계좌번호</Label>
          <Input
            id="my-account-number"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="계좌번호"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="my-account-holder">예금주</Label>
          <Input
            id="my-account-holder"
            value={accountHolder}
            onChange={(e) => setAccountHolder(e.target.value)}
            placeholder="예금주명"
          />
        </div>
        {infoError && <p className="text-sm text-error">{infoError}</p>}
        {infoNotice && !infoError && (
          <p className="text-sm text-success">{infoNotice}</p>
        )}
        <Button onClick={saveInfo} disabled={savingInfo}>
          {savingInfo ? "저장 중..." : "저장"}
        </Button>
      </div>

      {/* 비밀번호 변경 */}
      <div className="mt-6 space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">비밀번호 변경</h2>
        <div className="space-y-2">
          <Label htmlFor="my-cur-pw">현재 비밀번호</Label>
          <Input
            id="my-cur-pw"
            type="password"
            value={pw.current}
            onChange={(e) => setPw({ ...pw, current: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="my-new-pw">새 비밀번호</Label>
          <Input
            id="my-new-pw"
            type="password"
            value={pw.next}
            onChange={(e) => setPw({ ...pw, next: e.target.value })}
            placeholder="8자 이상, 영문+숫자+특수문자"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="my-conf-pw">새 비밀번호 확인</Label>
          <Input
            id="my-conf-pw"
            type="password"
            value={pw.confirm}
            onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
          />
        </div>
        {pwError && <p className="text-sm text-error">{pwError}</p>}
        {pwNotice && !pwError && (
          <p className="text-sm text-success">{pwNotice}</p>
        )}
        <Button variant="outline" onClick={savePw} disabled={savingPw}>
          {savingPw ? "변경 중..." : "비밀번호 변경"}
        </Button>
      </div>

      {/* 알림 설정 */}
      <div className="mt-6 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-4 font-semibold">알림 설정</h2>
        <PushToggle />
      </div>
    </div>
  );
}
