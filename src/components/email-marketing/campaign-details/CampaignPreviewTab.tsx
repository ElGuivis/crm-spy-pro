import { TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink } from "lucide-react";

interface Props {
  isLoading: boolean;
  contentHtml?: string | null;
}

export function CampaignPreviewTab({ isLoading, contentHtml }: Props) {
  return (
    <TabsContent value="preview" className="flex-1 overflow-hidden mt-4">
      {isLoading ? (
        <Skeleton className="h-[400px]" />
      ) : contentHtml ? (
        <div className="border rounded-lg overflow-hidden h-[400px]">
          <iframe
            srcDoc={contentHtml}
            title="Email Preview"
            className="w-full h-full bg-white"
            sandbox="allow-same-origin"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground border rounded-lg h-[400px]">
          <ExternalLink className="h-10 w-10 mb-3" />
          <p>Nenhum conteúdo HTML disponível</p>
        </div>
      )}
    </TabsContent>
  );
}
