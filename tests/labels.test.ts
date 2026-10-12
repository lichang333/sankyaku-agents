import { describe, expect, it } from "vitest";
import { isHexColor, isValidLabelColor, LABEL_COLORS, labelStyle } from "@/lib/types";

describe("标签颜色", () => {
  it("预设 key 返回 Tailwind 类，custom 为空", () => {
    const s = labelStyle("cardinal");
    expect(s.bar).toBe("bg-cardinal");
    expect(s.custom).toBeNull();
  });

  it("自定义 hex 返回内联色，类为空", () => {
    const s = labelStyle("#ff6600");
    expect(s.custom).toBe("#ff6600");
    expect(s.bar).toBe("");
  });

  it("脏值退回灰色，不让一条脏数据把整页打崩", () => {
    for (const bad of ["red", "#12345", "#gggggg", "", "#ff66001"]) {
      const s = labelStyle(bad);
      expect(s.bar).toBe(LABEL_COLORS[6].bar);
      expect(s.custom).toBeNull();
    }
  });

  it("合法性校验：预设和 6 位 hex 过，其余不过", () => {
    expect(isValidLabelColor("macaw")).toBe(true);
    expect(isValidLabelColor("#AbCdEf")).toBe(true);
    expect(isValidLabelColor("blue")).toBe(false);
    expect(isValidLabelColor("#abc")).toBe(false);
    expect(isHexColor("#abcdef")).toBe(true);
    expect(isHexColor("abcdef")).toBe(false);
  });
});
