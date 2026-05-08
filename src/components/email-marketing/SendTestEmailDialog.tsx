import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

import { createLogger } from '@/lib/logger';
const log = createLogger('SendTestEmailDialog');

const formSchema = z.object({
  emails: z
    .string()
    .min(1, 'Digite pelo menos um e-mail')
    .refine(
      (value) => {
        const emails = value.split(',').map((e) => e.trim());
        return emails.every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
      },
      { message: 'Um ou mais e-mails são inválidos' }
    ),
});

interface SendTestEmailDialogProps {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SendTestEmailDialog({
  campaignId,
  open,
  onOpenChange,
}: SendTestEmailDialogProps) {
  const [sending, setSending] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      emails: '',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setSending(true);
    
    try {
      const emails = values.emails.split(',').map((e) => e.trim());

      const { data, error } = await supabase.functions.invoke('email-campaign-send-test', {
        body: {
          campaign_id: campaignId,
          test_emails: emails,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success(`Teste enviado para ${emails.length} endereço(s)`);
        onOpenChange(false);
        form.reset();
      } else {
        throw new Error(data?.error || 'Erro ao enviar teste');
      }
    } catch (error: any) {
      log.error('Error sending test:', error);
      toast.error(error.message || 'Erro ao enviar teste');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar E-mail de Teste</DialogTitle>
          <DialogDescription>
            Digite um ou mais e-mails separados por vírgula para receber uma versão de teste da
            campanha.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="emails"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mails</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="email1@exemplo.com, email2@exemplo.com"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Separe múltiplos e-mails com vírgula
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={sending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={sending}>
                {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar Teste
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
