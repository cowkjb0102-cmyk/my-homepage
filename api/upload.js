// 미디어 라이브러리: 휴대폰/컴퓨터에서 Vercel Blob 저장소로 바로 올리기 위한 '업로드 허가증' 발급
// 관리자 비밀번호가 맞을 때만, 정해진 이름 형식의 사진/동영상만 허가해요.
import { handleUpload } from "@vercel/blob/client";
import { isAdmin, adminConfigured, json } from "./_auth.js";
import { tooManyFails, noteFail, LOCKED_MSG } from "./_guard.js";
import { MEDIA_RE, THUMB_RE } from "./_paths.js";

const MAX_MEDIA = 500 * 1024 * 1024; // 파일 하나 최대 500MB
const MAX_THUMB = 2 * 1024 * 1024;

export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "잘못된 요청이에요." }, 400); }
  // 업로드 허가 요청(비밀번호 확인이 들어가는 단계)만 잠금 대상이에요
  if (body && body.type === "blob.generate-client-token" && await tooManyFails(request)) {
    return json({ error: LOCKED_MSG }, 429);
  }
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        if (!adminConfigured()) throw new Error("NO_ADMIN");
        let pw = null;
        try { pw = JSON.parse(clientPayload || "{}").pw; } catch {}
        if (!isAdmin(pw)) throw new Error("BAD_PASSWORD");
        if (THUMB_RE.test(pathname)) {
          return { allowedContentTypes: ["image/jpeg"], maximumSizeInBytes: MAX_THUMB, addRandomSuffix: false };
        }
        if (MEDIA_RE.test(pathname)) {
          return { allowedContentTypes: ["image/*", "video/*", "audio/*"], maximumSizeInBytes: MAX_MEDIA, addRandomSuffix: false };
        }
        throw new Error("BAD_PATH");
      },
    });
    return json(result);
  } catch (e) {
    const code = String(e && e.message);
    if (code === "BAD_PASSWORD") { await noteFail(request); return json({ error: "비밀번호가 맞지 않아요." }, 401); }
    if (code === "NO_ADMIN") return json({ error: "관리자 비밀번호가 아직 설정되지 않았어요." }, 503);
    if (code === "BAD_PATH") return json({ error: "올릴 수 없는 파일 이름이에요." }, 400);
    return json({ error: "올리기 준비 중 문제가 생겼어요." }, 500);
  }
}
