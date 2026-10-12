/* 卡片正文里的链接。
 *
 * 不做 Markdown：一张卡的正文是「补一句上下文」，不是写文档。
 * 引一个 Markdown 库要换来的是——有人写 `*` 想表示重点，结果显示成斜体；
 * 有人贴一段带下划线的路径，被吃成了强调。收益远小于这些意外。
 * 需要长文的时候，正文里贴个链接指向真正的文档更诚实。
 */
const URL_RE = /(https?:\/\/[^\s<>"']+)/g;

export type TextPart = { text: string; href?: string };

export function linkify(text: string): TextPart[] {
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i) });
    // 结尾的标点多半是句子的，不是网址的。中英文都要算：
    // 「文档在 https://x.com/doc。」里那个句号属于句子，跟进 href 会 404。
    const raw = m[0].replace(/[),.;:!?，。、；：！？」』】）]+$/u, "");
    out.push({ text: raw, href: raw });
    last = i + raw.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
