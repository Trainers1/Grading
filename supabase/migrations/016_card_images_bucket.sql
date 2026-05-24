-- =====================================================================
-- 016_card_images_bucket.sql
-- 카드 앞면 이미지 저장용 Supabase Storage 버킷 생성.
--   * card-images: 공개 버킷 — 고객 주문상세 페이지가 front_image_url 을 일반
--     URL 로 직접 렌더링하므로 공개 버킷이 적합(서명 URL 불필요).
--   * 업로드/삭제는 서버 액션의 service-role 클라이언트로만 수행하므로 RLS 를
--     우회한다. 공개 버킷은 읽기가 자동 허용되어 별도 storage 정책이 필요 없다.
--   * cards.front_image_url 컬럼은 005 마이그레이션에서 이미 nullable 로 존재.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'card-images',
  'card-images',
  true,
  10485760, -- 10MB
  array['image/jpeg', 'image/png']
)
on conflict (id) do nothing;
