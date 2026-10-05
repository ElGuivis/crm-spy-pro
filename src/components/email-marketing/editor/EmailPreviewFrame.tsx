import { useRef, useState } from "react";
import type { EmailContent } from "./types";
import { generateEmailHTML } from "./htmlGenerator";
import { withPreviewSamples } from "./cartPreview";

interface Props {
  content: EmailContent;
  mode: "desktop" | "mobile";
  /** miniatura: só o e-mail em 600 px, sem margens (usado na galeria de modelos) */
  compact?: boolean;
}

/** Pré-visualização fiel: o e-mail completo (o mesmo HTML do envio) dentro de um iframe sem scripts. */
export function EmailPreviewFrame({ content, mode, compact }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);
  const html = withPreviewSamples(generateEmailHTML(content));

  const fit = () => {
    const doc = ref.current?.contentDocument;
    if (doc) setHeight(Math.max(400, doc.documentElement.scrollHeight));
  };

  const frame = (
    <iframe
      ref={ref}
      title="Pré-visualização do e-mail"
      srcDoc={html}
      sandbox="allow-same-origin"
      onLoad={fit}
      style={{ width: "100%", height, border: 0, pointerEvents: "none", display: "block" }}
    />
  );
  if (compact) return <div style={{ width: 600, background: "#fff" }}>{frame}</div>;

  return (
    <div className="p-8 bg-muted/30">
      <div className={`mx-auto bg-white rounded-lg shadow-sm transition-all overflow-hidden ${mode === "desktop" ? "max-w-[680px]" : "max-w-[375px]"}`}>
        {frame}
      </div>
    </div>
  );
}
