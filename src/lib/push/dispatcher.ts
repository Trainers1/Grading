// 푸시 알림 dispatcher — notifications_outbox 대기 row를 처리하여 web-push 발송
// Vercel Cron GET /api/push/dispatch에서 호출됨
//
// 핵심 설계:
//   - LIMIT 100 배치 처리, 50s 내부 타임아웃
//   - attempt_count < 5인 row만 처리 (5회 초과 = dead letter)
//   - 410 Gone → push_subscriptions.expired_at 채움
//   - 5xx → attempt_count++, last_error 기록
//   - 201/204 → dispatched_at 채움
//   - PII 마스킹: endpoint/p256dh/auth는 prefix 8자만 로그에 기록 (Critic patch 6b)

import type { SupabaseClient } from "@supabase/supabase-js";
import type webpush from "web-push";
import { getWebPushClient } from "@/lib/push/vapid";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/database.types";
import { NOTIFICATION_TITLE, NOTIFICATION_BODY } from "@/constants/notifications";

const BATCH_LIMIT = 100;
const INTERNAL_TIMEOUT_MS = 50_000; // 50초 (Vercel Cron 60s 타임아웃보다 10초 여유)
const MAX_ATTEMPTS = 5;

type ServiceClient = SupabaseClient<Database>;
type WebPushClient = typeof webpush;

export type DispatchResult = {
  processed: number;
  dispatched: number;
  expired: number;
  failed: number;
  skipped: number;
  durationMs: number;
};

