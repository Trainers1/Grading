"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GRADING_COMPANIES } from "@/constants/grading";
import {
  deleteGradingServiceAction,
  toggleGradingServiceActiveAction,
  upsertGradingServiceAction,
} from "@/lib/orders/admin-actions";
import type { GradingCompany, GradingService } from "@/types";

const EMPTY_DRAFT = {
  code: "",
  name: "",
  price: 0,
  estimatedDays: "",
  description: "",
  sortOrder: 0,
  transitDays: 7,
};

type Props = {
  services: GradingService[];
  canEdit: boolean;
};

function formatCurrency(amount: number): string {
  return `₩${amount.toLocaleString("ko-KR")}`;
}

export function GradingServicesEditor({ services, canEdit }: Props) {
  const grouped = GRADING_COMPANIES.map((c) => ({
    company: c,
    list: services
      .filter((s) => s.company === c.value)
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko")
      ),
  }));

  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">서비스 가격표</h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            등급회사별 서비스 등급 및 대행 가격 ({services.length}건)
          </p>
        </div>
        {!canEdit && (
          <span className="text-[11px] text-muted-foreground">
            슈퍼관리자만 편집 가능
          </span>
        )}
      </div>

      <div className="grid gap-3 px-4 py-3 md:grid-cols-2 xl:grid-cols-4">
        {grouped.map(({ company, list }) => (
          <CompanyBlock
            key={company.value}
            companyValue={company.value}
            companyLabel={company.label}
            companyDescription={company.description}
            services={list}
            canEdit={canEdit}
          />
        ))}
      </div>
    </section>
  );
}

function CompanyBlock({
  companyValue,
  companyLabel,
  companyDescription,
  services,
  canEdit,
}: {
  companyValue: GradingCompany;
  companyLabel: string;
  companyDescription: string;
  services: GradingService[];
  canEdit: boolean;
}) {
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{companyLabel}</h3>
        <span className="truncate pl-2 text-[10px] text-muted-foreground">
          {companyDescription}
        </span>
      </div>

      {services.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          등록된 서비스가 없습니다.
        </p>
      ) : (
        <table className="mt-2 w-full">
          <tbody>
            {services.map((s) => (
              <ServiceRow key={s.id} service={s} canEdit={canEdit} />
            ))}
          </tbody>
        </table>
      )}

      {canEdit &&
        (showAdd ? (
          <AddServiceForm
            company={companyValue}
            onClose={() => setShowAdd(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="mt-2 w-full rounded-md border border-dashed border-border py-1.5 text-[11px] text-muted-foreground hover:bg-muted/30"
          >
            + 서비스 추가
          </button>
        ))}
    </div>
  );
}

function ServiceRow({
  service,
  canEdit,
}: {
  service: GradingService;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <tr className="border-t border-border">
        <td colSpan={3} className="py-2">
          <EditServiceForm
            service={service}
            onClose={() => setEditing(false)}
          />
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border align-top">
      <td className="py-1.5">
        <p className="text-sm font-medium leading-tight">{service.name}</p>
        <p className="text-[10px] text-muted-foreground">
          {service.code} · {service.estimatedDays}
          {!service.isActive && (
            <span className="ml-1.5 rounded bg-muted px-1 text-[10px] text-muted-foreground">
              비활성
            </span>
          )}
        </p>
      </td>
      <td className="py-1.5 text-right font-mono text-xs">
        {formatCurrency(service.price)}
      </td>
      {canEdit && (
        <td className="py-1.5 pl-1 text-right">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[11px] text-primary hover:underline"
          >
            편집
          </button>
        </td>
      )}
    </tr>
  );
}

