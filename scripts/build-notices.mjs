// 預告, opened up: for each draft open for comment (and the ones closed in
// the last 90 days), join.gov.tw's record (its category, the agency doing
// the work, how to comment, how many have) and the draft itself from the
// 行政院公報 PDF it posts: the 總說明 (why) and the 條文對照表 (each
// article's new text against today's, with the reason). One file a draft,
// public/data/bills/notice/<id>.json; notices.json gets each one's purpose
// in a line. A draft read once is carried over (its text doesn't change);
// an open one's counts are read again. Needs poppler's pdftotext for the
// PDF (without it, the record only).
// Runs after build-data.mjs.
//   node scripts/build-notices.mjs
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prevJson } from './lib.mjs';
import { bboxWords, readDraft, draftWhy, twDay } from '../public/lib/notices.mjs';

const root = new URL('../public/data/bills/', import.meta.url).pathname;
const file = `${root}notices.json`;
const list = JSON.parse(await readFile(file, 'utf8').catch(() => 'null'));
if (!list?.notices?.length) {
  console.log('notices: none to open');
  process.exit(0);
}
let pdftotext = true;
try {
  execFileSync('pdftotext', ['-v'], { stdio: 'ignore' });
} catch {
  pdftotext = false;
}
await mkdir(`${root}notice`, { recursive: true });
const tmp = await mkdtemp(join(tmpdir(), 'notice-'));
const UA = { 'User-Agent': 'Mozilla/5.0 (Orbit Law; +https://jaypengx.github.io/Orbit-Law/)', Accept: 'application/json' };
const today = twDay(Date.now());
const since = twDay(Date.now() - 90 * 864e5);
const text = html => String(html || '').replace(/<br\s*\/?>/g, '\n').replace(/<\/p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/[ \t]+/g, ' ');

let read = 0, carried = 0, failed = 0, parsed = 0;
for (const n of list.notices) {
  if (n.to < since) continue;
  const prev = await prevJson(`bills/notice/${n.id}.json`);
  const open = n.to >= today;
  let d = prev;
  if (!prev || open) {
    try {
      const r = await fetch(`https://join.gov.tw/policies/${n.id}`, { headers: UA, signal: AbortSignal.timeout(60_000) });
      if (!r.ok) throw new Error(String(r.status));
      const x = (await r.json()).result;
      const body = text(x.policyContent);
      const field = re => body.match(re)?.[1]?.trim().replace(/[。.]$/, '') || '';
      // The draft's PDF: the 公報 page it's embedded from, else the attached file named for the draft (總說明, 對照表).
      const files = [...(x.policyAttachments || []), ...(x.sortedPolicyAttachments || [])].flatMap(a => [a.attachment, ...(a.attachment?.childAttachments || [])]).filter(a => a?.attachmentType === 1 && /^pdf$/i.test(a.fileExtension || '') && a.downloadUrl);
      const pdf = x.embedPdfResource?.[0]?.attachment?.downloadUrl || (files.find(a => /對照|總說明/.test(a.attachmentName)) || files.find(a => /草案/.test(a.attachmentName)) || files.find(a => !/公告|函/.test(a.attachmentName)) || files[0])?.downloadUrl || '';
      d = {
        id: n.id,
        gov: x.pubGovName || x.masterPolicyOrgs?.[0]?.organization?.organizationName || x.undertakeGov || '',
        cat: x.category?.[0]?.nameFor21 || x.category?.[0]?.name?.replace(/篇$/, '') || '',
        dept: x.undertakeGov && x.undertakeGov !== n.gov ? x.undertakeGov : '',
        basis: field(/(?:修正|訂定|廢止|制定)依據：([^\n]+)/),
        email: field(/電子(?:郵件|信箱)：([^\s（(]+)/).replace('＠', '@'),
        phone: field(/電話：([^\n]+?)(?:。|\n)/),
        days: field(/於本公告刊登公報(?:隔|次)日起(\d+)日內/),
        count: { c: x.totalCommentCount || 0, y: x.totalAgreeCount || 0, n: x.totalDisagreeCount || 0 },
        pdf: pdf ? `https://join.gov.tw${encodeURI(pdf)}` : '',
        // The 公告's own reason, for a draft whose PDF is a scan: its items that say what changes and why.
        note: body.split('\n').map(l => l.trim()).filter(l => /^[一二三四五六七八九十]+、/.test(l) && /本次|修正重點|要點|為(了)?[^，]{2,}|鑑於|因應/.test(l) && !/修正機關|訂定機關|依據|如附件|意見|洽詢|網址/.test(l)).map(l => l.replace(/^[一二三四五六七八九十]+、/, '')).join('\n').slice(0, 1200),
        about: prev?.about || '',
        rows: prev?.rows || [],
        tried: prev?.tried
      };
      read++;
    } catch (e) {
      failed++;
      console.log(`notices: ${n.t.slice(0, 30)} ${e.message}`);
      if (!d) continue;
    }
  } else carried++;
  // The draft's text, once.
  if (pdftotext && d.pdf && !d.about && !d.rows.length && !d.tried) {
    try {
      const r = await fetch(d.pdf, { headers: UA, signal: AbortSignal.timeout(90_000) });
      if (!r.ok) throw new Error(String(r.status));
      const f = join(tmp, `${n.id}.pdf`);
      await writeFile(f, Buffer.from(await r.arrayBuffer()));
      const draft = readDraft(bboxWords(execFileSync('pdftotext', ['-bbox', f, '-'], { maxBuffer: 64 << 20 }).toString()));
      Object.assign(d, draft);
      parsed++;
    } catch (e) {
      console.log(`notices: PDF of ${n.t.slice(0, 30)} ${e.message}`);
    }
    d.tried = 1;
  }
  await writeFile(`${root}notice/${n.id}.json`, JSON.stringify(d));
  n.d = 1;
  if (!n.gov && d.gov) n.gov = d.gov;
  if (d.cat) n.cat = d.cat;
  const why = draftWhy(d.about || d.note);
  if (why) n.s = why;
}
await rm(tmp, { recursive: true, force: true });
await writeFile(file, JSON.stringify(list));
console.log(`notices: ${read} read, ${carried} carried over, ${parsed} drafts read from their PDF, ${failed} failed${pdftotext ? '' : ' (no pdftotext: records only)'}`);
