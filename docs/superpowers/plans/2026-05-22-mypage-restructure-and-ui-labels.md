# 마이페이지 재구성 · 홈 프로세스 라벨 · 헤더 이름 표시 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈 프로세스 단계 라벨을 출고/입고로 바꾸고, 헤더에 이름을 표시하며, `/mypage` 를 내정보(재인증 게이트 포함)로 재구성하고 주문 목록을 `/mypage/orders` 로 분리한다.

**Architecture:** `/mypage` 를 내정보 페이지로 바꾸고 주문 목록을 `/mypage/orders` 로 이동한다. 내정보는 서버 컴포넌트가 재인증 게이트(클라이언트)만 렌더하고, 비밀번호 검증 통과 후 서버 액션이 프로필 데이터를 반환한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase Auth.

---

## 사전 안내 — 검증 방식 / git

- **테스트 러너 없음.** 검증은 `pnpm build`(타입체크 포함) + 수동 확인으로 한다.
  `pnpm lint` 는 프로젝트 전역 사전 이슈로 실행 불가 — 빌드로 갈음.
- **git 저장소 아님.** 커밋 단계 없음. 각 태스크는 `pnpm build` 통과로 마무리.
- `next build` 는 tsconfig include 범위의 모든 `.ts/.tsx` 를 타입체크한다.

## File Structure

**신규 파일**

| 파일 | 책임 |
|---|---|
| `src/app/(user)/mypage/orders/page.tsx` | 신청내역(주문 목록) 서버 페이지 |
| `src/app/(user)/mypage/orders/_components/my-orders-list.tsx` | 주문 목록 컴포넌트 (이동 + 제목 변경) |
| `src/app/(user)/mypage/_components/my-info-gate.tsx` | 내정보 재인증 게이트 |
| `src/app/(user)/mypage/_components/my-info-panel.tsx` | 내정보 수정 패널 |

**수정 파일**

| 파일 | 변경 |
|---|---|
| `src/app/(user)/page.tsx` | 프로세스 3·6단계 라벨/설명 |
| `src/lib/auth/actions.ts` | 서버 액션 3종 추가 |
| `src/app/(user)/mypage/page.tsx` | 내정보 서버 페이지로 교체 |
| `src/components/user/user-header.tsx` | 이름 표시 + 네비 재구성 |
| `src/app/manifest.ts`, `src/lib/orders/actions.ts`, `src/lib/orders/admin-actions.ts`, `src/app/(user)/apply/_components/apply-form.tsx`, `src/app/(user)/apply/payment/page.tsx`, 주문 상세/배송/오버차지 페이지 | `/mypage` → `/mypage/orders` 참조 정리 |

**삭제 파일**

| 파일 | 사유 |
|---|---|
| `src/app/(user)/mypage/_components/my-orders-list.tsx` | `orders/_components/` 로 이동 |
| `src/app/(user)/mypage/profile/page.tsx` | 목업 프로필 페이지 제거 |

---

## Task 1: 홈 프로세스 단계 라벨 수정

**Files:**
- Modify: `src/app/(user)/page.tsx`

- [ ] **Step 1: 03단계 항목 수정**

`src/app/(user)/page.tsx` 에서 아래 줄을 찾는다:

```tsx
              { step: "03", title: "총판 발송", desc: "월말 일괄 국내 총판업체로 발송" },
```

아래로 교체한다:

```tsx
              { step: "03", title: "출고", desc: "월말 일괄로 국내 총판에 출고" },
```

- [ ] **Step 2: 06단계 항목 수정**

`src/app/(user)/page.tsx` 에서 아래 줄을 찾는다:

```tsx
              { step: "06", title: "총판 수령", desc: "그레이딩 업체 → 총판으로 카드 반송" },
```

아래로 교체한다:

```tsx
              { step: "06", title: "입고", desc: "그레이딩 완료 후 총판으로 입고" },
```

- [ ] **Step 3: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공.

