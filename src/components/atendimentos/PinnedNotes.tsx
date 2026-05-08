import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pin, Plus, Trash2, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface PinnedNotesProps {
  conversationId: string;
}

interface Note {
  id: string;
  content: string;
  created_at: string;
  author_name: string | null;
}

export function PinnedNotes({ conversationId }: PinnedNotesProps) {
  const { tenantId, user } = useAuth();
  const queryClient = useQueryClient();
  const [newNote, setNewNote] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['pinned-notes', conversationId],
    queryFn: async () => {
      // Fetch internal notes (messages with direction = 'internal_note' and pinned)
      // We'll use messages table with type 'note' and a pinned flag, or just use internal_note messages
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, created_at, sender_type')
        .eq('conversation_id', conversationId)
        .eq('direction', 'internal_note')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []).map((m: any) => ({
        id: m.id,
        content: m.content,
        created_at: m.created_at,
        author_name: m.sender_type === 'agent' ? 'Atendente' : 'Sistema',
      })) as Note[];
    },
    enabled: !!conversationId,
  });

  const addNote = useMutation({
    mutationFn: async (content: string) => {
      if (!tenantId || !user) throw new Error('Not auth');
      const { error } = await supabase.from('messages').insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        content,
        content_type: 'text',
        sender_type: 'agent',
        direction: 'internal_note',
        type: 'text',
        status: 'sent',
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pinned-notes', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['atendimentos-messages', conversationId] });
      setNewNote('');
      setIsAdding(false);
      toast.success('Nota adicionada');
    },
    onError: () => toast.error('Erro ao salvar nota'),
  });

  const handleAdd = useCallback(() => {
    if (!newNote.trim()) return;
    addNote.mutate(newNote.trim());
  }, [newNote, addNote]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
          <Pin className="h-3 w-3" />
          Notas internas
        </h4>
        {!isAdding && (
          <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs" onClick={() => setIsAdding(true)}>
            <Plus className="h-3 w-3 mr-0.5" />
            Nova
          </Button>
        )}
      </div>

      {/* Add note form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-1.5">
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Escreva uma nota..."
                className="min-h-[60px] text-xs resize-none border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAdd();
                  if (e.key === 'Escape') { setIsAdding(false); setNewNote(''); }
                }}
                autoFocus
              />
              <div className="flex items-center gap-1.5">
                <Button size="sm" className="h-6 text-xs" onClick={handleAdd} disabled={!newNote.trim() || addNote.isPending}>
                  {addNote.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => { setIsAdding(false); setNewNote(''); }}>
                  Cancelar
                </Button>
                <span className="text-[10px] text-muted-foreground ml-auto">Ctrl+Enter</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notes list */}
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="rounded-lg bg-amber-50/50 dark:bg-amber-900/10 p-2 animate-pulse">
              <div className="h-3 w-3/4 rounded bg-muted shimmer" />
              <div className="h-2.5 w-1/3 rounded bg-muted shimmer mt-1.5" />
            </div>
          ))}
        </div>
      ) : notes.length === 0 && !isAdding ? (
        <p className="text-[10px] text-muted-foreground italic">Nenhuma nota interna</p>
      ) : (
        <div className="space-y-1.5">
          {notes.slice(0, 5).map((note, i) => (
            <motion.div
              key={note.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10 p-2 group"
            >
              <p className="text-xs text-foreground whitespace-pre-wrap break-words">{note.content}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[10px] text-muted-foreground">
                  {note.author_name} · {formatDistanceToNow(new Date(note.created_at), { addSuffix: true, locale: ptBR })}
                </span>
              </div>
            </motion.div>
          ))}
          {notes.length > 5 && (
            <p className="text-[10px] text-muted-foreground text-center">+{notes.length - 5} notas anteriores</p>
          )}
        </div>
      )}
    </div>
  );
}
