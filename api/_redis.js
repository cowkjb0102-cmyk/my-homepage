// Upstash Redis(Vercel Marketplace) 간단 도우미 — 방문자 수, 미디어 목록에 함께 사용
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const redisReady = () => !!(URL_ && TOKEN);

// 여러 명령을 한 번에 보내고 결과 배열을 돌려줘요. 예: redis([["GET","a"],["INCR","b"]])
export async function redis(commands) {
  const r = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error("redis " + r.status);
  const out = await r.json();
  for (const x of out) if (x && x.error) throw new Error("redis " + x.error);
  return out.map((x) => x.result);
}
