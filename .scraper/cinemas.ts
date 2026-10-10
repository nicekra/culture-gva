// Programmes des cinémas indépendants, lus sur leurs sites officiels (usage personnel, voir src/config.ts).
// Seuls des faits sont repris : titre, date, heure, salle, durée, version, liens. Ni textes, ni affiches.
import type { Event, Venue } from './types';

export type CinemaKey = 'grutli' | 'bio' | 'spoutnik' | 'cinelux' | 'scala' | 'city' | 'nordsud' | 'empire';
export type Screening = {
  cinema: CinemaKey;
  title: string;
  start: string; // ISO
  durationMin?: number;
  hall?: string;
  version?: string;
  url?: string; // page du film ou du programme
  ticketUrl?: string;
};

// Adresses publiées par les cinémas ; coordonnées approximatives pour la carte
export const CINEMA_VENUES: Record<CinemaKey, Venue & { site: string }> = {
  grutli: { id: 'cine-grutli', name: 'Cinémas du Grütli', area: 'Genève', commune: 'Genève', address: 'Rue du Général-Dufour 16, 1204 Genève', lat: 46.2003, lon: 6.1429, site: 'https://www.cinemas-du-grutli.ch/programme' },
  bio: { id: 'cine-bio', name: 'Cinéma Bio', area: 'Carouge', commune: 'Carouge', address: 'Rue Saint-Joseph 47, 1227 Carouge', lat: 46.1846, lon: 6.1393, site: 'https://www.cinema-bio.ch/programme' },
  spoutnik: { id: 'cine-spoutnik', name: 'Cinéma Spoutnik', area: 'Genève', commune: 'Genève', address: "L'Usine, Place des Volontaires 4, 1204 Genève", lat: 46.2037, lon: 6.1376, site: 'https://spoutnik.info/' },
  cinelux: { id: 'cine-cinelux', name: 'Cinélux', area: 'Genève', commune: 'Genève', address: 'Boulevard de Saint-Georges 8, 1205 Genève', lat: 46.2006, lon: 6.1336, site: 'https://www.cinelux.ch/' },
  scala: { id: 'cine-scala', name: 'Les Scala', area: 'Genève', commune: 'Genève', address: 'Rue des Eaux-Vives 23, 1207 Genève', lat: 46.2031, lon: 6.1567, site: 'https://les-scala.ch/fr/a-l-affiche' },
  city: { id: 'cine-city', name: 'Le City (Les Scala)', area: 'Genève', commune: 'Genève', site: 'https://les-scala.ch/fr/a-l-affiche' },
  nordsud: { id: 'cine-nordsud', name: 'Le Nord-Sud (Les Scala)', area: 'Genève', commune: 'Genève', address: 'Rue de la Servette 78, 1202 Genève', lat: 46.2124, lon: 6.1338, site: 'https://les-scala.ch/fr/a-l-affiche' },
  empire: { id: 'cine-empire', name: 'Cinérama Empire', area: 'Genève', commune: 'Genève', address: 'Rue de Carouge 72, 1205 Genève', lat: 46.1922, lon: 6.142, site: 'https://www.cine17.ch/?cine=cem' },
};

// ---------- utilitaires ----------
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç' };
export const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
export const text = (h: string) => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
// Lien absolu (l'objet URL de React Native ne résout pas les chemins relatifs correctement)
const abs = (base: string, href: string) => {
  if (/^https?:/.test(href)) return href;
  const origin = base.match(/^https?:\/\/[^/]+/)?.[0] ?? base;
  return href.startsWith('/') ? origin + href : origin + '/' + href;
};
const pad = (n: number) => String(n).padStart(2, '0');
// Heure locale de Genève (l'appareil est supposé réglé sur Europe/Zurich)
const local = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo, d, h, mi).toISOString();

