// Supabase Database 타입 정의
// supabase gen types typescript 대신 수동 관리 (Supabase CLI 미연결 환경)
// 추후 supabase gen types로 자동 생성으로 전환 예정.

type GradingCompany = "PSA" | "BGS" | "CGC" | "BRG";

type OrderStatus =
  | "PAYMENT_PENDING"
  | "CARD_DELIVERY_PENDING"
  | "CARD_RECEIVED"
  | "SHIPPED_OUT"
  | "DISTRIBUTOR_SHIPPED"
  | "GRADE_CONFIRMED"
  | "TRAINERS_ARRIVED"
  | "COMPLETED";

type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "OVERCHARGE_PENDING"
  | "OVERCHARGE_PAID"
  | "REFUNDED"
  | "FAILED";

type PickupMethod = "STORE_PICKUP" | "DELIVERY";

type SpoilerPreference = "ALLOW" | "DENY";

type AdminRole = "SUPER_ADMIN" | "GENERAL_ADMIN" | "STORE_SHARED";

type BatchStatus = "PREPARING" | "SHIPPED" | "RECEIVED" | "COMPLETED";

export interface Database {
  public: {
    Tables: {
      orders: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          phone: string;
          pickup_method: PickupMethod;
          postal_code: string | null;
          delivery_address: string | null;
          delivery_address_detail: string | null;
          address_source: "MY" | "MANUAL";
          grading_company: GradingCompany;
          service_level: string;
          service_price_snapshot: number;
          payment_status: PaymentStatus;
          prepaid_amount: number;
          overcharge_amount: number | null;
          shipping_fee: number;
          order_status: OrderStatus;
          spoiler_preference: SpoilerPreference;
          customer_memo: string | null;
          internal_memo: string | null;
          received_at: string | null;
          shipped_out_at: string | null;
          distributor_shipped_at: string | null;
          distributor_tracking_number: string | null;
          user_tracking_number: string | null;
          shipment_group_id: string | null;
          user_shipped_at: string | null;
          cancelled_at: string | null;
          cancel_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          name: string;
          phone: string;
          pickup_method: PickupMethod;
          postal_code?: string | null;
          delivery_address?: string | null;
          delivery_address_detail?: string | null;
          address_source?: "MY" | "MANUAL";
          grading_company: GradingCompany;
          service_level: string;
          service_price_snapshot: number;
          payment_status?: PaymentStatus;
          prepaid_amount?: number;
          overcharge_amount?: number | null;
          shipping_fee?: number;
          order_status?: OrderStatus;
          spoiler_preference?: SpoilerPreference;
          customer_memo?: string | null;
          internal_memo?: string | null;
          received_at?: string | null;
          shipped_out_at?: string | null;
          distributor_shipped_at?: string | null;
          distributor_tracking_number?: string | null;
          user_tracking_number?: string | null;
          shipment_group_id?: string | null;
          user_shipped_at?: string | null;
          cancelled_at?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["orders"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "orders_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      cards: {
        Row: {
          id: string;
          order_id: string;
          english_name: string | null;
          set_name: string | null;
          card_number: string | null;
          year: string | null;
          declared_value: number | null;
          front_image_url: string | null;
          back_image_url: string | null;
          condition_photo_url: string | null;
          grade_result: string | null;
          serial_number: string | null;
          slab_photo_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          english_name?: string | null;
          set_name?: string | null;
          card_number?: string | null;
          year?: string | null;
          declared_value?: number | null;
          front_image_url?: string | null;
          back_image_url?: string | null;
          condition_photo_url?: string | null;
          grade_result?: string | null;
          serial_number?: string | null;
          slab_photo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["cards"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "cards_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          name: string;
          phone: string;
          provider: "email" | "kakao" | "naver";
          phone_verified: boolean;
          is_blocked: boolean;
          block_reason: string | null;
          notification_enabled: boolean;
          marketing_enabled: boolean;
          postal_code: string | null;
          address: string | null;
          address_detail: string | null;
          bank_name: string | null;
          account_number: string | null;
          account_holder: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          name?: string;
          phone?: string;
          provider?: "email" | "kakao" | "naver";
          phone_verified?: boolean;
          is_blocked?: boolean;
          block_reason?: string | null;
          notification_enabled?: boolean;
          marketing_enabled?: boolean;
          postal_code?: string | null;
          address?: string | null;
          address_detail?: string | null;
          bank_name?: string | null;
          account_number?: string | null;
          account_holder?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      admin_users: {
        Row: {
          id: string;
          email: string;
          name: string;
          // 009: 로그인 화면 닉네임 드롭다운에 노출되는 식별자. UNIQUE.
          nickname: string;
          // 008 마이그레이션 이후 nullable — 승인(APPROVED) 시 SUPER_ADMIN 이 부여
          role: AdminRole | null;
          is_active: boolean;
          user_id: string | null;
          // 008 마이그레이션: 가입 승인 워크플로우
          status: "PENDING" | "APPROVED" | "REJECTED";
          requested_at: string;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name: string;
          nickname: string;
          role?: AdminRole | null;
          is_active?: boolean;
          user_id?: string | null;
          status?: "PENDING" | "APPROVED" | "REJECTED";
          requested_at?: string;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_users"]["Row"]>;
        Relationships: [];
      };
      order_status_logs: {
        Row: {
          id: string;
          order_id: string;
          previous_status: OrderStatus | null;
          new_status: OrderStatus;
          changed_by: string | null;
          change_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          previous_status?: OrderStatus | null;
          new_status: OrderStatus;
          changed_by?: string | null;
          change_reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["order_status_logs"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "order_status_logs_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      grading_services: {
        Row: {
          id: string;
          company: GradingCompany;
          code: string;
          name: string;
          price: number;
          estimated_days: string;
          description: string | null;
          is_active: boolean;
          sort_order: number;
          transit_days: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company: GradingCompany;
          code: string;
          name: string;
          price: number;
          estimated_days: string;
          description?: string | null;
          is_active?: boolean;
          sort_order?: number;
          transit_days?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["grading_services"]["Row"]>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          subscriber_email: string;
          user_id: string | null;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          user_agent: string | null;
          created_at: string;
          expired_at: string | null;
        };
        Insert: {
          id?: string;
          subscriber_email: string;
          user_id?: string | null;
          endpoint: string;
          p256dh: string;
          auth_key: string;
          user_agent?: string | null;
          created_at?: string;
          expired_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["push_subscriptions"]["Row"]>;
        Relationships: [];
      };
      notifications_outbox: {
        Row: {
          id: string;
          order_id: string;
          order_status_log_id: string;
          status_key: string;
          channel: string;
          dispatched_at: string | null;
          attempt_count: number;
          last_error: string | null;
          skipped_reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          order_status_log_id: string;
          status_key: string;
          channel?: string;
          dispatched_at?: string | null;
          attempt_count?: number;
          last_error?: string | null;
          skipped_reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications_outbox"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "notifications_outbox_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_outbox_order_status_log_id_fkey";
            columns: ["order_status_log_id"];
            referencedRelation: "order_status_logs";
            referencedColumns: ["id"];
          }
        ];
      };
      payments: {
        Row: {
          id: string;
          order_id: string;
          payment_type: "PREPAYMENT" | "OVERCHARGE" | "REFUND" | "SHIPPING";
          amount: number;
          payment_method: string | null;
          toss_order_id: string | null;
          toss_payment_key: string | null;
          idempotency_key: string | null;
          status: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
          raw_response: unknown | null;
          failure_reason: string | null;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          payment_type: "PREPAYMENT" | "OVERCHARGE" | "REFUND" | "SHIPPING";
          amount: number;
          payment_method?: string | null;
          toss_order_id?: string | null;
          toss_payment_key?: string | null;
          idempotency_key?: string | null;
          status?: "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
          raw_response?: unknown | null;
          failure_reason?: string | null;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payments"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
      batches: {
        Row: {
          id: string;
          company: GradingCompany;
          batch_month: string;
          status: BatchStatus;
          submitted_at: string | null;
          shipped_at: string | null;
          received_at: string | null;
          completed_at: string | null;
          tracking_number: string | null;
          receipt_url: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          company: GradingCompany;
          batch_month: string;
          status?: BatchStatus;
          submitted_at?: string | null;
          shipped_at?: string | null;
          received_at?: string | null;
          completed_at?: string | null;
          tracking_number?: string | null;
          receipt_url?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["batches"]["Row"]>;
        Relationships: [];
      };
      batch_orders: {
        Row: {
          batch_id: string;
          order_id: string;
          added_at: string;
        };
        Insert: {
          batch_id: string;
          order_id: string;
          added_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["batch_orders"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "batch_orders_batch_id_fkey";
            columns: ["batch_id"];
            referencedRelation: "batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "batch_orders_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      fn_increment_outbox_attempt: {
        Args: { p_row_id: string; p_error: string };
        Returns: undefined;
      };
      fn_enqueue_milestone_dispatch: {
        Args: Record<string, never>;
        Returns: undefined;
      };
      is_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      generate_order_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      promote_shipped_to_in_grading: {
        Args: Record<string, never>;
        Returns: number;
      };
      auto_cancel_unpaid_orders: {
        Args: Record<string, never>;
        Returns: number;
      };
      auto_complete_delivered_orders: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
