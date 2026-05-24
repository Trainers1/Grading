import Link from "next/link";

export function UserFooter() {
  return (
    <footer className="border-t border-border bg-muted">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <h3 className="text-lg font-bold text-primary">TRAINERS</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              트레이딩 카드 그레이딩 대행 서비스
            </p>
          </div>

          <div>
            <h4 className="font-semibold">매장 안내</h4>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p>주소: 경기 안양시 동안구 평촌대로217번길 15 3층, 트레이너스</p>
              <p>영업시간: 월-토 12:00 ~ 22:00 / 일 12:00 ~ 21:00</p>
              <p>연락처: 0507-1352-2370</p>
            </div>
          </div>

          <div>
            <h4 className="font-semibold">고객 지원</h4>
            <div className="mt-2 space-y-1 text-sm">
              <Link
                href="/terms"
                className="block text-muted-foreground hover:text-foreground"
              >
                서비스 이용약관
              </Link>
              <Link
                href="/privacy"
                className="block text-muted-foreground hover:text-foreground"
              >
                개인정보처리방침
              </Link>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-border pt-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} TRAINERS. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
