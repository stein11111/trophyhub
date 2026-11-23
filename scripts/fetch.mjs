// Holt Trophäen + Spielzeit vom PlayStation Network und schreibt docs/data.json
// Läuft in GitHub Actions. Braucht das Secret PSN_NPSSO.
import fs from "node:fs";
import {
  exchangeNpssoForAccessCode,
  exchangeAccessCodeForAuthTokens,
  getUserTitles,
  getTitleTrophies,
  getUserTrophiesEarnedForTitle,
  getUserTrophyProfileSummary,
  getUserPlayedGames,
  getProfileFromAccountId,
} from "psn-api";

const NPSSO = process.env.PSN_NPSSO;
if (!NPSSO) {
  console.error("PSN_NPSSO fehlt – bitte als GitHub-Secret anlegen.");
  process.exit(1);
}

const OUT = "docs/data.json";
const HIST = "docs/history.json";
const GTA_MATCH = /grand theft auto\s*(vi|6)\b|gta\s*(vi|6)\b/i;

const accessCode = await exchangeNpssoForAccessCode(NPSSO);
const auth = await exchangeAccessCodeForAuthTokens(accessCode);

// Profil
let profile = {};
try {
  const summary = await getUserTrophyProfileSummary(auth, "me");
  let onlineId = null, avatar = null;
  try {
    const p = await getProfileFromAccountId(auth, summary.accountId);
    onlineId = p.onlineId;
    avatar = p.avatars?.sort((a, b) => parseInt(b.size) - parseInt(a.size))[0]?.url ?? null;
  } catch {}
  profile = {
    onlineId,
    avatar,
    level: summary.trophyLevel,
    levelProgress: summary.progress,
    tier: summary.tier,
    earned: summary.earnedTrophies,
  };
} catch (e) {
  console.warn("Profil konnte nicht geladen werden:", e.message);
}

// Spielzeit
let played = [];
try {
  const pg = await getUserPlayedGames(auth, "me", { limit: 200 });
  played = pg.titles ?? [];
} catch (e) {
  console.warn("Spielzeit nicht verfügbar:", e.message);
}
const parseDuration = (d) => {
  if (!d) return 0;
  const m = d.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] || 0)) * 60 + (+(m[2] || 0)) + Math.round((+(m[3] || 0)) / 60);
};

// Alle Spiele mit Trophäen
const titles = [];
let offset = 0;
while (true) {
  const res = await getUserTitles(auth, "me", { limit: 800, offset });
  titles.push(...res.trophyTitles);
  if (!res.nextOffset) break;
  offset = res.nextOffset;
}

const games = titles.map((t) => {
  const pg = played.find((p) => p.name?.toLowerCase() === t.trophyTitleName.toLowerCase());
  return {
    id: t.npCommunicationId,
    service: t.npServiceName,
    name: t.trophyTitleName,
    icon: t.trophyTitleIconUrl,
    platform: t.trophyTitlePlatform,
    progress: t.progress,
    earned: t.earnedTrophies,
    defined: t.definedTrophies,
    lastPlayed: t.lastUpdatedDateTime,
    minutes: parseDuration(pg?.playDuration),
  };
});

// GTA 6 im Detail
const gtaTitle = titles.find((t) => GTA_MATCH.test(t.trophyTitleName));
let gta = null;
if (gtaTitle) {
  const opts = { npServiceName: gtaTitle.npServiceName };
  const defs = await getTitleTrophies(auth, gtaTitle.npCommunicationId, "all", opts);
  const mine = await getUserTrophiesEarnedForTitle(auth, "me", gtaTitle.npCommunicationId, "all", opts);
  const byId = new Map(mine.trophies.map((t) => [t.trophyId, t]));
  const g = games.find((x) => x.id === gtaTitle.npCommunicationId);
  gta = {
    ...g,
    trophies: defs.trophies.map((d) => {
      const u = byId.get(d.trophyId) || {};
      return {
        id: d.trophyId,
        name: d.trophyName,
        detail: d.trophyDetail,
        type: d.trophyType,
        icon: d.trophyIconUrl,
        hidden: d.trophyHidden,
        earned: !!u.earned,
        earnedAt: u.earnedDateTime ?? null,
        rarity: u.trophyEarnedRate ? parseFloat(u.trophyEarnedRate) : null,
        progress: u.progress ?? null,
        target: d.trophyProgressTargetValue ?? null,
      };
    }),
  };
}

const now = new Date().toISOString();
fs.mkdirSync("docs", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ updated: now, profile, gta, games }, null, 1));

// Verlauf (ein Eintrag pro Tag)
let hist = [];
try { hist = JSON.parse(fs.readFileSync(HIST, "utf8")); } catch {}
const day = now.slice(0, 10);
const entry = {
  day,
  gta: gta ? gta.progress : null,
  gtaEarned: gta ? gta.trophies.filter((t) => t.earned).length : null,
  gtaMinutes: gta ? gta.minutes : null,
  level: profile.level ?? null,
};
hist = hist.filter((h) => h.day !== day);
hist.push(entry);
fs.writeFileSync(HIST, JSON.stringify(hist.slice(-365)));

console.log(`OK: ${games.length} Spiele, GTA 6 ${gta ? gta.progress + "%" : "nicht gefunden"}`);
