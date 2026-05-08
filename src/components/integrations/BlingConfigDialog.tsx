import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Save, Loader2, RefreshCw, Info } from "lucide-react";
import { useBlingCodeMappings, DetectedCode } from "@/hooks/useBlingCodeMappings";
import { toast } from "sonner";

interface BlingConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integrationId: string;
  integrationName: string;
}

const COLOR_OPTIONS = [
  { value: "green", label: "Verde", className: "bg-green-500" },
  { value: "yellow", label: "Amarelo", className: "bg-yellow-500" },
  { value: "blue", label: "Azul", className: "bg-blue-500" },
  { value: "red", label: "Vermelho", className: "bg-red-500" },
  { value: "purple", label: "Roxo", className: "bg-purple-500" },
  { value: "orange", label: "Laranja", className: "bg-orange-500" },
  { value: "gray", label: "Cinza", className: "bg-gray-500" },
];

function MappingRow({
  item,
  mappingType,
  onSave,
  onDelete,
}: {
  item: DetectedCode;
  mappingType: 'order_status' | 'payment_method';
  onSave: (code: string, displayName: string, color?: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(item.existingMapping?.display_name || "");
  const [color, setColor] = useState(item.existingMapping?.color || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const hasChanges = 
    displayName !== (item.existingMapping?.display_name || "") ||
    color !== (item.existingMapping?.color || "");

  const handleSave = async () => {
    if (!displayName.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    setSaving(true);
    try {
      await onSave(item.code, displayName.trim(), color || undefined);
      toast.success("Mapeamento salvo!");
    } catch (error) {
      toast.error("Erro ao salvar mapeamento");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!item.existingMapping) return;
    setDeleting(true);
    try {
      await onDelete(item.existingMapping.id);
      setDisplayName("");
      setColor("");
      toast.success("Mapeamento removido!");
    } catch (error) {
      toast.error("Erro ao remover mapeamento");
    } finally {
      setDeleting(false);
    }
  };

  const colorOption = COLOR_OPTIONS.find(c => c.value === color);

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">
        {item.code}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {item.count}
      </TableCell>
      <TableCell>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Nome personalizado"
          className="h-8"
        />
      </TableCell>
      {mappingType === 'order_status' && (
        <TableCell>
          <Select value={color || "none"} onValueChange={(val) => setColor(val === "none" ? "" : val)}>
            <SelectTrigger className="h-8 w-28">
              <SelectValue placeholder="Cor">
                {colorOption && (
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${colorOption.className}`} />
                    {colorOption.label}
                  </div>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhuma</SelectItem>
              {COLOR_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${opt.className}`} />
                    {opt.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableCell>
      )}
      <TableCell>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleSave}
            disabled={saving || !displayName.trim()}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
          </Button>
          {item.existingMapping && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

export function BlingConfigDialog({
  open,
  onOpenChange,
  integrationId,
  integrationName,
}: BlingConfigDialogProps) {
  const {
    loading,
    detectedStatusCodes,
    detectedPaymentCodes,
    saveMapping,
    deleteMapping,
    refresh,
  } = useBlingCodeMappings(integrationId);

  const handleSaveStatus = async (code: string, displayName: string, color?: string) => {
    await saveMapping('order_status', code, displayName, color);
  };

  const handleSavePayment = async (code: string, displayName: string) => {
    await saveMapping('payment_method', code, displayName);
  };

  const handleDelete = async (id: string) => {
    await deleteMapping(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            ⚙️ Configurações do Bling
            <Badge variant="outline" className="font-normal">{integrationName}</Badge>
          </DialogTitle>
          <DialogDescription>
            Renomeie os códigos de status e formas de pagamento do Bling para exibição personalizada
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="status" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="status">Status de Venda</TabsTrigger>
            <TabsTrigger value="payment">Formas de Pagamento</TabsTrigger>
          </TabsList>

          <TabsContent value="status" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4" />
                <span>Códigos detectados dos pedidos sincronizados</span>
              </div>
              <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : detectedStatusCodes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhum código de status encontrado.</p>
                <p className="text-sm">Sincronize pedidos primeiro para detectar os códigos.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Código</TableHead>
                    <TableHead className="w-20">Qtd</TableHead>
                    <TableHead>Nome Personalizado</TableHead>
                    <TableHead className="w-32">Cor</TableHead>
                    <TableHead className="w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detectedStatusCodes.map((item) => (
                    <MappingRow
                      key={item.code}
                      item={item}
                      mappingType="order_status"
                      onSave={handleSaveStatus}
                      onDelete={handleDelete}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="payment" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Info className="h-4 w-4" />
                <span>Formas de pagamento detectadas dos pedidos</span>
              </div>
              <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </Button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : detectedPaymentCodes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhuma forma de pagamento encontrada.</p>
                <p className="text-sm">Sincronize pedidos primeiro para detectar os códigos.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Código Original</TableHead>
                    <TableHead className="w-20">Qtd</TableHead>
                    <TableHead>Nome Personalizado</TableHead>
                    <TableHead className="w-24">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detectedPaymentCodes.map((item) => (
                    <MappingRow
                      key={item.code}
                      item={item}
                      mappingType="payment_method"
                      onSave={handleSavePayment}
                      onDelete={handleDelete}
                    />
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
