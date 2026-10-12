import { describe, expect, it } from "vitest";
import { posAtIndex, posBetween, RANK_STEP, renumber } from "@/lib/rank";

describe("位次：插到两者之间", () => {
  it("空列表给一个起始值", () => {
    expect(posBetween(null, null)).toBe(RANK_STEP);
  });

  it("插到最前 / 最后各留一个整步的余量", () => {
    expect(posBetween(null, 1000)).toBe(1000 - RANK_STEP);
    expect(posBetween(1000, null)).toBe(1000 + RANK_STEP);
  });

  it("两者之间取中点", () => {
    expect(posBetween(0, 1024)).toBe(512);
    expect(posBetween(512, 1024)).toBe(768);
  });

  it("顺序反了或相等时不猜，交给重排", () => {
    expect(posBetween(1024, 512)).toBeNull();
    expect(posBetween(512, 512)).toBeNull();
  });
});

describe("位次：缝隙会用完", () => {
  it("反复插在相邻两张之间，几十步后返回 null 而不是悄悄乱序", () => {
    /*
     * 这是整个方案唯一的失败模式，必须能被检出来。
     * 模拟的是真实情形：两张位次都不小、且越挨越近（每次都往同一条缝里插）。
     * float64 的尾数是 52 位，所以在 1024 这个量级上五十来步就分不出中点了。
     */
    const lo = 1024;
    let hi = 2048;
    let steps = 0;
    for (;;) {
      const mid = posBetween(lo, hi);
      if (mid === null) break;
      // 中点必须严格落在两端之间，一旦不是就说明浮点到头了而我们没发现
      expect(mid).toBeGreaterThan(lo);
      expect(mid).toBeLessThan(hi);
      hi = mid;
      steps++;
      expect(steps).toBeLessThan(200); // 防止这个循环本身变成死循环
    }
    expect(steps).toBeGreaterThan(40);
    expect(steps).toBeLessThan(60);
  });

  it("一端是 0 时收敛得慢得多，但同样不会乱序", () => {
    // 插到列首会产生 pos = 0（1024 - 1024）。这一端靠指数下溢收敛，
    // 要一千多步，实际用不到；重要的是它同样以 null 收场，不是以乱序收场。
    let hi = 1024;
    let steps = 0;
    for (;;) {
      const mid = posBetween(0, hi);
      if (mid === null) break;
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(hi);
      hi = mid;
      steps++;
      expect(steps).toBeLessThan(2000);
    }
    expect(steps).toBeGreaterThan(1000);
  });

  it("重排之后缝隙全部恢复", () => {
    const fresh = renumber(4);
    expect(fresh).toEqual([1024, 2048, 3072, 4096]);
    expect(posBetween(fresh[0], fresh[1])).toBe(1536);
  });
});

describe("按下标插入", () => {
  const ps = [1024, 2048, 3072];

  it("插到头、中、尾", () => {
    expect(posAtIndex(ps, 0)).toBe(0);
    expect(posAtIndex(ps, 1)).toBe(1536);
    expect(posAtIndex(ps, 3)).toBe(4096);
  });

  it("越界的下标当成两端处理，不抛错", () => {
    expect(posAtIndex(ps, -5)).toBe(0);
    expect(posAtIndex(ps, 99)).toBe(4096);
    expect(posAtIndex([], 0)).toBe(RANK_STEP);
  });
});
