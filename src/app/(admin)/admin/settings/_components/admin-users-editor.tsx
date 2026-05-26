"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createAdminUserAction,
  deleteAdminUserAction,
  resetAdminPasswordAction,
  toggleAdminActiveAction,
  updateAdminRoleAction,
} from "@/lib/orders/admin-actions";
import type { AdminRole, AdminUser } from "@/types";

const ROLE_OPTIONS: { value: AdminRole; label: string }[] = [
  { value: "SUPER_ADMIN", label: "슈퍼 관리자" },
  { value: "GENERAL_ADMIN", label: "일반 관리자" },
  { value: "STORE_SHARED", label: "매장 공유 계정" },
];

const ROLE_LABELS = Object.fromEntries(
  ROLE_OPTIONS.map((r) => [r.value, r.label])
) as Record<AdminRole, string>;

type Props = {
  admins: AdminUser[];
  canManage: boolean;
  currentAdminId: string;
};

export function AdminUsersEditor({ admins, canManage, currentAdminId }: Props) {
  const approved = admins.filter((a) => a.status === "APPROVED");

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="grid gap-4 lg:grid-cols-2">
          <CreateAdminForm />
          <RolePermissionGuide />
        </div>
      )}

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">관리자 계정</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              현재 {approved.length}명
            </p>
          </div>
          {!canManage && (
            <span className="text-[11px] text-muted-foreground">
              슈퍼관리자만 편집 가능
            </span>
          )}
        </div>
        {approved.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">
            등록된 관리자가 없습니다.
          </div>
        ) : (
          <>
            {/* 데스크탑 테이블 (md 이상) */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-left text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">닉네임</th>
                    <th className="px-3 py-2">이름</th>
                    <th className="px-3 py-2">역할</th>
                    <th className="px-3 py-2">상태</th>
                    <th className="px-3 py-2 text-right">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {approved.map((a) => (
                    <ApprovedRow
                      key={a.id}
                      admin={a}
                      canManage={canManage}
                      isSelf={a.id === currentAdminId}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* 모바일 카드 리스트 (md 미만) */}
            <div className="divide-y divide-border md:hidden">
              {approved.map((a) => (
                <ApprovedRowMobile
                  key={a.id}
                  admin={a}
                  canManage={canManage}
                  isSelf={a.id === currentAdminId}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function CreateAdminForm() {
  const [nickname, setNickname] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<AdminRole>("GENERAL_ADMIN");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    startTransition(async () => {
      const r = await createAdminUserAction({ nickname, name, role });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSuccess(`'${nickname}' 추가됨. 최초 비밀번호: 000000`);
      setNickname("");
      setName("");
    });
  };

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">새 관리자 추가</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          닉네임은 로그인 화면에 노출. 최초 비밀번호 <strong>000000</strong>.
        </p>
      </div>
      <form
        onSubmit={submit}
        className="grid items-end gap-2 px-4 py-3 sm:grid-cols-2 md:grid-cols-[1fr_1fr_auto_auto]"
      >
        <div className="space-y-1">
          <Label className="text-[11px]">닉네임</Label>
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="store01"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">이름</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="홍길동"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">역할</Label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as AdminRole)}
            className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={pending}
          className="w-full md:w-auto"
        >
          {pending ? "추가 중..." : "추가"}
        </Button>
        {(error || success) && (
          <div className="sm:col-span-2 md:col-span-4">
            {error && <p className="text-xs text-error">{error}</p>}
            {success && <p className="text-xs text-success">{success}</p>}
          </div>
        )}
      </form>
    </section>
  );
}

function RolePermissionGuide() {
  const rows: { role: string; summary: string; tone: string }[] = [
    {
      role: "슈퍼 관리자",
      summary:
        "모든 기능 — 주문 상태 변경·카드 정보 입력·주문 취소·환불, 주문 영구 삭제, 관리자 계정 관리, 서비스 가격표 변경",
      tone: "text-primary",
    },
    {
      role: "일반 관리자",
      summary:
        "주문 상태 변경·카드 정보 입력·주문 취소·환불 처리 가능. 주문 영구 삭제·관리자 계정 관리·가격표 변경 불가.",
      tone: "text-foreground",
    },
    {
      role: "매장 공유 계정",
      summary:
        "주문 조회 + 주문 상태 변경만 가능. 카드 정보 입력·주문 취소·환불·삭제 불가.",
      tone: "text-muted-foreground",
    },
  ];

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold">역할별 권한</h2>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          관리자 계정 역할에 따른 기능 차이입니다.
        </p>
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li key={r.role} className="px-4 py-2.5">
            <p className={`text-xs font-semibold ${r.tone}`}>{r.role}</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              {r.summary}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ApprovedRow 의 상태/핸들러 공유 훅 — desktop·mobile variant 가 동일 로직 사용.
function useApprovedRowEditor(admin: AdminUser) {
  const [role, setRole] = useState<AdminRole>(
    (admin.role ?? "GENERAL_ADMIN") as AdminRole
  );
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [rolePending, startRoleSave] = useTransition();
  const [togglePending, startToggle] = useTransition();
  const [resetPending, startReset] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const dirty = role !== admin.role;

  const saveRole = () => {
    setError("");
    setInfo("");
    startRoleSave(async () => {
      const r = await updateAdminRoleAction({ adminId: admin.id, role });
      if (!r.ok) setError(r.error);
    });
  };

  const toggleActive = () => {
    setError("");
    setInfo("");
    startToggle(async () => {
      const r = await toggleAdminActiveAction({
        adminId: admin.id,
        isActive: !admin.isActive,
      });
      if (!r.ok) setError(r.error);
    });
  };

  const resetPassword = () => {
    if (!confirm(`'${admin.nickname}'의 비밀번호를 000000 으로 초기화합니다.`))
      return;
    setError("");
    setInfo("");
    startReset(async () => {
      const r = await resetAdminPasswordAction({ adminId: admin.id });
      if (!r.ok) setError(r.error);
      else setInfo("000000 으로 초기화됨");
    });
  };

  const remove = () => {
    if (!confirm(`'${admin.nickname}' 관리자를 영구 삭제합니다. 진행할까요?`))
      return;
    setError("");
    setInfo("");
    startDelete(async () => {
      const r = await deleteAdminUserAction({ adminId: admin.id });
      if (!r.ok) setError(r.error);
    });
  };

  return {
    role,
    setRole,
    dirty,
    error,
    info,
    rolePending,
    togglePending,
    resetPending,
    deletePending,
    saveRole,
    toggleActive,
    resetPassword,
    remove,
  };
}

function ApprovedRow({
  admin,
  canManage,
  isSelf,
}: {
  admin: AdminUser;
  canManage: boolean;
  isSelf: boolean;
}) {
  const ed = useApprovedRowEditor(admin);

  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-2 font-mono text-xs">
        {admin.nickname}
        {isSelf && (
          <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
            본인
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-sm">{admin.name}</td>
      <td className="px-3 py-2">
        {canManage ? (
          <div className="flex items-center gap-1">
            <select
              value={ed.role}
              onChange={(e) => ed.setRole(e.target.value as AdminRole)}
              disabled={ed.rolePending}
              className="rounded-md border border-border bg-background px-1.5 py-1 text-xs"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {ed.dirty && (
              <Button
                type="button"
                size="sm"
                onClick={ed.saveRole}
                disabled={ed.rolePending}
              >
                {ed.rolePending ? "..." : "저장"}
              </Button>
            )}
          </div>
        ) : (
          <span className="text-xs">
            {ROLE_LABELS[(admin.role ?? "GENERAL_ADMIN") as AdminRole]}
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        {admin.isActive ? (
          <span className="rounded-md bg-success/10 px-1.5 py-0.5 text-[11px] font-medium text-success">
            활성
          </span>
        ) : (
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            비활성
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-col items-end gap-1">
          {(ed.error || ed.info) && (
            <div className="text-right text-[11px]">
              {ed.error && <p className="text-error">{ed.error}</p>}
              {ed.info && <p className="text-success">{ed.info}</p>}
            </div>
          )}
          {canManage && (
            <div className="flex gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={ed.resetPassword}
                disabled={ed.resetPending}
                title="비밀번호 초기화"
              >
                {ed.resetPending ? "..." : "초기화"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={ed.toggleActive}
                disabled={ed.togglePending || isSelf}
                title={isSelf ? "본인 계정은 비활성화 불가" : undefined}
              >
                {ed.togglePending
                  ? "..."
                  : admin.isActive
                    ? "비활성화"
                    : "활성화"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={ed.remove}
                disabled={ed.deletePending || isSelf}
                className="text-error"
                title={isSelf ? "본인 계정은 삭제 불가" : undefined}
              >
                {ed.deletePending ? "..." : "삭제"}
              </Button>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function ApprovedRowMobile({
  admin,
  canManage,
  isSelf,
}: {
  admin: AdminUser;
  canManage: boolean;
  isSelf: boolean;
}) {
  const ed = useApprovedRowEditor(admin);

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium">
            {admin.nickname}
            {isSelf && (
              <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                본인
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{admin.name}</p>
        </div>
        {admin.isActive ? (
          <span className="shrink-0 rounded-md bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success">
            활성
          </span>
        ) : (
          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            비활성
          </span>
        )}
      </div>

      <div className="mt-2">
        <Label className="text-[11px] text-muted-foreground">역할</Label>
        {canManage ? (
          <div className="mt-0.5 flex items-center gap-2">
            <select
              value={ed.role}
              onChange={(e) => ed.setRole(e.target.value as AdminRole)}
              disabled={ed.rolePending}
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {ed.dirty && (
              <Button
                type="button"
                size="sm"
                onClick={ed.saveRole}
                disabled={ed.rolePending}
              >
                {ed.rolePending ? "..." : "저장"}
              </Button>
            )}
          </div>
        ) : (
          <p className="mt-0.5 text-sm">
            {ROLE_LABELS[(admin.role ?? "GENERAL_ADMIN") as AdminRole]}
          </p>
        )}
      </div>

      {(ed.error || ed.info) && (
        <div className="mt-1 text-xs">
          {ed.error && <p className="text-error">{ed.error}</p>}
          {ed.info && <p className="text-success">{ed.info}</p>}
        </div>
      )}

      {canManage && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={ed.resetPassword}
            disabled={ed.resetPending}
          >
            {ed.resetPending ? "..." : "초기화"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={ed.toggleActive}
            disabled={ed.togglePending || isSelf}
            title={isSelf ? "본인 계정은 비활성화 불가" : undefined}
          >
            {ed.togglePending ? "..." : admin.isActive ? "비활성화" : "활성화"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={ed.remove}
            disabled={ed.deletePending || isSelf}
            className="text-error"
            title={isSelf ? "본인 계정은 삭제 불가" : undefined}
          >
            {ed.deletePending ? "..." : "삭제"}
          </Button>
        </div>
      )}
    </div>
  );
}
