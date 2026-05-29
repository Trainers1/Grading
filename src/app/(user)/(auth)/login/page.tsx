"use client";

import { useState, Suspense, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInAction } from "@/lib/auth/actions";
import { safeRedirectOrFallback } from "@/lib/auth/redirect";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Open Redirect 방어 — 외부 URL/프로토콜은 "/" 로 폴백.
  const redirect = safeRedirectOrFallback(searchParams.get("redirect"), "/");
  const registered = searchParams.get("registered");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }

    startTransition(async () => {
      const result = await signInAction({
        email,
        password,
        expectedRole: "customer",
        redirectTo: redirect,
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
    <div className="mx-auto max-w-md px-4 py-8 sm:py-12">
      <div className="text-center">
        <h1 className="text-2xl font-bold">로그인</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          TRAINERS 그레이딩 대행 서비스
        </p>
      </div>

      {registered && (
        <div className="mt-6 rounded-lg border border-success/30 bg-success/5 p-4 text-sm text-success">
          회원가입이 완료되었습니다. 로그인해 주세요.
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-error/30 bg-error/5 p-4 text-sm text-error">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">이메일</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@email.com"
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">비밀번호</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호를 입력하세요"
            autoComplete="current-password"
          />
        </div>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "로그인 중..." : "로그인"}
        </Button>
      </form>

      <div className="mt-6 flex justify-center gap-4 text-sm text-muted-foreground">
        <Link href="/register" className="hover:text-primary">
          회원가입
        </Link>
        <span>|</span>
        <button type="button" className="hover:text-primary">
          비밀번호 찾기
        </button>
      </div>
    </div>
  );
}
