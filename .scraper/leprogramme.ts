// leprogramme.ch (agenda culturel GE) — lu pour les lieux absents des autres sources.
// Site « tous droits réservés » : USAGE PERSONNEL uniquement (src/config.ts), faits seulement
// (titre, lieu, date, heure, lien), une page toutes les 10 s (crawl-delay du site).
import type { CatKey } from '@/theme';
import type { Event, Venue } from './types';

const BASE = 'https://www.leprogramme.ch';

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', ndash: '–', hellip: '…' };
const decode = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const text = (h: string) => decode(h.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
export const LP_DELAY_MS = 10_000;

export type LpVenue = { id: number; name: string; city?: string };
export type LpEvent = { url: string; title: string; theme: string; genre: string; venue: string; city: string; venueId?: number; starts: string[] };

const MONTHS: [RegExp, number][] = [
  [/^janv/i, 0], [/^f[ée]v/i, 1], [/^mars/i, 2], [/^avr/i, 3], [/^mai/i, 4], [/^juin/i, 5],
  [/^juil/i, 6], [/^ao[uû]/i, 7], [/^sept/i, 8], [/^oct/i, 9], [/^nov/i, 10], [/^d[ée]c/i, 11],
];
const month = (s: string) => MONTHS.find(([r]) => r.test(s))?.[1] ?? -1;
const iso = (y: number, mo: number, d: number, h: number, mi: number) => new Date(y, mo, d, h, mi).toISOString();

// ---------- pages de liste ----------
export type LpCard = { url: string; title: string; theme: string; genre: string; date: string; venue: string; city: string };
export function parseCards(html: string): LpCard[] {
  const out: LpCard[] = [];
  for (const m of html.matchAll(/<a href="([^"]+)" class="card card-spectacle[^"]*?theme-([a-z]+)"[\s\S]*?<h5 class="card-title">([\s\S]*?)<\/h5>\s*<p class="card-text">([\s\S]*?)<\/p>([\s\S]*?)<\/a>/g)) {
    const lines = m[4].split(/<br\s*\/?>/).map(text).filter(Boolean);
    const place = lines[1] ?? '';
    const cut = place.lastIndexOf(',');
    out.push({
      url: decode(m[1]),
      theme: m[2],
      title: text(m[3]),
      date: lines[0] ?? '',
      venue: cut > 0 ? place.slice(0, cut).trim() : place,
      city: cut > 0 ? place.slice(cut + 1).trim() : '',
      genre: text(m[5].match(/<ul class="card-tags[\s\S]*?<\/ul>/)?.[0] ?? ''),
    });
  }
  return out;
}
export const lastPage = (html: string) => Math.max(1, ...[...html.matchAll(/[?&]page=(\d+)/g)].map((m) => +m[1]));

// « Le 10 Octobre 2026 à 20:00 » → une date ; « Du 9 au 16 Octobre 2026 » → null (voir la fiche)
export function singleStart(date: string): string | null {
  const m = date.match(/^Le\s+(\d{1,2})(?:er)?\s+([a-zéû]+)\s+(\d{4})\s+[àa]\s+(\d{1,2})[:h](\d{2})/i);
  if (!m) return null;
  const mo = month(m[2]);
  return mo < 0 ? null : iso(+m[3], mo, +m[1], +m[4], +m[5]);
}

// ---------- fiche : « à 19h30, les 09, 13, 14 et 16 octobre » / « à 14h30, le 11 octobre » ----------
export function parseDetailStarts(html: string): string[] {
  const block = html.match(/Dates &amp; horaires<\/div>\s*<div class="sidebar-info-details">([\s\S]*?)<div id="calendar"/)?.[1]
    ?? html.match(/Dates & horaires<\/div>\s*<div class="sidebar-info-details">([\s\S]*?)<div id="calendar"/)?.[1];
  if (!block) return [];
  const lines = block.split(/<br\s*\/?>|<\/p>|<p>/).map(text).filter(Boolean);
  const head = lines[0] ?? '';
  const year = +(head.match(/(\d{4})/)?.[1] ?? new Date().getFullYear());
  const single = singleStart(head);
  if (single) return [single];
  const out: string[] = [];
  for (const l of lines.slice(1)) {
    const m = l.match(/(\d{1,2})\s*h\s*(\d{2})?\s*,?\s*(?:les?|du)?\s*([\d,\s et]+?)\s+([a-zéû]+)\s*(\d{4})?$/i);
    if (!m) continue;
    const mo = month(m[4]);
    if (mo < 0) continue;
    const y = m[5] ? +m[5] : year;
    for (const d of m[3].split(/,|\set\s/).map((x) => +x.trim()).filter((x) => x >= 1 && x <= 31)) out.push(iso(y, mo, d, +m[1], m[2] ? +m[2] : 0));
  }
  return out;
}

// ---------- téléchargement ----------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function get(path: string) {
  const wait = last + LP_DELAY_MS - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  const res = await fetch(path.startsWith('http') ? path : BASE + path, { headers: { 'User-Agent': 'culture.gva (usage personnel)' } });
  if (!res.ok) throw new Error(`leprogramme ${res.status}`);
  return res.text();
}
const SEARCH = (venue: number, page = 1) =>
  `/recherche?search_string=&search_venue=${venue}&search_genre=&search_festival=&search_date_start=&search_music=1&search_theater=1&search_dance=1&search_others=1&search_children=1${page > 1 ? `&page=${page}` : ''}`;

// Programme d'une liste de lieux (un lieu après l'autre, 10 s entre deux pages)
export async function fetchLpVenues(venues: LpVenue[], onProgress?: (n: number) => void): Promise<{ events: LpEvent[]; errors: string[] }> {
  const events: LpEvent[] = [];
  const errors: string[] = [];
  let n = 0;
  for (const v of venues) {
    try {
      const first = await get(SEARCH(v.id));
      const cards = parseCards(first);
      for (let p = 2; p <= Math.min(lastPage(first), 5); p++) cards.push(...parseCards(await get(SEARCH(v.id, p))));
      for (const c of cards) {
        let starts = [singleStart(c.date)].filter(Boolean) as string[];
        if (!starts.length) starts = parseDetailStarts(await get(c.url));
        if (starts.length) events.push({ url: c.url, title: c.title, theme: c.theme, genre: c.genre, venue: v.name, city: v.city ?? c.city, venueId: v.id, starts });
      }
    } catch (e) {
      errors.push(`${v.name} : ${e instanceof Error ? e.message : 'erreur'}`);
    }
    onProgress?.(++n);
  }
  return { events, errors };
}

// ---------- conversion ----------
function category(theme: string, genre: string, title: string): CatKey {
  const t = `${genre} ${title}`;
  if (/humour|stand-?up|one-?(wo)?man|com[ée]dien/i.test(t)) return 'humour';
  if (theme === 'music') return 'musique';
  if (theme === 'dance') return 'danse';
  if (/festival/i.test(t)) return 'festivals';
  if (/conf[ée]rence|lecture|d[ée]bat/i.test(t)) return /lecture/i.test(t) ? 'litterature' : 'conferences';
  if (/cirque|magie|cabaret|th[ée][âa]tre|spectacle|marionnette/i.test(t) || theme === 'theater' || theme === 'children') return 'theatre';
  return 'autres';
}
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function lpToEvents(list: LpEvent[]) {
  const events: Event[] = [];
  const venues = new Map<string, Venue>();
  const timings = new Map<string, { begin: string; end: string }[]>();
  const now = Date.now();
  for (const e of list) {
    const vid = `lp-${e.venueId ?? slug(e.venue)}`;
    if (!venues.has(vid)) venues.set(vid, { id: vid, name: e.venue, area: e.city || 'Genève', commune: e.city || 'Genève' });
    const id = `lp-${slug(e.url.replace(BASE, ''))}`.slice(0, 120);
    const ts = e.starts
      .filter((s) => new Date(s).getTime() > now - 6 * 3600e3)
      .map((s) => ({ begin: s, end: new Date(new Date(s).getTime() + 120 * 6e4).toISOString() }));
    if (!ts.length || timings.has(id)) continue;
    timings.set(id, ts);
    events.push({
      id,
      title: e.title,
      cat: category(e.theme, e.genre, e.title),
      venue: vid,
      desc: e.genre ? `${e.genre}. Durée non indiquée : fin estimée.` : 'Durée non indiquée : fin estimée.',
      price: null,
      audience: e.theme === 'children' ? ['famille'] : [],
      status: 'confirme',
      url: e.url,
      ticketUrl: e.url,
      source: 'leprogramme.ch',
      license: 'Repris de leprogramme.ch (usage personnel)',
    });
  }
  return { events, venues: [...venues.values()], timings };
}