const MONTHS: [RegExp, number][] = [
  [/^janv/i, 0], [/^f[ée]v/i, 1], [/^mars/i, 2], [/^avr/i, 3], [/^mai/i, 4], [/^juin/i, 5],
  [/^juil/i, 6], [/^ao[uû]/i, 7], [/^sept/i, 8], [/^oct/i, 9], [/^nov/i, 10], [/^d[ée]c/i, 11],
];
const month = (s: string) => MONTHS.find(([r]) => r.test(s))?.[1] ?? -1;
// Année la plus plausible pour un jour/mois sans année (programme à venir)
function yearFor(mo: number, d: number) {
  const now = new Date();
  const y = now.getFullYear();
  const cand = new Date(y, mo, d);
  return cand.getTime() < now.getTime() - 60 * 864e5 ? y + 1 : y;
}
const minutes = (s?: string) => {
  if (!s) return undefined;
  const h = s.match(/(\d+)\s*h\s*(\d{1,2})?/i);
  if (h) return +h[1] * 60 + (h[2] ? +h[2] : 0);
  const m = s.match(/(\d+)\s*(?:min|['’′])/i);
  return m ? +m[1] : undefined;
};

// ---------- un lecteur par cinéma ----------
export function parseGrutli(html: string, base = 'https://www.cinemas-du-grutli.ch/'): Screening[] {
  const out: Screening[] = [];
  for (const block of html.split('<div class="views-rows-wrapper">').slice(1)) {
    const title = block.match(/<h3 class="font1">([\s\S]*?)<\/h3>/)?.[1];
    if (!title) continue;
    const href = block.match(/<div class="views-rows-title"><a href="([^"]+)"/)?.[1];
    const info = block.match(/<br>\s*([a-z.\- ]{2,12})\s*-\s*(\d+)'\s*<\/p>/i);
    for (const m of block.matchAll(/<a href="([^"]+)" title="Acheter un billet - Salle: ([^"]+)"[^>]*>\s*<span[^>]*content="([^"]+)"/g)) {
      out.push({ cinema: 'grutli', title: text(title), start: new Date(m[3]).toISOString(), durationMin: info ? +info[2] : undefined, version: info?.[1].trim(), hall: decode(m[2]), url: href ? abs(base, href) : undefined, ticketUrl: m[1] });
    }
  }
  return out;
}

export function parseBio(html: string, base = 'https://www.cinema-bio.ch/'): Screening[] {
  const out: Screening[] = [];
  const halls: Record<string, string> = {};
  for (const m of html.matchAll(/<span class="b-salle-(\d)">([^<]+)<\/span>/g)) halls[m[1]] = decode(m[2]);
  for (const group of html.split('<div class="view-grouping">').slice(1)) {
    const head = group.match(/<div class="label">\s*\S+\s+(\d{1,2})\s+([^\s<]+)/);
    if (!head) continue;
    const d = +head[1], mo = month(head[2]);
    if (mo < 0) continue;
    const y = yearFor(mo, d);
    for (const film of group.split('<div class="view-unformatted">').slice(1)) {
      const t = film.match(/<h3><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h3>/);
      if (!t) continue;
      const infos = [...film.matchAll(/<div class="b-info">([^<]+)<\/div>/g)].map((x) => x[1].trim());
      for (const s of film.matchAll(/<div class="b-seance b-salle-(\d)[^"]*"><a href="([^"]+)"[^>]*>(\d{1,2}):(\d{2})<\/a>/g)) {
        out.push({ cinema: 'bio', title: text(t[2]), start: local(y, mo, d, +s[3], +s[4]), durationMin: minutes(infos.find((x) => /'$/.test(x))), version: infos[0], hall: halls[s[1]], url: abs(base, t[1]), ticketUrl: s[2] });
      }
    }
  }
  return out;
}

const SCALA_SITES: [RegExp, CinemaKey][] = [[/nord/i, 'nordsud'], [/city/i, 'city'], [/scala/i, 'scala']];
export function parseScala(html: string, base = 'https://les-scala.ch/'): Screening[] {
  const out: Screening[] = [];
  for (const film of html.split('<div class="container_liste"').slice(1)) {
    const t = film.match(/<div class="film_titre">\s*<h2><a href="([^"]+)">([\s\S]*?)<\/a>/);
    if (!t) continue;
    const dur = minutes(film.match(/class="film_duree">([^<]+)/)?.[1]);
    for (const site of film.split('class="tab_liste_film_titre"').slice(1)) {
      const name = site.match(/class="liste_cinema_titre"[^>]*>([^<]+)</)?.[1] ?? '';
      const key = SCALA_SITES.find(([r]) => r.test(name))?.[1] ?? 'scala';
      for (const s of site.matchAll(/<div class="tab_liste_film_date">([\s\S]*?)<\/a><\/div>/g)) {
        const buy = s[1].match(/href="(https:\/\/scala-city\.ticketack\.com\/screening\/buy\/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})\d*)"/);
        if (!buy) continue;
        const version = s[1].match(/<span class="bullet_version">([^<]+)<\/span>/)?.[1];
        out.push({ cinema: key, title: text(t[2]), start: local(+buy[2], +buy[3] - 1, +buy[4], +buy[5], +buy[6]), durationMin: dur, version, url: abs(base, t[1]), ticketUrl: buy[1] });
      }
    }
  }
  return out;
}

export function parseSpoutnik(html: string): Screening[] {
  const out: Screening[] = [];
  for (const item of html.split('<details class="spoutnik-upcoming-program__item').slice(1)) {
    const when = item.match(/<time datetime="([^"]+)"/)?.[1];
    const title = item.match(/program__film-title">([\s\S]*?)<\/span>/)?.[1];
    if (!when || !title) continue;
    const meta = text(item.match(/program__film-meta">([\s\S]*?)<\/span>/)?.[1] ?? '');
    const link = item.match(/program__film-link" href="([^"]+)"/)?.[1];
    const parts = meta.split(/\s*[·•]\s*/);
    const version = parts.find((p) => /^V[OF]/i.test(p));
    out.push({ cinema: 'spoutnik', title: text(title), start: new Date(when).toISOString(), durationMin: minutes(parts.find((p) => /['’′]|min/.test(p))), version, url: link, ticketUrl: link });
  }
  return out;
}

const DAY = /^(lun|mar|mer|jeu|ven|sam|dim)\.?\s+(\d{1,2})$/i;
export function parseCineluxPost(title: string, html: string, link: string): Screening[] {
  // « Programmation du 30 septembre au 6 octobre 2026 » / « du 7 au 13 octobre 2026 »
  const h = decode(title).match(/du\s+(\d{1,2})(?:er)?\s*([a-zéûè]+)?\s*(\d{4})?\s+au\s+(\d{1,2})(?:er)?\s+([a-zéûè]+)\s+(\d{4})/i);
  if (!h) return [];
  const endMo = month(h[5]), endY = +h[6];
  const startMo = h[2] ? month(h[2]) : endMo;
  const startY = h[3] ? +h[3] : startMo > endMo ? endY - 1 : endY;
  const first = new Date(startY, startMo, +h[1]);
  const out: Screening[] = [];
  for (const block of html.split(/<h2[^>]*>/).slice(1)) {
    const name = text(block.slice(0, block.indexOf('</h2>')));
    if (!name) continue;
    const dur = minutes(block.match(/Dur[ée]e<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/)?.[1]?.replace(/<[^>]+>/g, ''));
    const lang = text(block.match(/Langue<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>/)?.[1] ?? '') || undefined;
    const rows = [...block.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => text(c[1])));
    const i = rows.findIndex((r) => r.length >= 7 && r.slice(0, 7).every((c) => DAY.test(c)));
    if (i < 0 || !rows[i + 1]) continue;
    rows[i].slice(0, 7).forEach((label, k) => {
      const dayNum = +(label.match(DAY)?.[2] ?? 0);
      // Retrouve la date exacte à partir du premier jour de la semaine de programmation
      let date: Date | null = null;
      for (let j = 0; j < 9; j++) {
        const c = new Date(first.getFullYear(), first.getMonth(), first.getDate() + j);
        if (c.getDate() === dayNum) { date = c; break; }
      }
      if (!date) return;
      for (const t of (rows[i + 1][k] ?? '').matchAll(/(\d{1,2})\s*h\s*(\d{2})?/gi)) {
        out.push({ cinema: 'cinelux', title: name, start: local(date.getFullYear(), date.getMonth(), date.getDate(), +t[1], t[2] ? +t[2] : 0), durationMin: dur, version: lang, url: link, ticketUrl: 'https://cinelux.ticketack.com/screening/all' });
      }
    });
  }
  return out;
}

export function parseCineluxFeed(xml: string): Screening[] {
  const posts = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((m) => ({
      title: m[1].match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '',
      link: m[1].match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? '',
      html: m[1].match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/)?.[1] ?? '',
    }))
    .filter((p) => /^Programmation du/i.test(decode(p.title)));
  return posts.slice(0, 2).flatMap((p) => parseCineluxPost(p.title, p.html, p.link));
}

export function parseEmpire(html: string): Screening[] {
  const out: Screening[] = [];
  for (const post of html.split('movie-post">').slice(1)) {
    const t = post.match(/<h2 class="post-title"><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!t || !/cine=cem/.test(t[1])) continue; // page commune avec le Ciné 17
    const ticket = post.match(/href="(https:\/\/www\.advance-ticket\.ch[^"]+)"/)?.[1]?.replace(/&amp;/g, '&');
    const sched = post.match(/<div class="schedule">([\s\S]*?)<\/div>/)?.[1] ?? '';
    for (const line of sched.split(/<br\s*\/?>/)) {
      const m = text(line).match(/^\S+\s+(\d{1,2})\s+([a-zéû]+)\.?\s+(\d{1,2}):(\d{2})\s*(.*)$/i);
      if (!m) continue;
      const d = +m[1], mo = month(m[2]);
      if (mo < 0) continue;
      // Titre sans les mentions techniques (« in 4K CinemaScope on the giant screen (…) »)
      const title = text(t[2]).replace(/\s+(in|en)\s+(\S+\s+)?(4K|2K|3D|70\s?mm)\b.*$/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim();
      out.push({ cinema: 'empire', title, start: local(yearFor(mo, d), mo, d, +m[3], +m[4]), url: decode(t[1]), ticketUrl: ticket });
    }
  }
  return out;
}

// ---------- téléchargement poli (un site après l'autre, délai entre deux pages d'un même site) ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'culture.gva (usage personnel)', Accept: 'text/html,application/xml' } });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.text();
}

export async function fetchCinemas(onProgress?: (done: string) => void): Promise<{ screenings: Screening[]; errors: string[] }> {
  const screenings: Screening[] = [];
  const errors: string[] = [];
  const run = async (name: string, fn: () => Promise<Screening[]>) => {
    try {
      screenings.push(...(await fn()));
    } catch (e) {
      errors.push(`${name} : ${e instanceof Error ? e.message : 'erreur'}`);
    }
    onProgress?.(name);
  };
  await run('Grütli', async () => parseGrutli(await get('https://www.cinemas-du-grutli.ch/programme')));
  await run('Bio', async () => parseBio(await get('https://www.cinema-bio.ch/programme')));
  await run('Spoutnik', async () => parseSpoutnik(await get('https://spoutnik.info/')));
  await run('Cinélux', async () => parseCineluxFeed(await get('https://www.cinelux.ch/feed/')));
  await run('Empire', async () => parseEmpire(await get('https://www.cine17.ch/?cine=cem')));
  // Les Scala : une page par jour, 10 s entre deux pages (crawl-delay du site)
  await run('Scala', async () => {
    const all: Screening[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(Date.now() + i * 864e5);
      const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      if (i) await sleep(10_000);
      all.push(...parseScala(await get(`https://les-scala.ch/fr/a-l-affiche?dDate=${day}`)));
    }
    return all;
  });
  // Doublons (même cinéma, même film, même heure)
  const seen = new Set<string>();
  return {
    screenings: screenings.filter((s) => {
      const k = `${s.cinema}|${s.title.toLowerCase()}|${s.start}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }),
    errors,
  };
}

// ---------- conversion en événements de l'app ----------
const slug = (s: string) => s.toLowerCase().normalize?.('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') ?? s;

export function screeningsToEvents(list: Screening[]) {
  const events = new Map<string, Event>();
  const timings = new Map<string, { begin: string; end: string }[]>();
  const now = Date.now();
  for (const s of list) {
    const begin = new Date(s.start);
    if (isNaN(begin.getTime()) || begin.getTime() < now - 6 * 3600e3) continue;
    const v = CINEMA_VENUES[s.cinema];
    const id = `${v.id}-${slug(s.title)}`;
    if (!events.has(id)) {
      const facts = [s.durationMin ? `${s.durationMin} min` : '', s.version ?? ''].filter(Boolean).join(' · ');
      events.set(id, {
        id,
        title: s.title,
        cat: 'cinema',
        venue: v.id,
        desc: facts ? `Séance de cinéma · ${facts}.` : 'Séance de cinéma.',
        price: null,
        audience: [],
        status: 'confirme',
        url: s.url ?? v.site,
        ticketUrl: s.ticketUrl ?? s.url ?? v.site,
        source: `${v.name.replace(/ \(Les Scala\)$/, '')} · site officiel`,
        license: 'Horaires repris du site du cinéma (usage personnel)',
      });
      timings.set(id, []);
    }
    const end = new Date(begin.getTime() + (s.durationMin ?? 110) * 6e4);
    timings.get(id)!.push({ begin: begin.toISOString(), end: end.toISOString() });
  }
  return { events: [...events.values()], timings };
}

export const cinemaVenues = (): Venue[] => Object.values(CINEMA_VENUES).map(({ site, ...v }) => v);
