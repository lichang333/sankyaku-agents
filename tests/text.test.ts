import { describe, expect, it } from "vitest";
import { linkify } from "@/lib/text";

describe("正文里的链接", () => {
  it("纯文字原样返回", () => {
    expect(linkify("先跟设计对一版")).toEqual([{ text: "先跟设计对一版" }]);
  });

  it("认出网址并保留前后文字", () => {
    expect(linkify("见 https://example.com/a 里的第三节")).toEqual([
      { text: "见 " },
      { text: "https://example.com/a", href: "https://example.com/a" },
      { text: " 里的第三节" },
    ]);
  });

  it("句末标点归句子，不归网址", () => {
    const parts = linkify("文档在 https://example.com/doc。");
    expect(parts[1]).toEqual({
      text: "https://example.com/doc",
      href: "https://example.com/doc",
    });
    expect(parts[2]).toEqual({ text: "。" });
  });

  it("一段里有两个网址都认得出", () => {
    expect(linkify("http://a.com 和 http://b.com").filter((p) => p.href)).toHaveLength(2);
  });
});
