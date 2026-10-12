import { describe, expect, it } from "vitest";
import { addDays, daysBetween, dayOfWeek, relTime, todayISO, weekStart } from "@/lib/dates";

describe("东京时区的今天", () => {
  it("UTC 深夜已经是东京的第二天", () => {
    // 2026-08-30 16:00 UTC = 2026-08-31 01:00 JST
    expect(todayISO(new Date("2026-08-30T16:00:00Z"))).toBe("2026-08-31");
    expect(todayISO(new Date("2026-08-30T14:59:00Z"))).toBe("2026-08-30");
  });
});

describe("周与天", () => {
  it("周一是 1、周日是 7", () => {
    expect(dayOfWeek("2026-08-31")).toBe(1);
    expect(dayOfWeek("2026-08-30")).toBe(7);
  });

  it("周日属于上一周（周一起算）", () => {
    expect(weekStart("2026-08-30")).toBe("2026-08-24");
    expect(weekStart("2026-08-31")).toBe("2026-08-31");
  });

  it("加减天数跨月正确", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(daysBetween("2026-09-01", "2026-08-31")).toBe(1);
  });
});

describe("相对时间", () => {
  const now = new Date("2026-08-31T12:00:00Z");

  it("一小时内说分钟，一天内说小时", () => {
    expect(relTime("2026-08-31T11:30:00Z", now)).toBe("30 分钟前");
    expect(relTime("2026-08-31T04:00:00Z", now)).toBe("8 小时前");
  });

  it("昨天就说昨天", () => {
    expect(relTime("2026-08-30T10:00:00Z", now)).toBe("昨天");
  });

  it("超过一天按东京日历日数，不按 24 小时块数", () => {
    // 事发 08-29 22:00Z（东京 08-30 07:00），现在 08-31 12:00Z（东京 08-31 21:00）：
    // 时长 38 小时，floor(38/24)=1 会说「昨天」，但日历上差 1 天……
    expect(relTime("2026-08-29T22:00:00Z", now)).toBe("昨天");
    // 事发 08-28 22:00Z（东京 08-29 07:00）：日历差 2 天，就是「2 天前」
    expect(relTime("2026-08-28T22:00:00Z", now)).toBe("2 天前");
  });

  it("超过一周直接给日期——「11 天前」没人算得清", () => {
    expect(relTime("2026-08-15T10:00:00Z", now)).toBe("8.15");
  });

  it("时钟不准导致的未来时间不显示负数", () => {
    expect(relTime("2026-09-01T10:00:00Z", now)).toBe("刚刚");
  });
});