---

## Task 2: 사용자 프로필 서버 액션 추가

**Files:**
- Modify: `src/lib/auth/actions.ts` (파일 끝에 추가)

`auth/actions.ts` 는 이미 `createServerClient`, `createServiceClient` 를 import 한다.
비밀번호 검증은 별도 익명 클라이언트(probe)로 `signInWithPassword` 를 호출하는
기존 `changeMyAdminPasswordAction` 패턴을 그대로 쓴다.

- [ ] **Step 1: `signOutAdminAction` 함수 뒤에 액션 3종 추가**

`src/lib/auth/actions.ts` 의 `signOutAdminAction` 함수 닫는 `}` 다음에 아래를 추가한다:

```ts

// ── 내정보(마이페이지) — 재인증 / 프로필 수정 / 비밀번호 변경 ─────────────────

type ProfileActionResult = { ok: false; error: string } | { ok: true };

export type MyProfileData = { email: string; name: string; phone: string };

export type UnlockMyProfileResult =
  | { ok: false; error: string }
  | { ok: true; profile: MyProfileData };

// 내정보 페이지 진입 재인증 — 현재 비밀번호 확인 후 프로필 데이터를 반환.
export async function unlockMyProfileAction(params: {
  password: string;
}): Promise<UnlockMyProfileResult> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user?.email) {
    return { ok: false, error: "로그인이 필요합니다." };
  }
  const password = params.password ?? "";
  if (!password) {
    return { ok: false, error: "비밀번호를 입력해 주세요." };
  }

  // 현재 비밀번호 검증 — 별도 익명 클라이언트(현재 세션 미영향)
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const probe = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await probe.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (signInErr) {
    return { ok: false, error: "비밀번호가 일치하지 않습니다." };
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("name, phone")
    .eq("id", user.id)
    .maybeSingle();

  return {
    ok: true,
    profile: {
      email: user.email,
      name: profile?.name ?? "",
      phone: profile?.phone ?? "",
    },
  };
}

// 이름·연락처 수정.
export async function updateMyProfileAction(params: {
  name: string;
  phone: string;
}): Promise<ProfileActionResult> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) {
    return { ok: false, error: "로그인이 필요합니다." };
  }
  const name = params.name?.trim() ?? "";
  const phone = params.phone?.trim() ?? "";
  if (!name || !phone) {
    return { ok: false, error: "이름과 연락처를 모두 입력해 주세요." };
  }
  if (name.length > 50 || phone.length > 30) {
    return { ok: false, error: "입력값이 너무 깁니다." };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("profiles")
    .update({ name, phone })
    .eq("id", user.id);
  if (error) {
    console.error("[auth] updateMyProfile failed", error);
    return { ok: false, error: "프로필 저장에 실패했습니다." };
  }
  return { ok: true };
}

// 본인 비밀번호 변경.
export async function changeMyPasswordAction(params: {
  currentPassword: string;
  newPassword: string;
}): Promise<ProfileActionResult> {
  const supabase = await createServerClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user?.email) {
    return { ok: false, error: "로그인이 필요합니다." };
  }
  const current = params.currentPassword ?? "";
  const next = params.newPassword ?? "";
  if (!current || !next) {
    return { ok: false, error: "현재 비밀번호와 새 비밀번호를 입력해 주세요." };
  }
  if (next.length < 8) {
    return { ok: false, error: "새 비밀번호는 8자 이상이어야 합니다." };
  }
  if (current === next) {
    return { ok: false, error: "새 비밀번호가 현재 비밀번호와 동일합니다." };
  }

  // 현재 비밀번호 검증
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const probe = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await probe.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (signInErr) {
    return { ok: false, error: "현재 비밀번호가 일치하지 않습니다." };
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    console.error("[auth] changeMyPassword failed", error);
    return { ok: false, error: `비밀번호 변경 실패: ${error.message}` };
  }
  return { ok: true };
}
```

