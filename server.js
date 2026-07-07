import http from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = process.env.PORT || 3000;
const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "public");
const TIME_ZONE = "Europe/Amsterdam";

const GAMES = {
  wuwa: {
    id: "wuwa",
    name: "Wuthering Waves",
    aliases: ["Wuthering Waves", "WuWa"],
    trustedSources: [
      "https://wutheringwaves.kurogames.com/en/main/news",
      "https://wutheringwaves.kurogames.com/en/main/news/official",
      "https://www.facebook.com/WutheringWaves.Official",
      "https://x.com/Wuthering_Waves"
    ],
    searchQueries: [
      "Wuthering Waves next version maintenance release time UTC+8",
      "Wuthering Waves version update maintenance UTC+8 official"
    ],
    defaultReleaseHourAmsterdam: 5
  },
  nte: {
    id: "nte",
    name: "Neverness to Everness",
    aliases: ["Neverness to Everness", "NTE"],
    trustedSources: [
      "https://nte.perfectworld.com/en/news",
      "https://www.playnte.com/en/news",
      "https://x.com/NTE_GL"
    ],
    searchQueries: [
      "Neverness to Everness next version maintenance release time UTC+8 official",
      "NTE version update maintenance UTC+8 official"
    ],
    defaultReleaseHourAmsterdam: 5
  },
  hsr: {
    id: "hsr",
    name: "Honkai: Star Rail",
    aliases: ["Honkai Star Rail", "Honkai: Star Rail", "HSR"],
    trustedSources: [
      "https://hsr.hoyoverse.com/en-us/news",
      "https://www.hoyolab.com/circles/6/39/feed?page_type=39&page_sort=events",
      "https://x.com/honkaistarrail"
    ],
    searchQueries: [
      "Honkai Star Rail next version release date maintenance UTC+8 official",
      "Honkai Star Rail version update maintenance 11:00 UTC+8"
    ],
    defaultReleaseHourAmsterdam: 5
  },
  endfield: {
    id: "endfield",
    name: "Arknights: Endfield",
    aliases: ["Arknights Endfield", "Arknights: Endfield", "Endfield"],
    trustedSources: [
      "https://endfield.hypergryph.com/en/news",
      "https://www.gryphline.com/en-us/endfield",
      "https://x.com/AKEndfield"
    ],
    searchQueries: [
      "Arknights Endfield next version release date maintenance official",
      "Arknights Endfield version update release date official"
    ],
    defaultReleaseHourAmsterdam: 5
  },
  mongil: {
    id: "mongil",
    name: "Mongil: Star Dive",
    aliases: ["Mongil Star Dive", "Mongil: Star Dive", "MONGIL: STAR DIVE", "MSD"],
    trustedSources: [
      "https://forum.netmarble.com/stardive_gl/list/2/1",
      "https://forum.netmarble.com/stardive_gl/view/2/260",
      "https://stardive.netmarble.com/news",
      "https://mcompany.netmarble.com/en/news",
      "https://x.com/Stardive_EN"
    ],
    searchQueries: [
      "Mongil Star Dive next version release date maintenance official",
      "MONGIL STAR DIVE version update roadmap schedule official",
      "Mongil Star Dive 1.2.0 release date"
    ],
    defaultReleaseHourAmsterdam: 5
  }
};

function json(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(data, null, 2));
}

function contentType(filePath) {
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  }[extname(filePath)] || "application/octet-stream";
}

async function fetchText(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; GachaCountdown/1.0; +local)",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractDuckDuckGoLinks(html) {
  const links = [];
  const regex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
  let match;
  while ((match = regex.exec(html))) {
    let url = match[1].replace(/&amp;/g, "&");
    try {
      const parsed = new URL(url, "https://duckduckgo.com");
      const uddg = parsed.searchParams.get("uddg");
      if (uddg) url = decodeURIComponent(uddg);
    } catch {}
    if (/^https?:\/\//.test(url) && !links.includes(url)) links.push(url);
  }
  return links.slice(0, 5);
}

async function searchWeb(query) {
  const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchText(searchUrl, 12000);
  return extractDuckDuckGoLinks(html);
}

