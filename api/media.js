// 미디어 라이브러리 목록 보기 / 비밀번호 확인 / 목록에 추가 / 지우기
// 목록은 Redis에 저장해서, 올리자마자 누구에게나 바로 보여요.
// (Redis가 없을 때만 저장소를 직접 훑어서 목록을 만들어요.)
import { list, del } from "@vercel/blob";
import { isAdmin, adminConfigured, canView, json } from "./_auth.js";
import { MEDIA_RE, THUMB_RE } from "./_paths.js";
import { redis, redisReady } from "./_redis.js";

const KEY = "media:items"; // 해시: id → 항목 JSON
const READY = "media:indexed"; // 저장소에서 한 번 목록을 옮겨 왔는지 표시

async function listAll(prefix) {
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    out.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

function itemFrom(pathname, url, size, thumb) {
  const m = MEDIA_RE.exec(pathname);
  if (!m) return null;
  const [, d, t, id, kind] = m;
  return {
    id,
    taken: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4)}`,
    type: kind[0] === "v" ? "video" : "photo",
    duration: kind.length > 1 ? Number(kind.slice(1)) : null,
    url,
    thumb: thumb || null,
    size: Number(size) || 0,
  };
}

// 저장소(Blob)를 직접 훑어 목록 만들기
async function scanBlob() {
  const [media, thumbs] = await Promise.all([listAll("media/"), listAll("thumbs/")]);
  const thumbById = new Map();
  for (const b of thumbs) {
    const m = THUMB_RE.exec(b.pathname);
    if (m) thumbById.set(m[3], b.url);
  }
  const items = [];
  for (const b of media) {
    const m = MEDIA_RE.exec(b.pathname);
    const it = m && itemFrom(b.pathname, b.url, b.size, thumbById.get(m[3]));
    if (it) items.push(it);
  }
  return items;
}

async function rebuildIndex() {
  const items = await scanBlob();
  const cmds = [["DEL", KEY]];
  if (items.length) cmds.push(["HSET", KEY, ...items.flatMap((it) => [it.id, JSON.stringify(it)])]);
  cmds.push(["SET", READY, "1"]);
  await redis(cmds);
  return items;
}

async function readIndex() {
  const [ready, flat] = await redis([["GET", READY], ["HGETALL", KEY]]);
  if (!ready) return rebuildIndex();
  const items = [];
  for (let i = 1; i < (flat || []).length; i += 2) {
    try { items.push(JSON.parse(flat[i])); } catch {}
  }
  return items;
}

const newestFirst = (a, b) => (a.taken < b.taken ? 1 : a.taken > b.taken ? -1 : 0);

// 저장소 주소가 우리 저장소의 그 파일이 맞는지 확인
function blobUrlOk(url, pathname) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com") && u.pathname === "/" + pathname;
  } catch { return false; }
}

// GET: 찍은 날짜순(최신 먼저) 목록
export async function GET(request) {
  if (!canView(request.headers.get("x-view-password"))) {
    return json({ locked: true, error: "보기 비밀번호가 필요해요." }, 401);
  }
  try {
    const items = redisReady() ? await readIndex() : await scanBlob();
    items.sort(newestFirst);
    return json({ items, viewLock: !!process.env.VIEW_PASSWORD });
  } catch {
    return json({ error: "목록을 불러오지 못했어요." }, 500);
  }
}

// POST: { pw } 비밀번호 확인
//       { pw, action:"add", media:{pathname,url,size}, thumb:{pathname,url}|null } 올린 파일을 목록에 추가
//       { pw, action:"rebuild" } 저장소를 다시 훑어 목록 새로 만들기
export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  if (!adminConfigured()) return json({ ok: false, error: "관리자 비밀번호가 아직 설정되지 않았어요." }, 503);
  if (!isAdmin(body.pw)) return json({ ok: false, error: "비밀번호가 맞지 않아요." }, 401);
  if (!body.action) return json({ ok: true });
  if (!redisReady()) return json({ ok: true, skipped: true });

  try {
    if (body.action === "rebuild") {
      const items = await rebuildIndex();
      return json({ ok: true, count: items.length });
    }
    if (body.action === "add") {
      const m = body.media || {}, t = body.thumb || null;
      if (!MEDIA_RE.test(m.pathname || "") || !blobUrlOk(m.url, m.pathname)) return json({ error: "잘못된 요청이에요." }, 400);
      let thumb = null;
      if (t && THUMB_RE.test(t.pathname || "") && blobUrlOk(t.url, t.pathname)) thumb = t.url;
      const it = itemFrom(m.pathname, m.url, m.size, thumb);
      if (thumb && !t.pathname.includes(`_${it.id}.`)) it.thumb = null;
      await redis([["HSET", KEY, it.id, JSON.stringify(it)]]);
      return json({ ok: true, item: it });
    }
    return json({ error: "잘못된 요청이에요." }, 400);
  } catch {
    return json({ error: "목록에 넣지 못했어요." }, 500);
  }
}

// DELETE: { pw, id } 해당 사진/동영상과 미리보기 함께 지우기
export async function DELETE(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  if (!isAdmin(body.pw)) return json({ error: "비밀번호가 맞지 않아요." }, 401);
  if (!/^[a-z0-9]{12}$/.test(body.id || "")) return json({ error: "잘못된 요청이에요." }, 400);
  try {
    let urls = [];
    if (redisReady()) {
      const [raw] = await redis([["HGET", KEY, body.id]]);
      if (raw) { const it = JSON.parse(raw); urls = [it.url, it.thumb].filter(Boolean); }
    }
    if (!urls.length) {
      const [media, thumbs] = await Promise.all([listAll("media/"), listAll("thumbs/")]);
      urls = [...media, ...thumbs].filter((b) => b.pathname.includes(`_${body.id}`)).map((b) => b.url);
    }
    if (urls.length) await del(urls);
    if (redisReady()) await redis([["HDEL", KEY, body.id]]);
    if (!urls.length) return json({ error: "이미 지워졌어요." }, 404);
    return json({ ok: true, deleted: urls.length });
  } catch {
    return json({ error: "지우지 못했어요." }, 500);
  }
}