- [ ] **Step 2: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공, 타입 오류 0.

---

## Task 3: 신청내역 페이지 (`/mypage/orders`)

**Files:**
- Create: `src/app/(user)/mypage/orders/_components/my-orders-list.tsx` (기존 파일 복사 + 제목 수정)
- Create: `src/app/(user)/mypage/orders/page.tsx`

이 태스크는 기존 `mypage/_components/my-orders-list.tsx` 와 `mypage/page.tsx` 를 아직
**삭제·수정하지 않는다** (빌드 유지). 정리는 Task 4 에서 한다.

- [ ] **Step 1: `my-orders-list.tsx` 를 새 위치로 복사**

기존 파일을 새 위치로 그대로 복사한다:

```
cp "src/app/(user)/mypage/_components/my-orders-list.tsx" "src/app/(user)/mypage/orders/_components/my-orders-list.tsx"
```

(`orders/_components/` 디렉터리가 없으면 복사 명령이 자동 생성하지 못하므로 먼저
`mkdir -p "src/app/(user)/mypage/orders/_components"` 실행.)

- [ ] **Step 2: 복사본의 제목 수정**

새 파일 `src/app/(user)/mypage/orders/_components/my-orders-list.tsx` 에서 아래 줄을 찾는다:

```tsx
      <h1 className="text-2xl font-bold">마이페이지</h1>
```

아래로 교체한다:

```tsx
      <h1 className="text-2xl font-bold">신청 내역</h1>
```

- [ ] **Step 3: `mypage/orders/page.tsx` 생성**

`src/app/(user)/mypage/orders/page.tsx`:

```tsx
import { getMyOrders } from "@/lib/orders/queries";
import { MyOrdersList } from "./_components/my-orders-list";

export const dynamic = "force-dynamic";

export default async function MyOrdersPage() {
  const orders = await getMyOrders();
  return <MyOrdersList orders={orders} />;
}
```

- [ ] **Step 4: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공. `/mypage/orders` 라우트 생성. (이 시점에 `my-orders-list.tsx` 가
구·신 두 곳에 존재하지만 경로가 달라 충돌 없음.)

---

## Task 4: 내정보 페이지 (`/mypage`)

**Files:**
- Create: `src/app/(user)/mypage/_components/my-info-panel.tsx`
- Create: `src/app/(user)/mypage/_components/my-info-gate.tsx`
- Modify: `src/app/(user)/mypage/page.tsx` (전체 교체)
- Delete: `src/app/(user)/mypage/_components/my-orders-list.tsx`
- Delete: `src/app/(user)/mypage/profile/page.tsx`

의존: Task 2 (서버 액션), Task 3 (`/mypage/orders` 존재).

- [ ] **Step 1: `my-info-panel.tsx` 생성**

`src/app/(user)/mypage/_components/my-info-panel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PushToggle } from "@/components/mypage/push-toggle";
import {
  changeMyPasswordAction,
  updateMyProfileAction,
} from "@/lib/auth/actions";

export type MyProfile = { email: string; name: string; phone: string };

function formatPhone(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits
    .replace(/^(\d{3})(\d{4})(\d{4})$/, "$1-$2-$3")
    .replace(/^(\d{3})(\d{1,4})$/, "$1-$2");
}

export function MyInfoPanel({ profile }: { profile: MyProfile }) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
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
            placeholder="8자 이상"
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
```

- [ ] **Step 2: `my-info-gate.tsx` 생성**

`src/app/(user)/mypage/_components/my-info-gate.tsx`:

```tsx
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
```

- [ ] **Step 3: `mypage/page.tsx` 를 내정보 페이지로 교체**

`src/app/(user)/mypage/page.tsx` 전체를 아래로 교체:

```tsx
import { MyInfoGate } from "./_components/my-info-gate";

export default function MyPage() {
  return <MyInfoGate />;
}
```

- [ ] **Step 4: 구 파일 삭제**

아래 두 파일을 삭제한다:

