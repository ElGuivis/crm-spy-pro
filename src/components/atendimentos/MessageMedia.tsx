import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface MessageMediaProps {
  path: string;
  contentType: string;
}

/** Midia do cliente guardada no bucket privado chat-media (o webhook grava o caminho, nao uma URL). */
export function MessageMedia({ path, contentType }: MessageMediaProps) {
  const { data: url } = useQuery({
    queryKey: ["chat-media-url", path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("chat-media").createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
    staleTime: 1000 * 60 * 50,
    enabled: !path.startsWith("http"),
  });

  if (path.startsWith("http")) return null; // URL cifrada do WhatsApp: nao abre no navegador
  if (!url) return <div className="h-24 w-40 rounded bg-muted/60 animate-pulse mb-1" />;

  if (contentType === "image") return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Imagem recebida" className="max-h-64 rounded mb-1" loading="lazy" /></a>;
  if (contentType === "audio") return <audio controls src={url} className="max-w-full mb-1" preload="none" />;
  if (contentType === "video") return <video controls src={url} className="max-h-64 rounded mb-1" preload="none" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm underline mb-1">
      <FileText className="h-4 w-4" /> Abrir arquivo
    </a>
  );
}
