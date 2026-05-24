<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-26 | Updated: 2026-04-26 -->

# apply

## Purpose
Step components for the multi-step grading-application form at `/apply`. The orchestrating page (`src/app/(user)/apply/page.tsx`) holds the `ApplyFormData` state and dispatches to one of these step components based on the current step. The form was redesigned to remove the original 4단계 동의/확인 step — agreement is now collected at apply submission and reviewed admin-side before moving to mypage; the step file numbering (`step2-`, `step3-`, `step4-`, `step5-`) preserves history.

## Key Files

| File | Description |
|------|-------------|
| `step-indicator.tsx` | 3-step visual progress bar shown above each step. Steps: 그레이딩사 선택 → 카드 정보 → 수령 방식 |
| `step2-grading-option.tsx` | Grading company + service-level selection. Reads `GRADING_COMPANIES` and surface-rendered services |
| `step3-card-info.tsx` | Per-card form: cardName/englishName/setName/cardNumber/year/declaredValue + front/back image upload. Supports a "간편 입력" vs "상세 입력" mode toggle (`isDetailed`); back-image upload was removed in the simplified flow. Uses `FileUpload` from `ui/` |
| `step4-pickup-method.tsx` | `STORE_PICKUP \| DELIVERY` choice + delivery address + spoiler preference (`ALLOW \| DENY` for "등급 결과 미리보기 설정") |
| `step5-agreement.tsx` | Privacy / terms / notice agreement checkboxes + customer memo. Triggered as the final submit step before the form posts |

## For AI Agents

### Working In This Directory
- The multi-step state model is `ApplyFormData` from `src/types/apply-form.ts`. To add a field, edit that interface, the `INITIAL_FORM`/`INITIAL_CARD` factories, the affected step component, and the orchestrating page.
- `declaredValue` is intentionally a **string** in form state and converted to `number` only at submit time — keep that boundary.
- Card images (`frontImage`, `backImage`) are `File | null` in form state. Uploads to Supabase Storage happen at submit; do not eagerly upload from these step components.
- The "간편/상세 모드" toggle is per-card (`CardFormData.isDetailed`). Default is `false` (간편). Only the detailed mode surfaces year/setName/cardNumber/declaredValue inputs in full.
- `step5-agreement.tsx` exists in the file tree but is not part of the live customer flow — agreement collection moved post-submission. Verify with the page orchestrator before re-introducing it as a visible step.

### Common Patterns
- Each step component receives `formData` and `setFormData` (or `updateField`) from the orchestrator and renders only its slice.
- Korean labels and validation messages.

## Dependencies

### Internal
- `@/types/apply-form` (`ApplyFormData`, `CardFormData`, `INITIAL_*`).
- `@/types` (`GradingCompany`, `PickupMethod`, `SpoilerPreference`).
- `@/constants/grading` (`GRADING_COMPANIES`, `PHOTO_UPLOAD`).
- `@/components/ui/*` for primitives.

<!-- MANUAL: -->
