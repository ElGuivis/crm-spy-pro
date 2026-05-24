import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

export function useEmailImageUpload(onUploaded: (publicUrl: string, field: string) => void) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();
  const { tenantId } = useAuth();

  const upload = async (file: File, field: string) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo inválido", description: "Selecione uma imagem (JPEG, PNG, GIF, WebP).", variant: "destructive" });
      return;
    }
    if (!tenantId) {
      toast({ title: "Erro de autenticação", description: "Faça login novamente.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      // Tenant prefix for RLS isolation
      const path = `${tenantId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("email-images").upload(path, file, { upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("email-images").getPublicUrl(path);
      onUploaded(publicUrl, field);
      toast({ title: "Imagem enviada", description: "URL preenchida automaticamente." });
    } catch (err: unknown) {
      toast({ title: "Erro no upload", description: err instanceof Error ? err.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return { uploading, upload };
}