function ServiceFormFields({
  values,
  onChange,
}: {
  values: typeof EMPTY_DRAFT;
  onChange: (next: typeof EMPTY_DRAFT) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label className="text-xs">코드</Label>
        <Input
          value={values.code}
          onChange={(e) => onChange({ ...values, code: e.target.value })}
          placeholder="psa_economy"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">이름</Label>
        <Input
          value={values.name}
          onChange={(e) => onChange({ ...values, name: e.target.value })}
          placeholder="Economy"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">가격 (원)</Label>
        <Input
          type="number"
          min={0}
          value={values.price}
          onChange={(e) =>
            onChange({ ...values, price: Number(e.target.value) || 0 })
          }
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">예상 소요기간</Label>
        <Input
          value={values.estimatedDays}
          onChange={(e) =>
            onChange({ ...values, estimatedDays: e.target.value })
          }
          placeholder="30영업일"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">정렬 순서</Label>
        <Input
          type="number"
          value={values.sortOrder}
          onChange={(e) =>
            onChange({ ...values, sortOrder: Number(e.target.value) || 0 })
          }
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Transit Days</Label>
        <Input
          type="number"
          min={0}
          value={values.transitDays}
          onChange={(e) =>
            onChange({ ...values, transitDays: Number(e.target.value) || 0 })
          }
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label className="text-xs">설명 (선택)</Label>
        <Input
          value={values.description}
          onChange={(e) =>
            onChange({ ...values, description: e.target.value })
          }
        />
      </div>
    </div>
  );
}

function AddServiceForm({
  company,
  onClose,
}: {
  company: GradingCompany;
  onClose: () => void;
}) {
  const [values, setValues] = useState(EMPTY_DRAFT);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError("");
    startTransition(async () => {
      const r = await upsertGradingServiceAction({
        company,
        code: values.code,
        name: values.name,
        price: values.price,
        estimatedDays: values.estimatedDays,
        description: values.description || undefined,
        sortOrder: values.sortOrder,
        transitDays: values.transitDays,
        isActive: true,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
    });
  };

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <ServiceFormFields values={values} onChange={setValues} />
      {error && <p className="text-xs text-error">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClose}
          disabled={pending}
        >
          취소
        </Button>
        <Button type="button" size="sm" onClick={submit} disabled={pending}>
          {pending ? "저장 중..." : "추가"}
        </Button>
      </div>
    </div>
  );
}

function EditServiceForm({
  service,
  onClose,
}: {
  service: GradingService;
  onClose: () => void;
}) {
  const [values, setValues] = useState({
    code: service.code,
    name: service.name,
    price: service.price,
    estimatedDays: service.estimatedDays,
    description: service.description ?? "",
    sortOrder: service.sortOrder,
    transitDays: service.transitDays,
  });
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [togglePending, startToggle] = useTransition();
  const [deletePending, startDelete] = useTransition();

  const save = () => {
    setError("");
    startTransition(async () => {
      const r = await upsertGradingServiceAction({
        id: service.id,
        company: service.company,
        code: values.code,
        name: values.name,
        price: values.price,
        estimatedDays: values.estimatedDays,
        description: values.description || undefined,
        sortOrder: values.sortOrder,
        transitDays: values.transitDays,
        isActive: service.isActive,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
    });
  };

  const toggle = () => {
    setError("");
    startToggle(async () => {
      const r = await toggleGradingServiceActiveAction({
        id: service.id,
        isActive: !service.isActive,
      });
      if (!r.ok) setError(r.error);
    });
  };

  const remove = () => {
    if (!confirm(`'${service.name}' 서비스를 삭제하시겠습니까?`)) return;
    setError("");
    startDelete(async () => {
      const r = await deleteGradingServiceAction({ id: service.id });
      if (!r.ok) setError(r.error);
      else onClose();
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
      <ServiceFormFields values={values} onChange={setValues} />
      {error && <p className="text-xs text-error">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={toggle}
            disabled={togglePending}
          >
            {togglePending
              ? "전환 중..."
              : service.isActive
                ? "비활성화"
                : "활성화"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={remove}
            disabled={deletePending}
            className="text-error"
          >
            {deletePending ? "삭제 중..." : "삭제"}
          </Button>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={pending}
          >
            취소
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            {pending ? "저장 중..." : "저장"}
          </Button>
        </div>
      </div>
    </div>
  );
}
