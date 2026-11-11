// Orbit Law: the family's one service worker (Orbit-Core/kit/sw.js),
// with this app's settings. It keeps the page's own files so the app opens
// without a connection and can be installed, and never keeps a file that
// isn't the one its address names (GitHub's CDN can answer a new address
// with the old file for a while after a deploy).
// Every law and bill file once opened (data/): the kept copy at once,
// refreshed behind it, since the data changes once a day. Packed data
// (scripts/pack-data.mjs): a pack's address is its content, kept for good;
// the list of packs (_packs.json) from the network first, so it never names
// packs a deploy took away.
self.ORBIT_SW = {
  cache: 'orbit-law-v1',
  title: 'Orbit Law',
  route: (request, url) => {
    if (request.mode === 'navigate' || !url.pathname.includes('/data/')) return null;
    if (url.pathname.endsWith('/_packs.json')) return 'networkFirst';
    return /\/_p\/[^/]+$/.test(url.pathname) ? 'cacheFirst' : 'pageFirst';
  }
};
importScripts('../Orbit-Core/kit/sw.js');
