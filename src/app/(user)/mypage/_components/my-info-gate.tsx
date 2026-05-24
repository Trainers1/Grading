"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { unlockMyProfileAction } from "@/lib/auth/actions";
import { MyInfoPanel, type MyProfile } from "./my-info-panel";

// 내정보 진입 재인증 게이트 — 비밀번호 확인 통과 후에만 패널을 노출.
export function MyInfoGate() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    startTransition(async () => {
      const r = await unlockMyProfileAction({ password });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setProfile(r.profile);
      setPassword("");
    });
  };

  if (profile) {
    return <MyInfoPanel profile={profile} />;
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <h1 className="text-2xl font-bold">내정보</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        계정 정보를 보호하기 위해 현재 비밀번호를 다시 입력해 주세요.
      </p>
      <form
        onSubmit={submit}
        className="mt-6 space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div className="space-y-2">
          <Label htmlFor="reauth-pw">비밀번호</Label>
          <Input
            id="reauth-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        {error && <p className="text-sm text-error">{error}</p>}
        <Button
          type="submit"
          disabled={pending || !password}
          className="w-full"
        >
          {pending ? "확인 중..." : "확인"}
        </Button>
      </form>
    </div>
  );
}
