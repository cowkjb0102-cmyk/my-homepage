// 비밀번호 마구 넣어보기 막기 (방명록, 미디어 라이브러리, 업로드가 함께 사용)
// 같은 사람(IP 기준)이 어디서든 15분 동안 10번 틀리면, 15분 동안 비밀번호 확인을 막아요.
// IP는 저장하지 않고, 알아볼 수 없게 바꾼 값만 써요. 이 값은 15분 뒤 자동으로 지워져요.
import { createHash } from "node:crypto";
import { redis, redisReady } from "./_redis.js";

const LIMIT = 10;
const WINDOW = 15 * 60; // 초

export const LOCKED_MSG = "비밀번호를 여러 번 틀렸어요. 15분 뒤에 다시 시도해 주세요.";

// 방문자 IP → 알아볼 수 없는 짧은 값
export function clientKey(request, purpose = "auth") {
  const ip = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    || request.headers.get("x-real-ip") || "unknown";
  const salt = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
  return createHash("sha256").update(`${salt}|${purpose}|${ip}`).digest("hex").slice(0, 24);
}

const failKey = (request) => `auth:fail:${clientKey(request)}`;

// 이미 너무 많이 틀렸으면 true (저장소가 없거나 문제가 생기면 막지 않아요)
export async function tooManyFails(request) {
  if (!redisReady()) return false;
  try {
    const [n] = await redis([["GET", failKey(request)]]);
    return (Number(n) || 0) >= LIMIT;
  } catch {
    return false;
  }
}

// 틀린 횟수 1 늘리기
export async function noteFail(request) {
  if (!redisReady()) return;
  try {
    const k = failKey(request);
    await redis([["INCR", k], ["EXPIRE", k, WINDOW]]);
  } catch {}
}