```
rm "src/app/(user)/mypage/_components/my-orders-list.tsx"
rm "src/app/(user)/mypage/profile/page.tsx"
```

(`src/app/(user)/mypage/profile/` 디렉터리가 비면 함께 제거: `rmdir "src/app/(user)/mypage/profile"`.)

- [ ] **Step 5: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공. `/mypage` 는 내정보, `/mypage/profile` 라우트 제거됨.

---

## Task 5: 헤더 — 이름 표시 + 네비 재구성

**Files:**
- Modify: `src/components/user/user-header.tsx` (전체 교체)

- [ ] **Step 1: `user-header.tsx` 전체를 아래로 교체**

`src/components/user/user-header.tsx`:

```tsx
import Link from "next/link";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { signOutAction } from "@/lib/auth/actions";

export async function UserHeader() {
  let displayName: string | null = null;
  try {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", user.id)
        .maybeSingle();
      displayName = profile?.name?.trim() || user.email || null;
    }
  } catch {
    displayName = null;
  }

  const isLoggedIn = !!displayName;

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="text-xl font-bold text-primary">
          TRAINERS
        </Link>

        <nav className="flex items-center gap-4">
          <Link
            href="/apply"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            그레이딩 신청
          </Link>

          {isLoggedIn ? (
            <>
              <Link
                href="/mypage/orders"
                className="text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                신청내역
              </Link>
              <Link
                href="/mypage"
                className="text-sm font-medium text-foreground hover:text-primary"
              >
                {displayName}
              </Link>
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  로그아웃
                </button>
              </form>
            </>
          ) : (
            <Link
              href="/login"
              className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              로그인
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공.

---

## Task 6: `/mypage` 참조 경로 정리

"주문 목록"을 의미하던 `/mypage` 참조를 `/mypage/orders` 로 수정한다.

**Files:**
- Modify: `src/app/manifest.ts`
- Modify: `src/lib/orders/actions.ts`
- Modify: `src/lib/orders/admin-actions.ts`
- Modify: `src/app/(user)/apply/_components/apply-form.tsx`
- Modify: `src/app/(user)/apply/payment/page.tsx`
- Modify: `src/app/(user)/mypage/orders/[id]/_components/order-detail-client.tsx`
- Modify: `src/app/(user)/mypage/orders/[id]/page.tsx`
- Modify: `src/app/(user)/mypage/orders/[id]/shipping/page.tsx`
- Modify: `src/app/(user)/mypage/orders/[id]/overcharge/page.tsx`

- [ ] **Step 1: PWA manifest start_url 수정**

`src/app/manifest.ts` 에서 `start_url: "/mypage",` 를 `start_url: "/mypage/orders",` 로 교체.

- [ ] **Step 2: `orders/actions.ts` 의 revalidatePath 수정**

`src/lib/orders/actions.ts` 에서 `revalidatePath("/mypage")` (총 6곳)를 모두
`revalidatePath("/mypage/orders")` 로 교체한다. (Edit `replace_all: true`. 백틱을 쓰는
`revalidatePath(\`/mypage/orders/...\`)` 는 문자열이 달라 영향받지 않는다.)

- [ ] **Step 3: `admin-actions.ts` 의 revalidatePath 수정**

`src/lib/orders/admin-actions.ts` 에서 `revalidatePath("/mypage")` (1곳)를
`revalidatePath("/mypage/orders")` 로 교체.

- [ ] **Step 4: 신청 완료 리다이렉트 수정**

`src/app/(user)/apply/_components/apply-form.tsx` 에서 아래 줄을 찾는다:

```tsx
      router.push(`/mypage?paid=${result.orderIds.join(",")}`);
```

아래로 교체한다:

```tsx
      router.push(`/mypage/orders?paid=${result.orderIds.join(",")}`);
```

- [ ] **Step 5: 결제 페이지 기본 backLink 수정**

