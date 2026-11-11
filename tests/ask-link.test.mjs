import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 問 Orbit (the Pass sheet's box, kit ask-orbit.mjs) opens Law with
// #ask=<words>: route() takes it (kit takeAsk, out of the address) and asks
// it on 問法律, as #tab=ask&q= is, before anything else reads the address.
const src = readFileSync(new URL('../public/app.mjs', import.meta.url), 'utf8');
test('#ask=<words> is asked on 問法律', () => {
  const at = src.indexOf('async function route() {');
  const body = src.slice(at, src.indexOf('\n}\n', at));
  const ask = body.indexOf('takeAsk?.()');
  assert.ok(ask > 0, 'route() takes 問 Orbit’s question');
  assert.ok(ask < body.indexOf('new URLSearchParams(location.hash'), 'before the address is read');
  assert.match(body, /#tab=ask&q=\$\{encodeURIComponent\(asked\)\}/);
});
