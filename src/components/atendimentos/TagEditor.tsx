import { useState } from "react";
import { useTags, useConversationTags, useToggleConversationTag, useCreateTag } from "@/hooks/useTags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, X } from "lucide-react";

const TAG_COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

interface TagEditorProps {
  conversationId: string;
}

export function TagEditor({ conversationId }: TagEditorProps) {
  const { tags } = useTags();
  const { tagIds, refetch } = useConversationTags(conversationId);
  const toggleTag = useToggleConversationTag();
  const createTag = useCreateTag();
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);

  const activeTags = tags.filter(t => tagIds.includes(t.id));
  const availableTags = tags.filter(t => !tagIds.includes(t.id));

  const handleCreateAndAdd = async () => {
    if (!newTagName.trim()) return;
    const tag = await createTag.mutateAsync({ name: newTagName.trim(), color: newTagColor });
    if (tag) {
      await toggleTag.mutateAsync({ conversationId, tagId: (tag as any).id, add: true });
      refetch();
    }
    setNewTagName('');
  };

  return (
    <div className="space-y-2">
      {/* Active tags */}
      <div className="flex flex-wrap gap-1">
        {activeTags.map(tag => (
          <Badge
            key={tag.id}
            variant="secondary"
            className="text-xs gap-1 pr-1"
            style={{ backgroundColor: tag.color + '20', color: tag.color, borderColor: tag.color + '40' }}
          >
            {tag.name}
            <button
              onClick={() => {
                toggleTag.mutate({ conversationId, tagId: tag.id, add: false });
                refetch();
              }}
              className="ml-0.5 rounded-full hover:bg-foreground/10 p-0.5"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </Badge>
        ))}

        {/* Add tag popover */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-5 px-1.5 text-xs gap-0.5">
              <Plus className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            {/* Existing tags to add */}
            {availableTags.length > 0 && (
              <div className="space-y-1 mb-2">
                {availableTags.map(tag => (
                  <button
                    key={tag.id}
                    className="w-full text-left text-xs px-2 py-1 rounded hover:bg-accent flex items-center gap-2"
                    onClick={() => {
                      toggleTag.mutate({ conversationId, tagId: tag.id, add: true });
                      refetch();
                    }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                    {tag.name}
                  </button>
                ))}
              </div>
            )}

            {/* Create new tag */}
            <div className="border-t pt-2 space-y-1.5">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Nova tag..."
                className="h-7 text-xs"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateAndAdd()}
              />
              <div className="flex gap-1">
                {TAG_COLORS.map(c => (
                  <button
                    key={c}
                    className="h-4 w-4 rounded-full border-2"
                    style={{
                      backgroundColor: c,
                      borderColor: c === newTagColor ? 'hsl(var(--foreground))' : 'transparent',
                    }}
                    onClick={() => setNewTagColor(c)}
                  />
                ))}
              </div>
              <Button
                size="sm"
                className="w-full h-6 text-xs"
                disabled={!newTagName.trim() || createTag.isPending}
                onClick={handleCreateAndAdd}
              >
                Criar tag
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
