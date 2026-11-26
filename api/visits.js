// 방문자 수: 오늘(한국 시간 기준) + 누적
// 숫자는 Upstash Redis(Vercel Marketplace 무료 플랜)에 저장해요.
// 연결되면 Vercel이 KV_REST_API_URL / KV_REST_API_TOKEN (또는 UPSTASH_REDIS_REST_*)을 자동으로 넣어 줘요.
// 아직 연결 전이면 { enabled:false } 를 돌려주고, 화면에서는 숫자를 숨겨요.
import { json } from "./_auth.js";

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|curl|wget/i;

function today() {
  // 한국 시간 날짜 (예: 2026-11-26)
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

async function redis(commands) {
  const r = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error("redis " + r.status);
  return (await r.json()).map((x) => x.result);
}

const counts = (day, total) => ({ enabled: true, today: Number(day) || 0, total: Number(total) || 0 });

// GET: 숫자만 보기
export async function GET() {
  if (!URL_ || !TOKEN) return json({ enabled: false });
  try {
    const d = `visits:day:${today()}`;
    const [day, total] = await redis([["GET", d], ["GET", "visits:total"]]);
    return json(counts(day, total));
  } catch {
    return json({ enabled: false });
  }
}

// POST: 방문 1회 세기 (브라우저마다 하루 한 번만 보내요)
export async function POST(request) {
  if (!URL_ || !TOKEN) return json({ enabled: false });
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
