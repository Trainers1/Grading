"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "@/lib/auth/actions";

type Option = { id: string; nickname: string };

export function AdminLoginForm({ options }: { options: Option[] }) {
  const router = useRouter();
  const [nickname, setNickname] = useState(options[0]?.nickname ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!nickname) {
      setError("닉네임을 선택해 주세요.");
      return;
    }
    if (!password) {
      setError("비밀번호를 입력해 주세요.");
      return;
    }

    startTransition(async () => {
      const result = await signInAction({
        nickname,
        password,
        expectedRole: "admin",
        redirectTo: "/admin",
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push(result.redirectTo);
      router.refresh();
    });
  };

  return (
    <>
      {options.length === 0 && (
        <div className="mt-6 rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm text-warning">
          등록된 관리자가 없습니다. 슈퍼관리자에게 문의해 주세요.
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-error/30 bg-error/5 p-4 text-sm text-error">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="admin-nickname">닉네임</Label>
          <select
            id="admin-nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            disabled={options.length === 0}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {options.length === 0 ? (
              <option value="">선택할 관리자가 없습니다</option>
            ) : (
              options.map((o) => (
                <option key={o.id} value={o.nickname}>
                  {o.nickname}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="admin-password">비밀번호</Label>
          <Input
            id="admin-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호를 입력하세요"
            autoComplete="current-password"
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={isPending || options.length === 0}
        >
          {isPending ? "로그인 중..." : "관리자 로그인"}
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        최초 비밀번호는 <strong>000000</strong> 입니다. 로그인 후 내 계정에서
        변경하세요.
      </p>
    </>
  );
}
