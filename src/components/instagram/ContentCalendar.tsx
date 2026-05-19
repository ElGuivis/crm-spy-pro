import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContentPostDialog, type ContentPost } from "./ContentPostDialog";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const STATUS_COLOR: Record<string, string> = {
  draft:      "bg-gray-400",
  scheduled:  "bg-blue-500",
  publishing: "bg-yellow-500",
  published:  "bg-green-500",
  failed:     "bg-red-500",
};

const STATUS_LABEL: Record<string, string> = {
  draft:      "Rascunho",
  scheduled:  "Agendado",
  publishing: "Publicando",
  published:  "Publicado",
  failed:     "Falhou",
};

function effectiveDate(p: ContentPost): string | null {
  return p.scheduled_at ?? p.published_at;
}

interface Props {
  channelId: string;
}

export function ContentCalendar({ channelId }: Props) {
  const { tenantId } = useAuth();

  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedPost, setSelectedPost] = useState<ContentPost | null>(null);
  const [newPostDate, setNewPostDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const { data: posts = [] } = useQuery<ContentPost[]>({
    queryKey: ["ig-content", channelId],
    queryFn: async () => {
      const { data } = await supabase
        .from("instagram_content" as any)
        .select(
          "id,content_type,caption,media_urls,status,scheduled_at,published_at,ig_media_id,ig_permalink,error_message",
        )
        .eq("channel_id", channelId)
        .eq("tenant_id", tenantId!)
        .order("scheduled_at", { ascending: true, nullsFirst: false })
        .limit(500);
      return (data as ContentPost[]) ?? [];
    },
    enabled: !!channelId && !!tenantId,
  });

  // Calendar grid
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const cells: (Date | null)[] = [
    ...Array<null>(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  // Index posts by day-string for the current month
  const postsByDay: Record<string, ContentPost[]> = {};
  for (const p of posts) {
    const d = effectiveDate(p);
    if (!d) continue;
    const dayKey = d.slice(0, 10);
    const [py, pm] = dayKey.split("-").map(Number);
    if (py !== year || pm - 1 !== month) continue;
    (postsByDay[dayKey] ??= []).push(p);
  }

  const todayStr = new Date().toDateString();

  const openNew = (day: Date) => {
    setSelectedPost(null);
    setNewPostDate(day);
    setDialogOpen(true);
  };
  const openPost = (p: ContentPost, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPost(p);
    setNewPostDate(null);
    setDialogOpen(true);
  };

  const monthLabel = currentMonth.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="space-y-3">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-semibold capitalize">{monthLabel}</span>
        <Button variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 text-center">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-[10px] font-medium text-muted-foreground py-1">{d}</div>
        ))}
      </div>

      {/* Calendar weeks */}
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day, di) => {
              if (!day) return <div key={di} className="min-h-[68px]" />;
              const p2 = (n: number) => String(n).padStart(2, "0");
              const dayKey = `${year}-${p2(month + 1)}-${p2(day.getDate())}`;
              const dayPosts = postsByDay[dayKey] ?? [];
              const isToday = day.toDateString() === todayStr;
              return (
                <div
                  key={di}
                  onClick={() => openNew(day)}
                  className={cn(
                    "min-h-[68px] rounded-lg border p-1 cursor-pointer hover:bg-muted/50 transition-colors",
                    isToday ? "border-primary bg-primary/5" : "border-border/50",
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={cn(
                      "text-[11px] font-medium w-5 h-5 flex items-center justify-center rounded-full",
                      isToday ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}>
                      {day.getDate()}
                    </span>
                    {dayPosts.length === 0 && (
                      <Plus className="h-3 w-3 text-muted-foreground/30" />
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {dayPosts.slice(0, 3).map(p => (
                      <button
                        key={p.id}
                        onClick={e => openPost(p, e)}
                        title={`${STATUS_LABEL[p.status] ?? p.status}${p.caption ? `: ${p.caption}` : ""}`}
                        className={cn(
                          "w-full text-left text-[9px] text-white rounded px-1 py-0.5 truncate leading-tight",
                          STATUS_COLOR[p.status] ?? "bg-gray-400",
                        )}
                      >
                        {p.content_type}
                      </button>
                    ))}
                    {dayPosts.length > 3 && (
                      <p className="text-[9px] text-muted-foreground pl-0.5">+{dayPosts.length - 3}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1">
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <div key={k} className="flex items-center gap-1.5">
            <div className={cn("w-2 h-2 rounded-full shrink-0", STATUS_COLOR[k])} />
            <span className="text-[10px] text-muted-foreground">{v}</span>
          </div>
        ))}
      </div>

      <ContentPostDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        channelId={channelId}
        post={selectedPost}
        defaultDate={newPostDate}
      />
    </div>
  );
}