type OutboxRow = {
  id: string;
  order_id: string;
  order_status_log_id: string;
  status_key: string;
  subscriber_email: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

// Supabase 중첩 조인은 cardinality에 따라 object 또는 array 형태로 반환되어
// 둘 다 수용하도록 union으로 선언한다.
type JoinedProfile = { email: string | null } | null;
type JoinedOrder = {
  user_id: string | null;
  profiles: JoinedProfile | JoinedProfile[];
} | null;
type JoinedOutboxRow = {
  id: string;
  order_id: string;
  order_status_log_id: string;
  status_key: string;
  orders: JoinedOrder | JoinedOrder[];
};

/**
 * 미발송 outbox row를 처리하여 web-push를 발송한다.
 * dispatcher는 호출 측(Route Handler)에서 Bearer 검증 후 호출해야 한다.
 */
export async function runDispatcher(): Promise<DispatchResult> {
  const startTime = Date.now();
  const supabase = createServiceClient();
  const webpush = getWebPushClient();

  const result: DispatchResult = {
    processed: 0,
    dispatched: 0,
    expired: 0,
    failed: 0,
    skipped: 0,
    durationMs: 0,
  };

  // ── 1. 대기 outbox row 조회 ───────────────────────────────────────────────
  // NOTE: FOR UPDATE SKIP LOCKED는 Supabase JS가 직접 지원 안 함.
  // cron 단일 호출 보장(Vercel Cron 1 instance) 환경에서는 application-level 처리로 충분.
  // 동시 호출 가능성이 생기면 fn_pick_pending_dispatches() DB 함수로 전환 (plan §B4 option a).
  const { data: pendingRows, error: fetchError } = await supabase
    .from("notifications_outbox")
    .select(
      `
      id,
      order_id,
      order_status_log_id,
      status_key,
      orders!inner ( user_id, profiles!inner ( email ) )
    `
    )
    .is("dispatched_at", null)
    .is("skipped_reason", null)
    .lt("attempt_count", MAX_ATTEMPTS)
    .order("created_at")
    .limit(BATCH_LIMIT)
    .returns<JoinedOutboxRow[]>();

  if (fetchError) {
    console.error("[push] dispatcher fetch error", fetchError.message);
    result.durationMs = Date.now() - startTime;
    return result;
  }

  if (!pendingRows || pendingRows.length === 0) {
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // ── 2. 각 outbox row 처리 ─────────────────────────────────────────────────
  for (const rawRow of pendingRows) {
    // 50s 내부 타임아웃 체크
    if (Date.now() - startTime > INTERNAL_TIMEOUT_MS) {
      console.warn(
        `[push] dispatcher early exit — timeout at processed=${result.processed}`
      );
      break;
    }

    result.processed++;

    // customer email 추출 (Supabase nested join)
    // !inner 조인은 단일 객체, 그 외는 배열로 반환될 수 있어 양쪽 모두 수용.
    const orderData = Array.isArray(rawRow.orders) ? rawRow.orders[0] : rawRow.orders;
    const profileData = orderData
      ? Array.isArray(orderData.profiles)
        ? orderData.profiles[0]
        : orderData.profiles
      : null;
    const subscriberEmail: string | undefined = profileData?.email ?? undefined;

    if (!subscriberEmail) {
      // customer 이메일을 찾을 수 없으면 skip
      await supabase
        .from("notifications_outbox")
        .update({ skipped_reason: "no_customer_email", dispatched_at: new Date().toISOString() })
        .eq("id", rawRow.id);
      result.skipped++;
      continue;
    }

    const row: OutboxRow = {
      id: rawRow.id,
      order_id: rawRow.order_id,
      order_status_log_id: rawRow.order_status_log_id,
      status_key: rawRow.status_key,
      subscriber_email: subscriberEmail,
    };

    await processOutboxRow(supabase, webpush, row, result);
  }

  result.durationMs = Date.now() - startTime;

  console.info(
    `[push] dispatched count=${result.dispatched} duration_ms=${result.durationMs}`
  );

  return result;
}

/**
 * 단일 outbox row를 처리한다.
 * 해당 고객의 활성 push_subscriptions를 조회하고 각 endpoint에 발송한다.
 */
async function processOutboxRow(
  supabase: ServiceClient,
  webpush: WebPushClient,
  row: OutboxRow,
  result: DispatchResult
): Promise<void> {
  // 활성 구독 조회 (expired_at IS NULL)
  const { data: subscriptions, error: subsError } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("subscriber_email", row.subscriber_email)
    .is("expired_at", null);

  if (subsError) {
    console.error(
      `[push] dispatch failed orderId=${row.order_id} error=subscription_fetch_failed`
    );
    await incrementAttempt(supabase, row.id, "subscription_fetch_failed");
    result.failed++;
    return;
  }

  // 구독 0건이면 skip
  if (!subscriptions || subscriptions.length === 0) {
    await supabase
      .from("notifications_outbox")
      .update({
        skipped_reason: "no_subscription",
        dispatched_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    result.skipped++;
    return;
  }

  // 알림 페이로드
  const payload = JSON.stringify({
    title: NOTIFICATION_TITLE,
    body: NOTIFICATION_BODY,
    data: {
      orderId: row.order_id,
      statusKey: row.status_key,
    },
  });

  let anySuccess = false;
  let lastError: string | null = null;

  for (const sub of subscriptions as PushSubscriptionRow[]) {
    // PII 마스킹: endpoint prefix 8자만 로그에 기록
    const endpointPrefix = sub.endpoint.slice(0, 8);

    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth_key,
          },
        },
        payload
      );
      anySuccess = true;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      const errMessage = (err as { message?: string }).message ?? String(err);

      if (statusCode === 410) {
        // 구독 만료 — expired_at 채움
        console.warn(
          `[push] subscription expired endpoint=${endpointPrefix}...`
        );
        await supabase
          .from("push_subscriptions")
          .update({ expired_at: new Date().toISOString() })
          .eq("id", sub.id);
        result.expired++;
      } else {
        // 5xx 또는 기타 오류
        console.error(
          `[push] dispatch failed orderId=${row.order_id} error=${statusCode ?? "unknown"}`
        );
        lastError = `${statusCode ?? "unknown"}: ${errMessage.slice(0, 200)}`;
      }
    }
  }

  // outbox row 상태 업데이트
  if (anySuccess) {
    await supabase
      .from("notifications_outbox")
      .update({ dispatched_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id);
    result.dispatched++;
  } else if (lastError !== null) {
    // 모든 endpoint 실패
    await incrementAttempt(supabase, row.id, lastError);
    result.failed++;
  } else {
    // 모든 endpoint가 410 만료 → 사실상 발송 대상 없음 → skip 처리
    await supabase
      .from("notifications_outbox")
      .update({
        skipped_reason: "all_subscriptions_expired",
        dispatched_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    result.skipped++;
  }
}

/**
 * outbox row의 attempt_count를 증가시키고 last_error를 기록한다.
 */
async function incrementAttempt(
  supabase: ServiceClient,
  rowId: string,
  error: string
): Promise<void> {
  // attempt_count는 DB에서 증가 (race condition 최소화를 위해 increment 패턴 사용)
  await supabase.rpc("fn_increment_outbox_attempt", {
    p_row_id: rowId,
    p_error: error,
  });
}
