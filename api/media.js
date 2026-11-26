// 미디어 라이브러리 목록 보기 / 비밀번호 확인 / 지우기
import { list, del } from "@vercel/blob";
import { isAdmin, adminConfigured, canView, json } from "./_auth.js";
import { MEDIA_RE, THUMB_RE } from "./_paths.js";

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

// GET: 날짜순(최신 먼저) 목록
export async function GET(request) {
  if (!canView(request.headers.get("x-view-password"))) {
    return json({ locked: true, error: "보기 비밀번호가 필요해요." }, 401);
  }
  try {
    const [media, thumbs] = await Promise.all([listAll("media/"), listAll("thumbs/")]);
    const thumbById = new Map();
    for (const b of thumbs) {
      const m = THUMB_RE.exec(b.pathname);
      if (m) thumbById.set(m[3], b.url);
    }
    const items = [];
    for (const b of media) {
      const m = MEDIA_RE.exec(b.pathname);
      if (!m) continue;
      const [, d, t, id, kind] = m;
      items.push({
        id,
        taken: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4)}`,
        type: kind[0] === "v" ? "video" : "photo",
        duration: kind.length > 1 ? Number(kind.slice(1)) : null,
        url: b.url,
        thumb: thumbById.get(id) || null,
        size: b.size,
      });
    }
    items.sort((a, b) => (a.taken < b.taken ? 1 : a.taken > b.taken ? -1 : 0));
    const res = json({ items, viewLock: !!process.env.VIEW_PASSWORD, googleClientId: process.env.GOOGLE_CLIENT_ID || null });
    // 보기 잠금이 없으면 목록을 2분 동안 CDN에 저장해 두어, 저장소 '목록 읽기' 횟수(무료 한도)를 아껴요.
    // 올리기/지우기 직후에는 화면이 ?fresh= 를 붙여 새로 받아요.
    if (!process.env.VIEW_PASSWORD) res.headers.set("cache-control", "public, max-age=0, s-maxage=120, stale-while-revalidate=60");
    return res;
  } catch {
    return json({ error: "목록을 불러오지 못했어요." }, 500);
  }
}

// POST: 관리자 비밀번호 확인 { pw }
export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  if (!adminConfigured()) return json({ ok: false, error: "관리자 비밀번호가 아직 설정되지 않았어요." }, 503);
  if (!isAdmin(body.pw)) return json({ ok: false, error: "비밀번호가 맞지 않아요." }, 401);
  return json({ ok: true });
}

// DELETE: { pw, id } 해당 사진/동영상과 미리보기 함께 지우기
export async function DELETE(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  if (!isAdmin(body.pw)) return json({ error: "비밀번호가 맞지 않아요." }, 401);
  if (!/^[a-z0-9]{12}$/.test(body.id || "")) return json({ error: "잘못된 요청이에요." }, 400);
  try {
    const [media, thumbs] = await Promise.all([listAll("media/"), listAll("thumbs/")]);
    const urls = [...media, ...thumbs].filter((b) => b.pathname.includes(`_${body.id}`)).map((b) => b.url);
    if (!urls.length) return json({ error: "이미 지워졌어요." }, 404);
    await del(urls);
    return json({ ok: true, deleted: urls.length });
  } catch {
    return json({ error: "지우지 못했어요." }, 500);
  }
}
