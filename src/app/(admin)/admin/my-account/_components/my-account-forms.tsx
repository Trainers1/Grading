"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changeMyAdminPasswordAction,
  updateMyAdminProfileAction,
} from "@/lib/orders/admin-actions";

type Props = {
  initialNickname: string;
  initialName: string;
};

export function MyAccountForms({ initialNickname, initialName }: Props) {
  // 데스크탑 2열 — 프로필 | 비밀번호 동시 노출
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ProfileForm
        initialNickname={initialNickname}
        initialName={initialName}
      />
      <PasswordForm />
    </div>
  );
}

function ProfileForm({ initialNickname, initialName }: Props) {
  const router = useRouter();
  const [nickname, setNickname] = useState(initialNickname);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, startTransition] = useTransition();

  const dirty = nickname !== initialNickname || name !== initialName;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    startTransition(async () => {
      const r = await updateMyAdminProfileAction({ nickname, name });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess("저장되었습니다.");
      router.refresh();
    });
  };

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">프로필</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          닉네임은 로그인 화면 드롭다운에 노출됩니다.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-3 px-4 py-3">
        <div className="space-y-1">
          <Label className="text-xs">닉네임 (2~30자)</Label>
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="store01"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">이름</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="submit" size="sm" disabled={pending || !dirty}>
            {pending ? "저장 중..." : "저장"}
          </Button>
          {error && <span className="text-xs text-error">{error}</span>}
          {success && <span className="text-xs text-success">{success}</span>}
        </div>
      </form>
    </section>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (next !== confirm) {
      setError("새 비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    startTransition(async () => {
      const r = await changeMyAdminPasswordAction({
        currentPassword: current,
        newPassword: next,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess("변경되었습니다.");
      setCurrent("");
      setNext("");
      setConfirm("");
    });
  };

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">비밀번호 변경</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          최초 <strong>000000</strong>. 운영 전 반드시 변경.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-3 px-4 py-3">
        <div className="space-y-1">
          <Label className="text-xs">현재 비밀번호</Label>
          <Input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">새 비밀번호 (6자 이상)</Label>
          <Input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">새 비밀번호 확인</Label>
          <Input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "변경 중..." : "변경"}
          </Button>
          {error && <span className="text-xs text-error">{error}</span>}
          {success && <span className="text-xs text-success">{success}</span>}
        </div>
      </form>
    </section>
  );
}
