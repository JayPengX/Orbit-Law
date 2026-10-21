// Orbit Law: the family's one service worker (Shared-Proxy/kit/sw.js),
// with this app's settings. It keeps the page's own files so the app opens
// without a connection and can be installed, and never keeps a file that
// isn't the one its address names (GitHub's CDN can answer a new address
// with the old file for a while after a deploy).
// Every law and bill file once opened (data/): the kept copy at once,
// refreshed behind it, since the data changes once a day.
self.QUADRA_SW = {
  cache: 'orbit-law-v1',
  title: 'Orbit Law',
  route: (request, url) => (request.mode !== 'navigate' && url.pathname.includes('/data/') ? 'pageFirst' : null)
};
importScripts('../Shared-Proxy/kit/sw.js');
