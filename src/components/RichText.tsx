import { linkify } from "@/lib/text";

/** 正文：保留换行，把网址变成可点的链接，其余原样。 */
export default function RichText({ text }: { text: string }) {
  return (
    <p className="card-body text-[13px]">
      {linkify(text).map((p, i) =>
        p.href ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer">
            {p.text}
          </a>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </p>
  );
}
