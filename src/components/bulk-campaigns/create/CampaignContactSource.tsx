import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, TrendingUp, Loader2, CheckCircle } from "lucide-react";
import { useAllRFMAudiences } from "@/hooks/useAllRFMAudiences";
import type { ContactRow } from "../types";

interface Props {
  source: "csv" | "rfm";
  onSourceChange: (s: "csv" | "rfm") => void;
  fileName: string;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedRfmAudienceId: string;
  onRfmAudienceChange: (id: string) => void;
  loadingRfmContacts: boolean;
  contacts: ContactRow[];
  onClearContacts: () => void;
}

export function CampaignContactSource({
  source, onSourceChange, fileName, onFileUpload,
  selectedRfmAudienceId, onRfmAudienceChange, loadingRfmContacts,
  contacts, onClearContacts,
}: Props) {
  const { data: rfmAudiences, isLoading: loadingRfmAudiences } = useAllRFMAudiences();

  const downloadTemplate = () => {
    const csvContent = ["Nome,Telefone,Email,Cidade", "João Silva,11999998888,joao@email.com,São Paulo", "Maria Souza,21988887777,maria@email.com,Rio de Janeiro", "Pedro Santos,31977776666,pedro@email.com,Belo Horizonte"].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = u; a.download = "modelo-disparos.csv"; a.click();
    URL.revokeObjectURL(u);
  };

  return (
    <div className="space-y-3">
      <Label>Fonte de contatos</Label>
      <Tabs value={source} onValueChange={(v) => { onSourceChange(v as "csv" | "rfm"); onClearContacts(); }}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="csv" className="gap-2"><FileSpreadsheet className="h-4 w-4" />Planilha CSV</TabsTrigger>
          <TabsTrigger value="rfm" className="gap-2"><TrendingUp className="h-4 w-4" />Audiência RFM</TabsTrigger>
        </TabsList>
        <TabsContent value="csv" className="mt-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Lista de contatos (CSV)</span>
            <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs gap-1 text-primary" onClick={downloadTemplate}>
              <FileSpreadsheet className="h-3.5 w-3.5" />Baixar modelo
            </Button>
          </div>
          <div className="border-2 border-dashed border-border/50 rounded-lg p-6 text-center hover:border-primary/30 transition-colors">
            <input type="file" accept=".csv,.txt" onChange={onFileUpload} className="hidden" id="excel-upload" />
            <label htmlFor="excel-upload" className="cursor-pointer space-y-2 block">
              <FileSpreadsheet className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm font-medium text-foreground">{fileName || "Clique para enviar planilha"}</p>
              <p className="text-xs text-muted-foreground">Excel (.xlsx, .xls) ou CSV — colunas extras viram variáveis</p>
            </label>
          </div>
        </TabsContent>
        <TabsContent value="rfm" className="mt-3 space-y-3">
          {loadingRfmAudiences ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />Carregando audiências...
            </div>
          ) : !rfmAudiences || rfmAudiences.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhuma audiência RFM cadastrada.</p>
              <p className="text-xs">Crie audiências na Matriz RFM.</p>
            </div>
          ) : (
            <>
              <Select value={selectedRfmAudienceId} onValueChange={onRfmAudienceChange}>
                <SelectTrigger><SelectValue placeholder="Selecione uma audiência RFM" /></SelectTrigger>
                <SelectContent>
                  {rfmAudiences.map((aud) => (
                    <SelectItem key={aud.id} value={aud.id}>{aud.name} ({aud.member_count} membros) — {aud.integration_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {loadingRfmContacts && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />Carregando contatos...
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
      {contacts.length > 0 && (
        <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/10">
          <CheckCircle className="h-4 w-4 text-primary" />
          <span className="text-sm text-foreground font-medium">{contacts.length} contatos válidos encontrados</span>
          <span className="text-xs text-muted-foreground ml-auto">Custo: {contacts.length * 2} tokens</span>
        </div>
      )}
    </div>
  );
}
