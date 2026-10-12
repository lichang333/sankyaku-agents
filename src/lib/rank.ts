/* ── 排序位次 ──
 * 列和卡片的顺序存成一个 REAL 的 `pos`，插到两张之间就取中点。
 *
 * 为什么不用整数序号（0,1,2,…）：那样往中间插一张，后面每一张的序号都要改。
 * 一次拖拽变成一整列的 UPDATE，几十行 SQL 打过去，手指松开到界面稳定之间
 * 会有肉眼可见的一顿。中点法一次拖拽只写一行。
 *
 * 代价是中点会用完：float64 只有 52 位尾数，在同一个缝里反复插，
 * 大约 50 次之后 (a+b)/2 会等于 a 或 b，顺序就乱了。所以 `posBetween`
 * 在没缝时返回 null，调用方拿到 null 就把整列重排一遍（`renumber`）再插。
 * 这条路很少走到，但必须存在——不存在的话，那 50 次之后的 bug
 * 会表现成「卡片偶尔跳位置」，是最难查的那一类。
 */

/** 相邻两项的默认间距。留得大一点，中点才够分。 */
export const RANK_STEP = 1024;

/**
 * 求 before 和 after 之间的位次。两端传 null 表示「没有邻居」。
 * 返回 null 表示这条缝已经窄到 float64 表示不出中间值了，请先 renumber。
 */
export function posBetween(before: number | null, after: number | null): number | null {
  if (before == null && after == null) return RANK_STEP;
  if (before == null) return (after as number) - RANK_STEP;
  if (after == null) return before + RANK_STEP;
  if (!(before < after)) return null; // 顺序反了或相等：交给 renumber
  const mid = before + (after - before) / 2;
  return mid > before && mid < after ? mid : null;
}

/** 重排一列：等间距铺开，缝隙全部恢复。 */
export function renumber(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * RANK_STEP);
}

/**
 * 把一项插到 `positions`（已升序）的第 index 个位置前，求它的位次。
 * index = 0 插到最前，index = positions.length 追加到最后。
 */
export function posAtIndex(positions: number[], index: number): number | null {
  const i = Math.max(0, Math.min(index, positions.length));
  return posBetween(i > 0 ? positions[i - 1] : null, i < positions.length ? positions[i] : null);
}
