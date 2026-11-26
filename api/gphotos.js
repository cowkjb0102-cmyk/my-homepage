// 구글 포토에서 고른 사진/동영상 1개를 미디어 라이브러리 저장소로 옮기기
// 브라우저가 구글 포토 피커로 고른 항목 정보 + 구글 로그인 토큰을 보내면,
// 서버가 구글에서 원본과 미리보기를 받아 Vercel Blob에 저장해요. (관리자 비밀번호 필요)
import { put } from "@vercel/blob";
import { isAdmin, json } from "./_auth.js";

const MAX = 500 * 1024 * 1024;

function stampKST(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`;
}

function rid() {
  const a = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(a, (x) => "abcdefghijklmnopqrstuvwxyz0123456789"[x % 36]).join("");
}

function extOf(filename, mime, isVideo) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(filename || "");
  if (m && !isVideo) return m[1].toLowerCase();
  if (isVideo) return "mp4"; // 구글이 내려주는 동영상(=dv)은 mp4로 변환돼요
  const t = (String(mime).split("/")[1] || "").replace("jpeg", "jpg");
  return /^[a-z0-9]{1,5}$/.test(t) ? t : "jpg";
}

function googleUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === "https:" && (x.hostname.endsWith(".googleusercontent.com") || x.hostname === "googleusercontent.com");
  } catch { return false; }
}

export async function POST(request) {
  let b = {};
  try { b = await request.json(); } catch {}
  if (!isAdmin(b.pw)) return json({ error: "비밀번호가 맞지 않아요." }, 401);
  const { token, item } = b;
  const f = item && item.mediaFile;
  if (!token || !f || !googleUrl(f.baseUrl)) return json({ error: "잘못된 요청이에요." }, 400);

  const isVideo = item.type === "VIDEO";
  if (isVideo) {
    const st = f.mediaFileMetadata && f.mediaFileMetadata.videoMetadata && f.mediaFileMetadata.videoMetadata.processingStatus;
    if (st && st !== "READY") return json({ error: "구글 포토에서 아직 동영상을 처리 중이에요. 잠시 뒤 다시 해 주세요." }, 409);
  }
  const stamp = stampKST(item.createTime) || stampKST(new Date().toISOString());
  const id = rid();
  const auth = { authorization: `Bearer ${token}` };

  try {
    const r = await fetch(f.baseUrl + (isVideo ? "=dv" : "=d"), { headers: auth });
    if (r.status === 401 || r.status === 403) return json({ error: "구글 로그인이 만료됐어요. 다시 가져오기를 눌러 주세요." }, 401);
    if (!r.ok || !r.body) return json({ error: "구글 포토에서 파일을 받지 못했어요." }, 502);
    const len = Number(r.headers.get("content-length") || 0);
    if (len > MAX) return json({ error: "500MB보다 커서 가져올 수 없어요." }, 413);
    const type = r.headers.get("content-type") || f.mimeType || (isVideo ? "video/mp4" : "image/jpeg");
    const path = `media/${stamp}_${id}_${isVideo ? "v" : "p"}.${extOf(f.filename, f.mimeType, isVideo)}`;
    await put(path, r.body, { access: "public", contentType: type, addRandomSuffix: false, multipart: isVideo || len > 20 * 1024 * 1024 });

    // 미리보기 (구글이 크기를 줄여서 줘요)
    try {
      const t = await fetch(f.baseUrl + (isVideo ? "=w480-h480-no" : "=w480-h480"), { headers: auth });
      if (t.ok) await put(`thumbs/${stamp}_${id}.jpg`, Buffer.from(await t.arrayBuffer()), { access: "public", contentType: "image/jpeg", addRandomSuffix: false });
    } catch {}
    return json({ ok: true, id });
  } catch {
    return json({ error: "가져오는 중 문제가 생겼어요." }, 500);
  }
}
