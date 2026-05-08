import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Image, Film, CheckCircle2, ExternalLink } from 'lucide-react';
import { useInstagramMedia, type InstagramMedia } from '@/hooks/useInstagramMedia';

interface MediaSelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mediaType: 'post' | 'reel';
  selectedMediaIds: string[];
  onSelect: (media: InstagramMedia) => void;
}

export function MediaSelectorDialog({ open, onOpenChange, mediaType, selectedMediaIds, onSelect }: MediaSelectorDialogProps) {
  const { media, isLoading, hasMore, fetchMedia } = useInstagramMedia();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (open && !loaded) {
      fetchMedia(mediaType);
      setLoaded(true);
    }
  }, [open, loaded, mediaType, fetchMedia]);

  useEffect(() => {
    if (!open) setLoaded(false);
  }, [open]);

  const formatDate = (ts: string | null) => {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mediaType === 'post' ? <Image className="h-5 w-5" /> : <Film className="h-5 w-5" />}
            Selecionar {mediaType === 'post' ? 'Post' : 'Reel'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {isLoading && media.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : media.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nenhum {mediaType === 'post' ? 'post' : 'reel'} encontrado.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {media.map((item) => {
                const isSelected = selectedMediaIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onSelect(item); onOpenChange(false); }}
                    className={`relative rounded-lg overflow-hidden border-2 transition-all text-left group ${
                      isSelected
                        ? 'border-primary ring-2 ring-primary/20'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-muted relative">
                      {item.thumbnail_url ? (
                        <img
                          src={item.thumbnail_url}
                          alt={item.caption || 'Instagram media'}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          {mediaType === 'reel' ? <Film className="h-8 w-8 text-muted-foreground" /> : <Image className="h-8 w-8 text-muted-foreground" />}
                        </div>
                      )}

                      {isSelected && (
                        <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                          <CheckCircle2 className="h-8 w-8 text-primary" />
                        </div>
                      )}

                      {/* Type badge */}
                      <Badge variant="secondary" className="absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0">
                        {item.media_type === 'VIDEO' ? 'Reel' : item.media_type === 'CAROUSEL_ALBUM' ? 'Carrossel' : 'Post'}
                      </Badge>
                    </div>

                    {/* Caption */}
                    <div className="p-2 space-y-0.5">
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {item.caption || 'Sem legenda'}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground/70">{formatDate(item.timestamp)}</span>
                        {item.permalink && (
                          <a
                            href={item.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-muted-foreground/70 hover:text-primary"
                          >
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {hasMore && (
            <div className="flex justify-center pt-2 pb-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchMedia(mediaType, true)}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Carregar mais
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