`src/app/(user)/apply/payment/page.tsx` 에서 `backLink = "/mypage",` 를
`backLink = "/mypage/orders",` 로 교체.

- [ ] **Step 6: 주문 상세/배송/오버차지 페이지의 목록 링크 수정**

아래 4개 파일에서 각각 `href="/mypage"` (각 파일당 1곳) 를 `href="/mypage/orders"` 로
교체한다:

- `src/app/(user)/mypage/orders/[id]/_components/order-detail-client.tsx`
- `src/app/(user)/mypage/orders/[id]/page.tsx`
- `src/app/(user)/mypage/orders/[id]/shipping/page.tsx`
- `src/app/(user)/mypage/orders/[id]/overcharge/page.tsx`

- [ ] **Step 7: 빌드 검증**

Run: `pnpm build`
Expected: 빌드 성공.

---

## Task 7: 최종 검증

**Files:** 없음

- [ ] **Step 1: 전체 빌드**

Run: `pnpm build`
Expected: 빌드 성공, 타입 오류 0, `/mypage`·`/mypage/orders` 포함 전 라우트 생성,
`/mypage/profile` 미존재.

- [ ] **Step 2: 수동 확인 (`pnpm dev`)**

- [ ] 홈 대행 프로세스 3단계 "출고", 6단계 "입고" 로 표시.
- [ ] 로그인 헤더에 이름 표시, 클릭 시 `/mypage`(내정보) 이동. "신청내역" 링크는
      `/mypage/orders` 로 이동.
- [ ] `/mypage` 진입 시 비밀번호 입력 게이트 → 틀린 비번은 오류, 맞으면 패널 노출.
- [ ] 패널에서 이메일(읽기전용)·이름·연락처 표시, 이름/연락처 수정 후 저장 → 재진입 시 반영.
- [ ] 비밀번호 변경 후 로그아웃 → 새 비밀번호로 로그인 가능.
- [ ] `/mypage/orders` 가 "신청 내역" 제목으로 주문 목록 표시, 주문 상세 진입 정상.
- [ ] 신청 완료 후 `/mypage/orders` 로 이동.

---

## Self-Review (작성자 점검 결과)

**1. Spec coverage**

- Part 1 (홈 3·6단계 라벨) → Task 1. ✅
- Part 2 (헤더 이름 표시) → Task 5. ✅
- Part 3 라우팅(/mypage=내정보, /mypage/orders=신청내역) → Task 3·4. ✅
- Part 3 재인증 게이트 + 내정보 패널(이메일·이름·연락처·비번변경·푸시) → Task 4. ✅
- Part 3 서버 액션 3종 → Task 2. ✅
- Part 3 헤더 네비 재구성 → Task 5. ✅
- Part 3 목업 profile 삭제 → Task 4 Step 4. ✅
- Part 3 `/mypage` 참조 정리 → Task 6. ✅

**2. Placeholder scan:** TBD/TODO/모호 표현 없음. 모든 코드 단계에 완전한 코드 또는
정확한 단일 치환 지시 포함. ✅

**3. Type consistency**

- `MyProfile` (`{email,name,phone}`) — `my-info-panel.tsx` 정의, `my-info-gate.tsx` 가
  import 해 사용. `unlockMyProfileAction` 반환의 `profile` 은 구조적으로 동일
  (`MyProfileData`) → `MyInfoPanel` prop 에 할당 가능. ✅
- `unlockMyProfileAction`/`updateMyProfileAction`/`changeMyPasswordAction` — Task 2 정의,
  Task 4 의 gate/panel 에서 동일 시그니처로 호출. ✅
- `ProfileActionResult`(`{ok:false;error} | {ok:true}`) — `updateMyProfileAction`·
  `changeMyPasswordAction` 반환, 패널이 `r.ok`/`r.error` 로 분기. ✅
- `MyOrdersList` props(`orders`) — Task 3 이동본과 `mypage/orders/page.tsx` 호출 일치. ✅
