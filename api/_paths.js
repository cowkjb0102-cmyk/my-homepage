// 저장 파일 이름 규칙
//   원본:   media/20261025-130558_<12자리 id>_p.jpg   (p = 사진)
//           media/20261025-130558_<12자리 id>_v24.mp4 (v = 동영상, 숫자는 길이(초))
//           media/20261025-130558_<12자리 id>_a215.mp3 (a = 음악, 숫자는 길이(초))
//           media/20261025-130558_<12자리 id>_f.zip   (f = 기타: 압축 파일)
//   미리보기: thumbs/20261025-130558_<12자리 id>.jpg
// 앞의 날짜-시간은 '찍은 때'(음악·압축 파일은 파일 날짜)이고, 이걸로 날짜별 정리를 해요.
export const MEDIA_RE = /^media\/(\d{8})-(\d{6})_([a-z0-9]{12})_(p|v\d{0,6}|a\d{0,6}|f)\.([a-z0-9]{1,5})$/;
export const THUMB_RE = /^thumbs\/(\d{8})-(\d{6})_([a-z0-9]{12})\.jpg$/;

// 기타(압축 파일)로 받을 수 있는 확장자 → 저장할 때 쓰는 파일 종류
export const ARCHIVE_TYPES = {
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
  rar: "application/vnd.rar",
  alz: "application/octet-stream",
  egg: "application/octet-stream",
  tar: "application/x-tar",
  gz: "application/gzip",
  tgz: "application/gzip",
};
// 기타 파일이면 확장자가 위 목록에 있는지 확인
export function archiveOk(pathname) {
  const m = MEDIA_RE.exec(pathname);
  return !!m && m[4] === "f" && Object.hasOwn(ARCHIVE_TYPES, m[5]);
}
