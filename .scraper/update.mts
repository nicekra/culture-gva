// Met à jour les fichiers chiffrés de l'accès amis (cinémas, leprogramme.ch).
// Exécuté par GitHub Actions sur le dépôt du site, ou à la main :
//   FRIENDS_KEY=… node --experimental-strip-types update.mts cine|lp <dossier de sortie>
import { createCipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchCinemas } from './cinemas.ts';
import { fetchLpVenues } from './leprogramme.ts';

const [what, outDir = 'p'] = process.argv.slice(2);
const key = Buffer.from((process.env.FRIENDS_KEY ?? '').replace(/-/g, '+').replace(/_/g, '/'), 'base64');
if (key.length !== 32) throw new Error('FRIENDS_KEY manquante ou invalide (32 octets en base64url)');

function seal(obj: unknown, file: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final(), c.getAuthTag()]);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(`${outDir}/${file}`, Buffer.concat([iv, body]));
}

if (what === 'cine') {
  const r = await fetchCinemas((n: string) => console.log('ok', n));
  if (!r.screenings.length) throw new Error('aucune séance : ' + r.errors.join(' ; '));
  seal({ fetchedAt: new Date().toISOString(), screenings: r.screenings }, 'cine.bin');
  console.log(r.screenings.length, 'séances', r.errors);
} else if (what === 'lp') {
  const venues = JSON.parse(readFileSync(new URL('./lp-venues.json', import.meta.url), 'utf8'));
  const r = await fetchLpVenues(venues, (n: number) => n % 20 === 0 && console.log(n, '/', venues.length));
  if (!r.events.length) throw new Error('aucun événement');
  seal({ fetchedAt: new Date().toISOString(), events: r.events }, 'lp.bin');
  console.log(r.events.length, 'événements', r.errors.length, 'erreurs');
} else throw new Error('usage : update.mts cine|lp [dossier]');
