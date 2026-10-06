const DEFAULT_HEADERS = {
  Accept: "text/html",
  "User-Agent": "ForeverRoutePlanner/0.2 (+https://github.com/anboas/wow-forever-route-planner)",
};

export async function fetchText(url, headers = {}) {
  const response = await fetch(url, { headers: { ...DEFAULT_HEADERS, ...headers } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return response.text();
}

export function flightPayload(html) {
  const chunks = [];
  const pattern = /<script>self\.__next_f\.push\((\[1,"(?:\\.|[^"\\])*"\])\)<\/script>/g;
  for (const match of html.matchAll(pattern)) chunks.push(JSON.parse(match[1])[1]);
  if (!chunks.length) throw new Error("No React Flight payload found");
  return chunks.join("");
}

export function extractBalancedJson(source, start) {
  const open = source[start];
  const close = open === "[" ? "]" : "}";
  if (!close) throw new Error(`Expected JSON object or array at ${start}`);
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === open) depth += 1;
    else if (character === close) {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`Unbalanced JSON beginning at ${start}`);
}

export function extractValue(payload, key, { required = true } = {}) {
  const marker = `"${key}":`;
  const markerIndex = payload.indexOf(marker);
  if (markerIndex < 0) {
    if (!required) return undefined;
    throw new Error(`Missing ${key} value`);
  }
  let start = markerIndex + marker.length;
  while (/\s/.test(payload[start])) start += 1;
  if (payload[start] === "[" || payload[start] === "{") return JSON.parse(extractBalancedJson(payload, start));
  throw new Error(`Unsupported ${key} value at ${start}`);
}

export function extractArray(payload, key, options) {
  const value = extractValue(payload, key, options);
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error(`${key} is not an array`);
  return value;
}

export function englishSitemapEntries(xml) {
  const entries = [];
  const blockPattern = /<url>([\s\S]*?)<\/url>/g;
  for (const match of xml.matchAll(blockPattern)) {
    const block = match[1];
    const url = block.match(/<loc>(https:\/\/wowf\.io\/en(?:\/[^<]*)?)<\/loc>/)?.[1];
    if (!url) continue;
    const lastmod = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] || null;
    const route = new URL(url).pathname.replace(/^\/en\/?/, "");
    const [category = "home", ...segments] = route.split("/").filter(Boolean);
    entries.push({ url, route, category, slug: segments.join("/") || category, lastmod });
  }
  return entries;
}
