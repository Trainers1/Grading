"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { AddressSearchFields } from "@/components/ui/address-search-input";
import { signUpAction } from "@/lib/auth/actions";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    passwordConfirm: "",
    name: "",
    phone: "",
    postalCode: "",
    address: "",
    addressDetail: "",
    bankName: "",
    accountNumber: "",
    accountHolder: "",
    agreeAll: false,
    agreeTerms: false,
    agreePrivacy: false,
    agreeMarketing: false,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const update = (fields: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...fields }));
    setErrors([]);
  };

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/[^0-9]/g, "");
    const formatted = digits
      .replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3")
      .replace(/^(\d{3})(\d{1,4})$/, "$1-$2");
    update({ phone: formatted });
  };

  const handleAllAgree = () => {
    const next = !form.agreeAll;
    update({
      agreeAll: next,
      agreeTerms: next,
      agreePrivacy: next,
      agreeMarketing: next,
    });
  };

  const handleIndividualAgree = (
    field: "agreeTerms" | "agreePrivacy" | "agreeMarketing",
    checked: boolean
  ) => {
    const newForm = { ...form, [field]: checked };
    newForm.agreeAll =
      newForm.agreeTerms && newForm.agreePrivacy && newForm.agreeMarketing;
    update(newForm);
  };

  const validate = (): string[] => {
    const errs: string[] = [];
    if (!form.email.trim()) errs.push("이메일을 입력해 주세요.");
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errs.push("올바른 이메일 형식을 입력해 주세요.");
    if (!form.password) errs.push("비밀번호를 입력해 주세요.");
    else if (form.password.length < 8)
      errs.push("비밀번호는 8자 이상이어야 합니다.");
    else if (
      !/(?=.*[a-zA-Z])(?=.*[0-9])(?=.*[!@#$%^&*])/.test(form.password)
    )
      errs.push("비밀번호는 영문+숫자+특수문자 조합이어야 합니다.");
    if (form.password !== form.passwordConfirm)
      errs.push("비밀번호가 일치하지 않습니다.");
    if (!form.name.trim()) errs.push("성함을 입력해 주세요.");
    if (!form.phone.trim()) errs.push("연락처를 입력해 주세요.");
    else if (!/^010-\d{4}-\d{4}$/.test(form.phone))
      errs.push("올바른 연락처 형식을 입력해 주세요. (010-XXXX-XXXX)");
    if (!form.agreeTerms) errs.push("서비스 이용약관에 동의해 주세요.");
    if (!form.agreePrivacy)
      errs.push("개인정보 수집·이용에 동의해 주세요.");
    return errs;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }

    startTransition(async () => {
      const result = await signUpAction({
        email: form.email,
        password: form.password,
        name: form.name,
        phone: form.phone,
        postalCode: form.postalCode,
        address: form.address,
        addressDetail: form.addressDetail,
        bankName: form.bankName,
        accountNumber: form.accountNumber,
        accountHolder: form.accountHolder,
      });

      if (!result.ok) {
        setErrors([result.error]);
        return;
      }

      router.push(result.redirectTo);
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-md px-4 py-8 sm:py-12">
      <div className="text-center">
        <h1 className="text-2xl font-bold">회원가입</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          TRAINERS 그레이딩 대행 서비스
        </p>
      </div>

      {errors.length > 0 && (
        <div className="mt-6 rounded-lg border border-error/30 bg-error/5 p-4">
          <ul className="space-y-1 text-sm text-error">
            {errors.map((err, i) => (
              <li key={i}>• {err}</li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">
            이메일 <span className="text-error">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => update({ email: e.target.value })}
            placeholder="example@email.com"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">
            비밀번호 <span className="text-error">*</span>
          </Label>
          <Input
            id="password"
            type="password"
            value={form.password}
            onChange={(e) => update({ password: e.target.value })}
            placeholder="영문+숫자+특수문자 8자 이상"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="passwordConfirm">
            비밀번호 확인 <span className="text-error">*</span>
          </Label>
          <Input
            id="passwordConfirm"
            type="password"
            value={form.passwordConfirm}
            onChange={(e) => update({ passwordConfirm: e.target.value })}
            placeholder="비밀번호를 다시 입력하세요"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="name">
            성함 <span className="text-error">*</span>
          </Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="홍길동"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">
            연락처 (휴대폰) <span className="text-error">*</span>
          </Label>
          <Input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            placeholder="010-1234-5678"
          />
        </div>

        {/* 선택 입력 — 주소 · 환불 계좌 */}
        <div className="space-y-4 rounded-lg border border-border bg-muted/30 p-4">
          <div>
            <p className="text-sm font-medium">선택 입력</p>
            <p className="mt-1 text-xs text-muted-foreground">
              지금 입력하지 않아도 가입 후 내정보에서 언제든지 수정할 수 있습니다.
            </p>
          </div>

          <div className="space-y-2">
            <Label>주소</Label>
            <AddressSearchFields
              idPrefix="register-address"
              value={{
                postalCode: form.postalCode,
                address: form.address,
                detail: form.addressDetail,
              }}
              onChange={(next) =>
                update({
                  postalCode: next.postalCode,
                  address: next.address,
                  addressDetail: next.detail,
                })
              }
            />
            <p className="text-xs text-muted-foreground">
              택배 수령 시 사용할 기본 주소입니다.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bankName">은행</Label>
            <Input
              id="bankName"
              value={form.bankName}
              onChange={(e) => update({ bankName: e.target.value })}
              placeholder="예: 국민은행"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accountNumber">계좌번호</Label>
            <Input
              id="accountNumber"
              value={form.accountNumber}
              onChange={(e) => update({ accountNumber: e.target.value })}
              placeholder="환불·정산 시 사용할 계좌번호"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accountHolder">예금주</Label>
            <Input
              id="accountHolder"
              value={form.accountHolder}
              onChange={(e) => update({ accountHolder: e.target.value })}
              placeholder="예금주명"
            />
          </div>
        </div>

        {/* 약관 동의 */}
        <div className="space-y-3 rounded-lg border border-border p-4">
          <div className="border-b border-border pb-3">
            <Checkbox
              id="agreeAll"
              label="전체 동의"
              checked={form.agreeAll}
              onChange={handleAllAgree}
            />
          </div>
          <Checkbox
            id="agreeTerms"
            label="서비스 이용약관 동의 (필수)"
            checked={form.agreeTerms}
            onChange={(e) =>
              handleIndividualAgree(
                "agreeTerms",
                (e.target as HTMLInputElement).checked
              )
            }
          />
          <Checkbox
            id="agreePrivacy"
            label="개인정보 수집·이용 동의 (필수)"
            checked={form.agreePrivacy}
            onChange={(e) =>
              handleIndividualAgree(
                "agreePrivacy",
                (e.target as HTMLInputElement).checked
              )
            }
          />
          <Checkbox
            id="agreeMarketing"
            label="마케팅 수신 동의 (선택)"
            checked={form.agreeMarketing}
            onChange={(e) =>
              handleIndividualAgree(
                "agreeMarketing",
                (e.target as HTMLInputElement).checked
              )
            }
          />
        </div>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "가입 중..." : "회원가입"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        이미 계정이 있으신가요?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          로그인
        </Link>
      </p>
    </div>
  );
}
