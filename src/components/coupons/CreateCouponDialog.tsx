import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Percent, DollarSign } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { createLogger } from '@/lib/logger';
const log = createLogger('CreateCouponDialog');

const couponSchema = z.object({
  codigo: z.string()
    .min(3, "Código deve ter pelo menos 3 caracteres")
    .max(20, "Código deve ter no máximo 20 caracteres")
    .regex(/^[A-Za-z0-9_-]+$/, "Código deve conter apenas letras, números, _ e -"),
  tipo: z.enum(["porcentagem", "valor_absoluto"]),
  valor: z.number()
    .min(0.01, "Valor deve ser maior que zero")
    .max(100000, "Valor muito alto"),
  dataInicio: z.string().optional(),
  dataFim: z.string().optional(),
  quantidadeUsoMaximo: z.number().min(1).max(10000).optional().nullable(),
  descricao: z.string().max(200, "Descrição muito longa").optional(),
}).refine((data) => {
  if (data.tipo === "porcentagem" && data.valor > 100) {
    return false;
  }
  return true;
}, {
  message: "Porcentagem não pode ser maior que 100%",
  path: ["valor"],
});

type CouponFormData = z.infer<typeof couponSchema>;

interface CreateCouponDialogProps {
  integrationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const CreateCouponDialog = ({ 
  integrationId, 
  open, 
  onOpenChange, 
  onSuccess 
}: CreateCouponDialogProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<CouponFormData>({
    resolver: zodResolver(couponSchema),
    defaultValues: {
      codigo: "",
      tipo: "porcentagem",
      valor: 10,
      dataInicio: new Date().toISOString().split('T')[0],
      dataFim: "",
      quantidadeUsoMaximo: null,
      descricao: "",
    },
  });

  const selectedType = form.watch("tipo");

  const onSubmit = async (data: CouponFormData) => {
    setIsSubmitting(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('li-coupon-create', {
        body: {
          integrationId,
          codigo: data.codigo,
          tipo: data.tipo,
          valor: data.valor,
          dataInicio: data.dataInicio || undefined,
          dataFim: data.dataFim || undefined,
          quantidadeUsoMaximo: data.quantidadeUsoMaximo || undefined,
          descricao: data.descricao || undefined,
        }
      });

      if (error) throw error;
      
      if (!result.success) {
        throw new Error(result.error || 'Erro ao criar cupom');
      }

      toast({
        title: "Cupom criado com sucesso!",
        description: `O cupom ${data.codigo.toUpperCase()} foi criado na Loja Integrada.`,
      });

      form.reset();
      onOpenChange(false);
      onSuccess();
    } catch (error) {
      log.error('Error creating coupon:', error);
      toast({
        title: "Erro ao criar cupom",
        description: error instanceof Error ? error.message : "Não foi possível criar o cupom.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Criar Novo Cupom
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="codigo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código do Cupom *</FormLabel>
                  <FormControl>
                    <Input 
                      {...field} 
                      placeholder="Ex: DESCONTO10" 
                      className="uppercase"
                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tipo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Desconto *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="porcentagem">
                          <span className="flex items-center gap-2">
                            <Percent className="h-4 w-4" />
                            Porcentagem
                          </span>
                        </SelectItem>
                        <SelectItem value="valor_absoluto">
                          <span className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            Valor Fixo
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="valor"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Valor {selectedType === "porcentagem" ? "(%)" : "(R$)"} *
                    </FormLabel>
                    <FormControl>
                      <Input 
                        type="number" 
                        step={selectedType === "porcentagem" ? "1" : "0.01"}
                        min="0.01"
                        max={selectedType === "porcentagem" ? "100" : "100000"}
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="dataInicio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Início</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dataFim"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data Fim</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="quantidadeUsoMaximo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Limite de Usos (opcional)</FormLabel>
                  <FormControl>
                    <Input 
                      type="number" 
                      min="1" 
                      placeholder="Ilimitado"
                      {...field}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descricao"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição (opcional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="Descrição interna do cupom"
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Cupom
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
