import test from 'node:test';
import assert from 'node:assert/strict';

test('deletedIds: JIDs out of the Delete-Infor CSV, dropped from the list', async () => {
  const { deletedIds, dropDeleted } = await import('../public/lib/rulings.mjs');
  const gone = deletedIds('JID,刪除日期\r\n"TPSM,115,台上,3024,20260930,1",2026-10-01\r\nTPHV,114,上,12,20250101,2,2026-10-02\r\n');
  assert.deepEqual([...gone], ['TPSM,115,台上,3024,20260930,1', 'TPHV,114,上,12,20250101,2']);
  assert.deepEqual(dropDeleted([['TPSM,115,台上,3024,20260930,1'], ['TPSM,115,台上,1,20260930,1']], gone), [['TPSM,115,台上,1,20260930,1']]);
});
