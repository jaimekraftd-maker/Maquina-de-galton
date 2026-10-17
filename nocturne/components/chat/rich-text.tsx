import { Fragment } from "react";

/**
 * Renders roleplay-style text safely: *actions* in italics and **emphasis** in
 * bold, paragraphs on blank lines. Everything is rendered as React text nodes —
 * no HTML from user or model output is ever injected.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className={className}>
      {paragraphs.map((p, i) => (
        <p key={i} className="mb-2 last:mb-0">
          {p.split("\n").map((line, j) => (
            <Fragment key={j}>
              {j > 0 ? <br /> : null}
              {inline(line)}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

function inline(line: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    out.push(
      m[1] !== undefined ? (
        <strong key={m.index} className="font-semibold text-fg">
          {m[1]}
        </strong>
      ) : (
        <em key={m.index} className="text-[#c9bde6] italic">
          {m[2]}
        </em>
      ),
    );
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}
