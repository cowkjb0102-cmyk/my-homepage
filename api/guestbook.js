// 방명록: 누구나 이름과 글(글자만)을 남기면 바로 공개돼요. 주인은 답글을 달거나 글을 지울 수 있어요.
// 저장: Upstash Redis (방문자 수와 같은 저장소)
//   gb:items  (hash)  id → 글 JSON
//   gb:order  (zset)  id → 쓴 시각(정렬용)
// 도배 방지: 같은 사람은 1분에 한 번, 하루 10번까지. 관리자 비밀번호는 15분에 10번까지만 틀릴 수 있어요(_guard.js).
// IP는 저장하지 않고, 알아볼 수 없게 바꾼 값만 씁니다. 이 값은 1분~하루 뒤 자동으로 지워져요.
import { randomBytes } from "node:crypto";
import { json, isAdmin } from "./_auth.js";
import { redis, redisReady } from "./_redis.js";
import { clientKey, tooManyFails, noteFail, LOCKED_MSG } from "./_guard.js";

const MAX_NAME = 20;
const MAX_TEXT = 500;
const MAX_REPLY = 500;
const LIST_LIMIT = 100;

// 보이지 않는 제어문자 제거, 줄바꿈 정리, 앞뒤 공백 제거
function clean(s, max, multiline) {
  if (typeof s !== "string") return "";
  s = s.normalize("NFC").replace(/\r\n?/g, "\n");
  s = s.replace(/[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "");
  if (!multiline) s = s.replace(/\n/g, " ");
  else s = s.replace(/\n{3,}/g, "\n\n");
  s = s.trim();
  return [...s].length > max ? null : s;
}

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}

// 방문자 IP → 알아볼 수 없는 짧은 값 (원래 IP는 저장하지 않아요)
const who = (request) => clientKey(request, "gb");

const parse = (raw) => { try { return JSON.parse(raw); } catch { return null; } };

async function list() {
  const ids = (await redis([["ZREVRANGE", "gb:order", 0, LIST_LIMIT - 1]]))[0] || [];
  if (!ids.length) return [];
  const rows = (await redis([["HMGET", "gb:items", ...ids]]))[0] || [];
  return rows.map(parse).filter(Boolean);
}

export async function GET() {
  if (!redisReady()) return json({ enabled: false, items: [] });
  try {
    return json({ enabled: true, items: await list() });
  } catch {
    return json({ error: "방명록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." }, 502);
  }
}

export async function POST(request) {
  if (!redisReady()) return json({ error: "방명록이 아직 준비되지 않았어요." }, 503);

  const raw = await request.text();
  if (raw.length > 8000) return json({ error: "글이 너무 길어요." }, 413);
  const body = parse(raw);
  if (!body || typeof body !== "object") return json({ error: "잘못된 요청이에요." }, 400);

  try {
    // ── 관리자 기능 ──────────────────────────────
    if (body.action === "login" || body.action === "reply" || body.action === "delete") {
      // 비밀번호 마구 넣어보기 막기 (미디어 라이브러리와 같은 횟수를 함께 세요)
      if (await tooManyFails(request)) return json({ error: LOCKED_MSG }, 429);
      if (!isAdmin(body.pw)) {
        await noteFail(request);
        return json({ error: "관리자 비밀번호가 맞지 않아요." }, 401);
      }
      if (body.action === "login") return json({ ok: true });

      const id = typeof body.id === "string" && /^[a-z0-9]{6,40}$/.test(body.id) ? body.id : null;
      if (!id) return json({ error: "잘못된 글이에요." }, 400);

      if (body.action === "delete") {
        await redis([["HDEL", "gb:items", id], ["ZREM", "gb:order", id]]);
        return json({ ok: true });
      }

      // 답글 달기/고치기 (빈 칸이면 답글 지우기)
      const text = clean(body.text, MAX_REPLY, true);
      if (text === null) return json({ error: `답글은 ${MAX_REPLY}자까지 쓸 수 있어요.` }, 400);
      const item = parse((await redis([["HGET", "gb:items", id]]))[0]);
      if (!item) return json({ error: "이미 지워진 글이에요." }, 404);
      if (text) item.reply = { text, time: Date.now() };
      else delete item.reply;
      await redis([["HSET", "gb:items", id, JSON.stringify(item)]]);
      return json({ ok: true, item });
    }

    // ── 방문자 글쓰기 ────────────────────────────
    if (body.action !== "write") return json({ error: "잘못된 요청이에요." }, 400);

    // 스팸 로봇 거르기: 화면을 연 지 3초도 안 돼서 보내면 받지 않아요 (사람이라면 다시 누르면 돼요)
    if (typeof body.openedFor !== "number" || body.openedFor < 3000) {
      return json({ error: "조금 천천히, 한 번만 더 눌러 주세요." }, 400);
    }

    const name = clean(body.name, MAX_NAME, false);
    const text = clean(body.text, MAX_TEXT, true);
    if (name === null) return json({ error: `이름은 ${MAX_NAME}자까지 쓸 수 있어요.` }, 400);
    if (text === null) return json({ error: `글은 ${MAX_TEXT}자까지 쓸 수 있어요.` }, 400);
    if (!name) return json({ error: "이름을 적어 주세요." }, 400);
    if (!text) return json({ error: "남길 글을 적어 주세요." }, 400);
    if ((text.match(/https?:\/\/|www\./gi) || []).length > 2) {
      return json({ error: "인터넷 주소는 2개까지만 넣을 수 있어요." }, 400);
    }

    const h = who(request);
    const day = `gb:day:${h}:${today()}`;
    const [fresh, count] = await redis([
      ["SET", `gb:rl:${h}`, "1", "NX", "EX", 60],
      ["INCR", day],
      ["EXPIRE", day, 60 * 60 * 26],
    ]);
    if (fresh !== "OK") return json({ error: "글은 1분에 한 번만 남길 수 있어요. 잠시 후 다시 시도해 주세요." }, 429);
    if (Number(count) > 10) return json({ error: "오늘은 글을 충분히 남기셨어요. 내일 또 들러 주세요." }, 429);

    const now = Date.now();
    const id = now.toString(36) + randomBytes(4).toString("hex");
    const item = { id, name, text, time: now };
    await redis([
      ["HSET", "gb:items", id, JSON.stringify(item)],
      ["ZADD", "gb:order", now, id],
    ]);
    return json({ ok: true, item });
  } catch {
    return json({ error: "잠시 문제가 생겼어요. 조금 뒤에 다시 시도해 주세요." }, 502);
  }
}
