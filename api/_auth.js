// 비밀번호 확인 도우미 (api 폴더의 다른 파일에서 함께 사용)
// ADMIN_PASSWORD: 올리기/지우기용, VIEW_PASSWORD: (선택) 보기 잠금용
// 둘 다 Vercel 프로젝트 설정 > Environment Variables 에서 정해요.
import { createHash, timingSafeEqual } from "node:crypto";

function same(a, b) {
  const x = createHash("sha256").update(String(a)).digest();
  const y = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(x, y);
}

export function adminConfigured() {
  return !!process.env.ADMIN_PASSWORD;
}

export function isAdmin(pw) {
  const real = process.env.ADMIN_PASSWORD;
  return !!real && typeof pw === "string" && pw.length > 0 && same(pw, real);
}

// 보기 잠금이 없으면 누구나 볼 수 있어요. 관리자 비밀번호로도 볼 수 있어요.
export function canView(pw) {
  const real = process.env.VIEW_PASSWORD;
  if (!real) return true;
  return typeof pw === "string" && (same(pw, real) || isAdmin(pw));
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