function findVersions(text) {
  const versions = [];
  const patterns = [
    /(?:version|ver\.?|v)\s*([0-9]+\.[0-9]+(?:\.[0-9]+)?)/gi,
    /(?:update|patch)\s*([0-9]+\.[0-9]+(?:\.[0-9]+)?)/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) versions.push(match[1]);
  }
  return [...new Set(versions)];
}

function parseDateCandidates(text) {
  const candidates = [];
  const monthNames = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec";
  const patterns = [
    { re: /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g, type: "ymd" },
    { re: new RegExp(`\\b(${monthNames})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?[,]?\\s+(20\\d{2})`, "gi"), type: "mdy" },
    { re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\.?[,]?\\s+(20\\d{2})`, "gi"), type: "dmy" }
  ];
  for (const pattern of patterns) {
    let m;
    while ((m = pattern.re.exec(text))) {
      let year, month, day;
      if (pattern.type === "ymd") {
        year = Number(m[1]); month = Number(m[2]); day = Number(m[3]);
      } else if (pattern.type === "mdy") {
        year = Number(m[3]); month = monthToNumber(m[1]); day = Number(m[2]);
      } else {
        year = Number(m[3]); month = monthToNumber(m[2]); day = Number(m[1]);
      }
      if (year && month && day && month <= 12 && day <= 31) {
        candidates.push({ year, month, day, raw: m[0], index: m.index });
      }
    }
  }
  return candidates;
}

function monthToNumber(value) {
  const months = { january:1, jan:1, february:2, feb:2, march:3, mar:3, april:4, apr:4, may:5, june:6, jun:6, july:7, jul:7, august:8, aug:8, september:9, sept:9, sep:9, october:10, oct:10, november:11, nov:11, december:12, dec:12 };
  return months[String(value).toLowerCase().replace(/\.$/, "")];
}

function findMaintenanceEndAmsterdam(text, fallbackHourAmsterdam) {
  // Common Asian game notice format: 06:00–11:00 UTC+8 or 04:00 to 11:00 (UTC+8). Amsterdam summer time is UTC+2, winter is UTC+1.
  const re = /(\d{1,2}):?(\d{2})?\s*(?:-|–|—|~|to)\s*(\d{1,2}):?(\d{2})?\s*(?:\(?UTC\+8\)?|\(?GMT\+8\)?)/i;
  const m = text.match(re);
  if (!m) return { hourAmsterdam: fallbackHourAmsterdam, minuteAmsterdam: 0, reason: "No maintenance end time found; used default Amsterdam hour." };
  const utc8Hour = Number(m[3]);
  const utc8Minute = Number(m[4] || 0);
  // Most release notices are near current/future summer patch cycles, but frontend stores actual Amsterdam wall time.
  const amsterdamHourApprox = (utc8Hour - 6 + 24) % 24;
  return { hourAmsterdam: amsterdamHourApprox, minuteAmsterdam: utc8Minute, reason: `Parsed maintenance end ${utc8Hour}:${String(utc8Minute).padStart(2, "0")} UTC+8 and converted to Amsterdam summer time.` };
}

function amsterdamIso(year, month, day, hour, minute) {
  // Local countdown app is Amsterdam-focused. It stores wall clock with the offset for summer/winter using Intl approximation.
  const probe = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const offset = amsterdamOffset(probe);
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}T${String(hour).padStart(2,"0")}:${String(minute).padStart(2,"0")}:00${offset}`;
}

function amsterdamOffset(date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, timeZoneName: "shortOffset" }).formatToParts(date);
  const name = parts.find(p => p.type === "timeZoneName")?.value || "GMT+2";
  const match = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return "+02:00";
  const sign = match[1];
  const hours = String(Number(match[2])).padStart(2, "0");
  const minutes = match[3] || "00";
  return `${sign}${hours}:${minutes}`;
}

function scoreCandidate({ game, url, text, version, date }) {
  const lower = text.toLowerCase();
  let score = 0;
  for (const alias of game.aliases) if (lower.includes(alias.toLowerCase())) score += 10;
  if (/maintenance|update|version|patch|release/i.test(text)) score += 10;
  if (version) score += 10;
  if (date) score += 8;
  if (/official|notice|announcement|maintenance/i.test(url)) score += 5;
  if (/facebook|x\.com|twitter|hoyoverse|kurogames|playnte|perfectworld|hypergryph|gryphline|netmarble|stardive/i.test(url)) score += 6;
  return score;
}

