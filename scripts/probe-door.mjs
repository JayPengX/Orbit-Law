// What the proxy's door (/law-page with the build's key) sees at each page, and what a direct fetch
// from here sees: node scripts/probe-door.mjs <url>... → status, title, size and the page's category marks.
const DOOR = 'https://orbit-workers-proxy.pengzjay.workers.dev/law-page';
const KEY = process.env.LAW_BUILD_KEY || '';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const sum = html => ({
  size: html.length,
  title: (html.match(/<title[^>]*>([^<]*)/i) || [])[1]?.trim() || '',
  categories: [...html.matchAll(/CategoryID[^"'&]{0,4}["'=]?(\d+)/gi)].length,
  ids: [...new Set([...html.matchAll(/id="cbCategoryID(\w+)"/g)].map(m => m[1]))].slice(0, 80).join(' '),
  marks: [...new Set([...html.matchAll(/(?:id|name)="([^"]*Categ[^"]*)"/gi)].map(m => m[1]))].slice(0, 6),
  sample: (html.match(/[^\n]{0,120}Categor[^\n]{0,200}/i) || [''])[0].slice(0, 320),
  // Where a council keeps its bills: links whose words or address speak of them.
  links: [...new Set([...html.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]{0,120}?)<\/a>/gi)].filter(([, u, t]) => /提案|議案|議決|議事|Bill|propos|agenda/i.test(u + t)).map(([, u, t]) => `${t.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 30)} ${u}`))].slice(0, 30),
  text: html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, Number(process.env.TEXT || 0))
});
// SAVE=dir keeps each page whole (door-N.html, direct-N.html) for the workflow's artifact.
import { mkdirSync, writeFileSync } from 'node:fs';
const SAVE = process.env.SAVE || '';
if (SAVE) mkdirSync(SAVE, { recursive: true });
const keep = (name, text) => SAVE && text && writeFileSync(`${SAVE}/${name}`, text);
let i = 0;
for (const url of process.argv.slice(2)) {
  i++;
  try {
    const r = await fetch(`${DOOR}?v=1&u=${encodeURIComponent(url)}`, { headers: { 'X-Build-Key': KEY }, signal: AbortSignal.timeout(60_000) });
    const b = await r.json().catch(() => ({}));
    keep(`door-${i}.html`, `<!-- ${url} -->\n${b.html || ''}`);
    console.log(JSON.stringify({ url, door: r.status, error: b.error, site: b.status, at: b.url, ...sum(b.html || '') }));
  } catch (e) {
    console.log(JSON.stringify({ url, door: 'failed', why: String(e.message || e) }));
  }
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'zh-TW,zh;q=0.9' }, signal: AbortSignal.timeout(30_000) });
    const text = await r.text();
    keep(`direct-${i}.html`, `<!-- ${url} -->\n${text}`);
    console.log(JSON.stringify({ url, direct: r.status, server: r.headers.get('server'), ...sum(text) }));
  } catch (e) {
    console.log(JSON.stringify({ url, direct: 'failed', why: String(e.cause?.code || e.cause?.message || e.message || e) }));
  }
}
