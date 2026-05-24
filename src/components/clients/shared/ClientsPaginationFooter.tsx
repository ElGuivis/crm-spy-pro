import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPageNumbers } from "./clientsHelpers";

interface Props {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  displayCount: number;
  itemLabel?: string;
  onPageChange: (page: number) => void;
}

export function ClientsPaginationFooter({
  currentPage, pageSize, totalPages, displayCount, itemLabel = "clientes", onPageChange,
}: Props) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <p className="text-sm text-muted-foreground">
        Mostrando {((currentPage - 1) * pageSize) + 1} a {Math.min(currentPage * pageSize, displayCount)} de {displayCount.toLocaleString('pt-BR')} {itemLabel}
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline" size="icon" className="h-8 w-8"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {getPageNumbers(currentPage, totalPages).map((page, idx) => (
          typeof page === 'number' ? (
            <Button
              key={idx}
              variant={page === currentPage ? 'default' : 'outline'}
              size="icon" className="h-8 w-8"
              onClick={() => onPageChange(page)}
            >
              {page}
            </Button>
          ) : (
            <span key={idx} className="px-2 text-muted-foreground">...</span>
          )
        ))}

        <Button
          variant="outline" size="icon" className="h-8 w-8"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
