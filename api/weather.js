// 오늘의 날씨: Open-Meteo(무료, 인증키 없음)에서 세 지역 날씨를 한 번에 가져와요.
// 15분 동안은 Vercel이 저장해 둔 결과를 보여줘서, 방문자가 많아도 요청은 15분에 한 번뿐이에요.

const PLACES = [
  { name: "광주 동구", lat: 35.1462, lon: 126.9229 },
  { name: "당진 합덕읍", lat: 36.7978, lon: 126.7692 },
  { name: "예산 응봉면", lat: 36.6471, lon: 126.7767 },
];

// WMO 날씨 코드 → 한국어 설명과 아이콘
function describe(code, day) {
  if (code === 0) return day ? ["맑음", "☀️"] : ["맑음", "🌙"];
  if (code === 1) return day ? ["대체로 맑음", "🌤️"] : ["대체로 맑음", "🌙"];
  if (code === 2) return ["구름 조금", "⛅"];
  if (code === 3) return ["흐림", "☁️"];
  if (code === 45 || code === 48) return ["안개", "🌫️"];
  if (code >= 51 && code <= 57) return ["이슬비", "🌦️"];
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return ["비", "🌧️"];
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return ["눈", "🌨️"];
  if (code >= 95) return ["뇌우", "⛈️"];
  return ["", "🌡️"];
}

export async function GET() {
  const url = "https://api.open-meteo.com/v1/forecast"
    + "?latitude=" + PLACES.map((p) => p.lat).join(",")
    + "&longitude=" + PLACES.map((p) => p.lon).join(",")
    + "&current=temperature_2m,weather_code,is_day"
    + "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max"
    + "&timezone=Asia%2FSeoul&forecast_days=1";
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error("open-meteo " + r.status);
    let data = await r.json();
    if (!Array.isArray(data)) data = [data];
    const items = PLACES.map((p, k) => {
      const d = data[k], c = d.current, day = d.daily;
      const [text, icon] = describe(c.weather_code, c.is_day === 1);
      return {
        name: p.name,
        temp: Math.round(c.temperature_2m),
        max: Math.round(day.temperature_2m_max[0]),
        min: Math.round(day.temperature_2m_min[0]),
        rain: day.precipitation_probability_max[0] ?? null,
        text, icon,
      };
    });
    return new Response(JSON.stringify({ items, updated: data[0].current.time }), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  } catch {
    return new Response(JSON.stringify({ items: [] }), {
      status: 502,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