function buildProposal(game, url, html) {
  const text = stripHtml(html).slice(0, 250000);
  const versions = findVersions(text);
  const dates = parseDateCandidates(text);
  if (!versions.length && !dates.length) return null;

  // Use the highest-looking version mentioned near release/maintenance text.
  const version = versions.sort(compareVersions).at(-1);

  // Choose a future-looking or latest date from the page. Runtime date is used when user checks.
  const now = new Date();
  const dated = dates
    .map(d => ({ ...d, dateObj: new Date(Date.UTC(d.year, d.month - 1, d.day, 12, 0, 0)) }))
    .filter(d => d.dateObj.getFullYear() >= now.getUTCFullYear() - 1)
    .sort((a, b) => b.dateObj - a.dateObj);
  const chosenDate = dated[0];
  if (!chosenDate) return null;

  const nearby = text.slice(Math.max(0, chosenDate.index - 700), chosenDate.index + 1200);
  const time = findMaintenanceEndAmsterdam(nearby + " " + text.slice(0, 5000), game.defaultReleaseHourAmsterdam);
  const releaseISO = amsterdamIso(chosenDate.year, chosenDate.month, chosenDate.day, time.hourAmsterdam, time.minuteAmsterdam);

  const title = extractTitle(html) || `${game.name} update`;
  const confidence = scoreCandidate({ game, url, text: nearby + " " + title, version, date: chosenDate });
  return {
    gameId: game.id,
    gameName: game.name,
    version: version || "Unknown",
    releaseISO,
    sourceUrl: url,
    sourceTitle: title,
    confidence,
    status: confidence >= 35 ? "Likely official" : confidence >= 22 ? "Needs review" : "Low confidence",
    notes: `${time.reason} Found date: ${chosenDate.raw}.`,
    checkedAt: new Date().toISOString()
  };
}

function compareVersions(a, b) {
  const aa = a.split(".").map(Number), bb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(aa.length, bb.length); i++) {
    const diff = (aa[i] || 0) - (bb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripHtml(m[1]).slice(0, 160) : "";
}

async function checkGame(gameId) {
  const game = GAMES[gameId];
  if (!game) throw new Error("Unknown game id");

  const urls = new Set(game.trustedSources);
  const searchErrors = [];
  for (const query of game.searchQueries) {
    try {
      const found = await searchWeb(query);
      found.forEach(url => urls.add(url));
    } catch (err) {
      searchErrors.push(`${query}: ${err.message}`);
    }
  }

  const proposals = [];
  const errors = [];
  for (const url of [...urls].slice(0, 14)) {
    try {
      const html = await fetchText(url, 12000);
      const proposal = buildProposal(game, url, html);
      if (proposal) proposals.push(proposal);
    } catch (err) {
      errors.push(`${url}: ${err.message}`);
    }
  }

  proposals.sort((a, b) => b.confidence - a.confidence || new Date(b.checkedAt) - new Date(a.checkedAt));
  return {
    gameId,
    gameName: game.name,
    best: proposals[0] || null,
    proposals: proposals.slice(0, 5),
    searchedSources: [...urls].slice(0, 14),
    errors: [...searchErrors, ...errors].slice(0, 8),
    warning: "Please review before confirming. Game publishers often announce dates in images, social posts, or region-specific pages that automated parsing may miss."
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/check/")) {
      const gameId = decodeURIComponent(url.pathname.split("/").pop());
      return json(res, 200, await checkGame(gameId));
    }
    if (url.pathname === "/api/games") return json(res, 200, Object.values(GAMES));

    const requested = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const filePath = resolve(join(PUBLIC_DIR, requested));
    if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: "Forbidden" });
    const file = await readFile(filePath);
    res.writeHead(200, { "content-type": contentType(filePath) });
    res.end(file);
  } catch (err) {
    if (err.code === "ENOENT") return json(res, 404, { error: "Not found" });
    json(res, 500, { error: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Gacha countdown app running at http://localhost:${PORT}`);
});
