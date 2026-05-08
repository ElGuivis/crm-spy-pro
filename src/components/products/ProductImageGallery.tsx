import { useState } from "react";
import { Package, ChevronLeft, ChevronRight, X, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface ImageData {
  link: string;
  tipo?: string;
  validade?: string;
}

interface ProductImageGalleryProps {
  images: ImageData[] | null;
  fallbackUrl?: string | null;
  productName: string;
}

export function ProductImageGallery({ images, fallbackUrl, productName }: ProductImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  // Build the final image list
  const imageList: string[] = [];
  if (images && images.length > 0) {
    images.forEach((img, index) => {
      if (img.link && !imageErrors.has(index)) {
        imageList.push(img.link);
      }
    });
  }
  if (imageList.length === 0 && fallbackUrl) {
    imageList.push(fallbackUrl);
  }

  const handleImageError = (index: number) => {
    setImageErrors(prev => new Set([...prev, index]));
  };

  const nextImage = () => {
    setSelectedIndex((prev) => (prev + 1) % imageList.length);
  };

  const prevImage = () => {
    setSelectedIndex((prev) => (prev - 1 + imageList.length) % imageList.length);
  };

  if (imageList.length === 0) {
    return (
      <div className="aspect-square bg-muted flex items-center justify-center rounded-lg">
        <Package className="h-16 w-16 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main Image */}
      <div 
        className="relative aspect-square bg-muted rounded-lg overflow-hidden cursor-pointer group"
        onClick={() => setLightboxOpen(true)}
      >
        <img
          src={imageList[selectedIndex]}
          alt={`${productName} - Imagem ${selectedIndex + 1}`}
          className="w-full h-full object-contain"
          onError={() => handleImageError(selectedIndex)}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
          <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        
        {/* Navigation arrows */}
        {imageList.length > 1 && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
              onClick={(e) => {
                e.stopPropagation();
                prevImage();
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background"
              onClick={(e) => {
                e.stopPropagation();
                nextImage();
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        )}
        
        {/* Image counter */}
        {imageList.length > 1 && (
          <div className="absolute bottom-2 right-2 bg-background/80 px-2 py-1 rounded text-xs">
            {selectedIndex + 1} / {imageList.length}
          </div>
        )}
      </div>

      {/* Thumbnails */}
      {imageList.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {imageList.map((url, index) => (
            <button
              key={index}
              onClick={() => setSelectedIndex(index)}
              className={`flex-shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-colors ${
                index === selectedIndex ? 'border-primary' : 'border-transparent hover:border-muted-foreground/50'
              }`}
            >
              <img
                src={url}
                alt={`${productName} - Miniatura ${index + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-4xl p-0 bg-black/95">
          <div className="relative">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 text-white hover:bg-white/20 z-10"
              onClick={() => setLightboxOpen(false)}
            >
              <X className="h-6 w-6" />
            </Button>
            
            <div className="flex items-center justify-center min-h-[60vh]">
              <img
                src={imageList[selectedIndex]}
                alt={`${productName} - Imagem ${selectedIndex + 1}`}
                className="max-h-[80vh] max-w-full object-contain"
              />
            </div>
            
            {imageList.length > 1 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                  onClick={prevImage}
                >
                  <ChevronLeft className="h-8 w-8" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:bg-white/20"
                  onClick={nextImage}
                >
                  <ChevronRight className="h-8 w-8" />
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
