/**
 * Minimal markdown renderer for streamed agent output.
 *
 * Deliberately tiny — the agents emit a known, narrow subset (h2, lists,
 * bold, paragraphs) and pulling a full markdown pipeline in would cost more
 * than it returns. Renders partial text safely as it streams.
 */

function inline(text: string, keyPrefix: string) {
  // Split on **bold** and render the captured groups as <strong>.
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={`${keyPrefix}-${i}`}>{part}</span>;
  });
}

export function Markdown({ text, accent }: { text: string; accent: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flushList = (key: string) => {
    if (list.length === 0) return;
    blocks.push(
      <ul key={key} className="my-2 flex flex-col gap-1.5 pl-1">
        {list.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
            <span className={`mt-[7px] h-1 w-1 shrink-0 rounded-full ${accent}`} />
            <span>{inline(item, `${key}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  lines.forEach((raw, i) => {
    const line = raw.trimEnd();

    const listMatch = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      list.push(listMatch[1]);
      return;
    }
    flushList(`list-${i}`);

    if (line.startsWith("### ")) {
      blocks.push(
        <h4 key={i} className="mt-4 mb-1 text-[13px] font-semibold tracking-tight">
          {line.slice(4)}
        </h4>,
      );
    } else if (line.startsWith("## ")) {
      blocks.push(
        <h3
          key={i}
          className="mt-5 mb-2 text-sm font-semibold tracking-tight first:mt-0"
        >
          {line.slice(3)}
        </h3>,
      );
    } else if (line.startsWith("# ")) {
      blocks.push(
        <h2 key={i} className="mt-5 mb-2 text-base font-semibold tracking-tight first:mt-0">
          {line.slice(2)}
        </h2>,
      );
    } else if (line.trim() === "") {
      blocks.push(<div key={i} className="h-2" />);
    } else {
      blocks.push(
        <p key={i} className="text-[13px] leading-relaxed">
          {inline(line, `p-${i}`)}
        </p>,
      );
    }
  });

  flushList("list-final");
  return <div>{blocks}</div>;
}
