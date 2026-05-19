import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, BarChart2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export interface ContentPost {
  id: string;
  content_type: string;
  caption: string | null;
  media_urls: string[];
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  ig_media_id: string | null;
  ig_permalink: string | null;
  error_message: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  channelId: string;
  post?: ContentPost | null;
  defaultDate?: Date | null;
}

function toLocalDatetime(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T12:00`;
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho", scheduled: "Agendado", publishing: "Publicando",
  published: "Publicado", failed: "Falhou",
};

export function ContentPostDialog({ open, onOpenChange, channelId, post, defaultDate }: Props) {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  const [contentType, setContentType] = useState("image");
  const [caption, setCaption] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [scheduleAt, setScheduleAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [analytics, setAnalytics] = useState<Record<string, number> | null>(null);
  const [imgError, setImgError] = useState(false);

  const isEditing = !!post;
  const isPublished = post?.status === "published";

  useEffect(() => {
    if (!open) return;
    setContentType(post?.content_type ?? "image");
    setCaption(post?.caption ?? "");
    setMediaUrl(post?.media_urls?.[0] ?? "");
    setScheduleAt(
      post?.scheduled_at
        ? post.scheduled_at.slice(0, 16)
        : defaultDate
        ? toLocalDatetime(defaultDate)
        : "",
    );
    setAnalytics(null);
    setImgError(false);
  }, [open, post, defaultDate]);

  const upsertContent = async (status: string, scheduledAt?: string) => {
    const row = {
      tenant_id: tenantId!,
      channel_id: channelId,
      content_type: contentType,
      caption: caption.trim() || null,
      media_urls: mediaUrl.trim() ? [mediaUrl.trim()] : [],
      status,
      scheduled_at: scheduledAt ?? null,
    };
    if (isEditing) {
      const { data, error } = await supabase.from("instagram_content" as any)
        .update(row).eq("id", post.id).select().single();
      if (error) throw error;
      return data as ContentPost;
    } else {
      const { data, error } = await supabase.from("instagram_content" as any)
        .insert(row).select().single();
      if (error) throw error;
      return data as ContentPost;
    }
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ig-content", channelId] });

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await upsertContent("draft");
      toast.success("Rascunho salvo");
      invalidate();
      onOpenChange(false);
    } catch { toast.error("Erro ao salvar"); }
    finally { setSaving(false); }
  };

  const handleSchedule = async () => {
    if (!scheduleAt) { toast.error("Selecione data e hora"); return; }
    const dt = new Date(scheduleAt);
    if (dt <= new Date()) { toast.error("Data deve ser no futuro"); return; }
    setSaving(true);
    try {
      const saved = await upsertContent("draft");
      const { error } = await supabase.functions.invoke("instagram-schedule-content", {
        body: { content_id: saved.id, scheduled_at: dt.toISOString() },
      });
      if (error) throw error;
      toast.success("Post agendado");
      invalidate();
      onOpenChange(false);
    } catch { toast.error("Erro ao agendar"); }
    finally { setSaving(false); }
  };

  const handlePublishNow = async () => {
    if (!mediaUrl.trim()) { toast.error("Informe a URL da mídia"); return; }
    setSaving(true);
    try {
      const saved = await upsertContent("draft");
      const { error } = await supabase.functions.invoke("instagram-publish-content", {
        body: { content_id: saved.id },
      });
      if (error) throw error;
      toast.success("Publicação iniciada — pode levar alguns segundos");
      invalidate();
      onOpenChange(false);
    } catch { toast.error("Erro ao publicar"); }
    finally { setSaving(false); }
  };

  const loadAnalytics = async () => {
    if (!post?.ig_media_id) return;
    const { data } = await supabase.from("instagram_media_insights" as any)
      .select("reach,impressions,likes,comments,saves,shares,plays")
      .eq("ig_media_id", post.ig_media_id)
      .maybeSingle();
    setAnalytics((data as Record<string, number>) ?? {});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Post" : "Novo Post"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {isEditing && (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={isPublished ? "default" : "secondary"} className="text-xs">
                {STATUS_LABEL[post.status] ?? post.status}
              </Badge>
              {post.ig_permalink && (
                <a href={post.ig_permalink} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                  Ver no Instagram <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {post.error_message && (
                <p className="text-xs text-destructive w-full">{post.error_message}</p>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Tipo</Label>
            <Select value={contentType} onValueChange={setContentType} disabled={isPublished}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="image">Imagem</SelectItem>
                <SelectItem value="video">Vídeo</SelectItem>
                <SelectItem value="reel">Reel</SelectItem>
                <SelectItem value="carousel">Carrossel</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">URL da mídia (publicamente acessível)</Label>
            <Input value={mediaUrl} onChange={e => { setMediaUrl(e.target.value); setImgError(false); }}
              placeholder="https://…" className="h-8 text-sm" disabled={isPublished} />
            {mediaUrl && !imgError && (
              <div className="mt-1.5 rounded-lg overflow-hidden border bg-muted w-24 h-24 shrink-0">
                <img src={mediaUrl} alt="preview" className="w-full h-full object-cover"
                  onError={() => setImgError(true)} />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Legenda</Label>
            <Textarea value={caption} onChange={e => setCaption(e.target.value)}
              placeholder="Escreva a legenda do post…"
              className="text-sm resize-none h-20" disabled={isPublished} />
            <p className="text-[10px] text-muted-foreground text-right">{caption.length}/2200</p>
          </div>

          {!isPublished && (
            <div className="space-y-1">
              <Label className="text-xs">Agendar para</Label>
              <Input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)}
                className="h-8 text-sm" />
            </div>
          )}

          {isPublished && post?.ig_media_id && (
            <div className="space-y-2">
              <Button variant="outline" size="sm" onClick={loadAnalytics} className="h-7 text-xs gap-1.5">
                <BarChart2 className="h-3.5 w-3.5" />
                Ver Analytics
              </Button>
              {analytics !== null && Object.keys(analytics).length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(analytics).filter(([, v]) => v > 0).map(([k, v]) => (
                    <div key={k} className="text-center p-2 rounded-lg bg-muted">
                      <p className="text-sm font-semibold">{v.toLocaleString("pt-BR")}</p>
                      <p className="text-[10px] text-muted-foreground capitalize">{k}</p>
                    </div>
                  ))}
                </div>
              )}
              {analytics !== null && Object.keys(analytics).length === 0 && (
                <p className="text-xs text-muted-foreground">Ainda sem dados de insights.</p>
              )}
            </div>
          )}

          {!isPublished && (
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="ghost" size="sm" onClick={handleSaveDraft} disabled={saving} className="h-8 text-xs">
                Rascunho
              </Button>
              <Button variant="outline" size="sm" onClick={handleSchedule}
                disabled={saving || !scheduleAt} className="h-8 text-xs">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Agendar"}
              </Button>
              <Button size="sm" onClick={handlePublishNow}
                disabled={saving || !mediaUrl.trim()} className="h-8 text-xs">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Publicar agora"}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
