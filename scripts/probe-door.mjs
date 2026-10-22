// What the proxy's door (/law-page with the build's key) sees at each page:
// node scripts/probe-door.mjs <url>... → its answer, the site's status, the page's title and size.
const DOOR = 'https://orbit-workers-proxy.pengzjay.workers.dev/law-page';
const KEY = process.env.LAW_BUILD_KEY || '';
for (const url of process.argv.slice(2)) {
  try {
    const r = await fetch(`${DOOR}?v=1&u=${encodeURIComponent(url)}`, { headers: { 'X-Build-Key': KEY }, signal: AbortSignal.timeout(60_000) });
    const b = await r.json().catch(() => ({}));
    const html = b.html || '';
    const title = (html.match(/<title[^>]*>([^<]*)/i) || [])[1]?.trim() || '';
    const links = [...html.matchAll(/href="([^"]+\.aspx[^"]*)"/gi)].map(m => m[1]).slice(0, 8);
    console.log(JSON.stringify({ url, door: r.status, error: b.error, site: b.status, at: b.url, size: html.length, title, links }));
  } catch (e) {
    console.log(JSON.stringify({ url, failed: String(e.message || e) }));
  }
}
