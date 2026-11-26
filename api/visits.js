// 방문자 수: 오늘(한국 시간 기준) + 누적
// 숫자는 Upstash Redis(Vercel Marketplace 무료 플랜)에 저장해요.
// 아직 연결 전이면 { enabled:false } 를 돌려주고, 화면에서는 숫자를 숨겨요.
import { json } from "./_auth.js";
import { redis, redisReady } from "./_redis.js";

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|curl|wget/i;

function today() {
  // 한국 시간 날짜 (예: 2026-11-26)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

const counts = (day, total) => ({ enabled: true, today: Number(day) || 0, total: Number(total) || 0 });

// GET: 숫자만 보기
export async function GET() {
  if (!redisReady()) return json({ enabled: false });
  try {
    const [day, total] = await redis([["GET", `visits:day:${today()}`], ["GET", "visits:total"]]);
    return json(counts(day, total));
  } catch {
    return json({ enabled: false });
  }
}

// POST: 방문 1회 세기 (브라우저마다 하루 한 번만 보내요)
export async function POST(request) {
  if (!redisReady()) return json({ enabled: false });
  const ua = request.headers.get("user-agent") || "";
  try {
    const d = `visits:day:${today()}`;
    if (BOT.test(ua)) {
      const [day, total] = await redis([["GET", d], ["GET", "visits:total"]]);
      return json(counts(day, total));
    }
    const [day, , total] = await redis([["INCR", d], ["EXPIRE", d, 60 * 60 * 24 * 400], ["INCR", "visits:total"]]);
    return json(counts(day, total));
  } catch {
    return json({ enabled: false });
  }
}
