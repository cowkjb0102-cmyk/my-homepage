// 오늘의 속보: 연합뉴스 최신기사 RSS에서 제목을 가져와요.
// 연합뉴스가 응답하지 않으면 구글 뉴스의 "연합뉴스 속보" 검색으로 대신 가져와요.
// 10분 동안은 Vercel이 저장해 둔 결과를 보여줘서 연합뉴스에 요청이 몰리지 않아요.

const YNA = "https://www.yna.co.kr/rss/news.xml";
const GOOGLE = "https://news.google.com/rss/search?q=" + encodeURIComponent("연합뉴스 속보 when:1d") + "&hl=ko&gl=KR&ceid=KR:ko";

const decode = (s = "") =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : "";
};

async function load(url, source) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (homepage news ticker)" }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(source + " " + r.status);
  const xml = await r.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
    let title = tag(it, "title");
    const src = tag(it, "source") || "연합뉴스";
    if (title.endsWith(" - " + src)) title = title.slice(0, -(src.length + 3));
    const link = tag(it, "link");
    const time = Date.parse(tag(it, "pubDate")) || 0;
    return { title, link, source: src, time, breaking: /^\[속보\]/.test(title) };
  }).filter((x) => x.title && /^https?:\/\//.test(x.link));
}

export async function GET() {
  let items = [];
  try { items = await load(YNA, "yna"); } catch {}
  if (!items.length) { try { items = await load(GOOGLE, "google"); } catch {} }

  if (!items.length) {
    return new Response(JSON.stringify({ items: [] }), {
      status: 502,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  // 최근 12시간 안의 [속보]를 앞에, 나머지는 최신순으로 해서 10개
  const recent = Date.now() - 12 * 3600e3;
  const top = items.filter((x) => x.breaking && x.time > recent);
  const rest = items.filter((x) => !top.includes(x)).sort((a, b) => b.time - a.time);
  const list = [...top, ...rest].slice(0, 10);

  return new Response(JSON.stringify({ items: list }), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=600, stale-while-revalidate=1200",
    },
  });
}
