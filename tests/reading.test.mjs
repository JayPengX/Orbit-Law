import test from 'node:test';
import assert from 'node:assert/strict';
import { readLog, noteRead, lawPlace, MAX } from '../public/lib/reading.mjs';

const mem = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('繼續閱讀: newest first, any kind, the same thing moves up keeping its place, at most MAX', () => {
  const s = mem();
  noteRead({ kind: 'law', id: 'T0020001', title: '預算法', href: '#law=T0020001&a=85', sub: '讀到第85條', pct: 0.8 }, s, 1);
  noteRead({ kind: 'cons', id: 's520', title: '釋字第520號', href: '#r=s520' }, s, 2);
  noteRead({ kind: 'law', id: 'T0020001', title: '預算法', href: '#law=T0020001' }, s, 3);
  const l = readLog(s);
  assert.deepEqual(l.map(x => x.id), ['T0020001', 's520']);
  assert.equal(l[0].pct, 0.8);
  assert.equal(l[0].href, '#law=T0020001');
  for (let i = 0; i < 20; i++) noteRead({ kind: 'bill', id: `b${i}`, title: 'x', href: '#item=x' }, s, 10 + i);
  assert.equal(readLog(s).length, MAX);
  assert.deepEqual(readLog({ getItem: () => '{bad' }), []);
});

test('a law place: the article and how far through', () => {
  assert.deepEqual(lawPlace(['1', '2', '3', '4', '5'], '3'), { k: '3', pct: 0.5 });
  assert.equal(lawPlace(['1'], '9'), null);
});
