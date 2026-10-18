// The peek sheets' trail: each link opened from a sheet replaces it and
// goes on the trail; back reopens the one before. Only the sheet on screen
// closing (not one a newer sheet replaced, whose close event lands late)
// ends the trail.
export function linkTrail() {
  const items = [];
  let current = null;
  return {
    get length() {
      return items.length;
    },
    get current() {
      return current;
    },
    // A sheet now on screen for `entry` (a back step's entry is already on).
    show(sheet, entry, { back = false } = {}) {
      if (!back) items.push(entry);
      const old = current;
      current = sheet;
      return old;
    },
    closed(sheet) {
      if (sheet !== current) return;
      current = null;
      items.length = 0;
    },
    // The entry to go back to (null at the start).
    back() {
      if (items.length < 2) return null;
      items.pop();
      return items[items.length - 1];
    }
  };
}
