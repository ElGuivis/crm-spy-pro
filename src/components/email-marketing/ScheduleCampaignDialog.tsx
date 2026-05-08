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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar, Info, Loader2 } from 'lucide-react';
import { useUpdateEmailCampaign } from '@/hooks/useEmailCampaigns';
import { format, addHours } from 'date-fns';

const formSchema = z.object({
  scheduled_at: z.string().min(1, 'Selecione data e hora').refine(
    (val) => new Date(val) > new Date(),
    { message: 'A data deve ser no futuro' }
  ),
});

interface ScheduleCampaignDialogProps {
  campaignId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Format current time + 1h for default
const getDefaultDateTime = () => {
  const d = addHours(new Date(), 1);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
};

export function ScheduleCampaignDialog({
  campaignId,
  open,
  onOpenChange,
}: ScheduleCampaignDialogProps) {
  const updateCampaign = useUpdateEmailCampaign();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      scheduled_at: getDefaultDateTime(),
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    await updateCampaign.mutateAsync({
      id: campaignId,
      updates: {
        scheduled_at: values.scheduled_at,
        status: 'scheduled' as const,
      },
    });
    onOpenChange(false);
    form.reset({ scheduled_at: getDefaultDateTime() });
  }

  const scheduledValue = form.watch('scheduled_at');
  const scheduledDate = scheduledValue ? new Date(scheduledValue) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Agendar Envio
          </DialogTitle>
          <DialogDescription>
            Defina a data e hora para envio da campanha.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="scheduled_at"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data e Hora</FormLabel>
                  <FormControl>
                    <Input type="datetime-local" {...field} />
                  </FormControl>
                  <FormDescription>
                    A campanha ficará com status "Agendada" até o envio manual ou automático.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {scheduledDate && scheduledDate > new Date() && (
              <Alert>
                <Calendar className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Campanha ficará agendada para{' '}
                  <strong>
                    {format(scheduledDate, "dd/MM/yyyy 'às' HH:mm")}
                  </strong>
                  .
                </AlertDescription>
              </Alert>
            )}

            <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
              <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <AlertDescription className="text-xs text-blue-700 dark:text-blue-300">
                A campanha será disparada automaticamente na data agendada. Você também pode disparar manualmente a qualquer momento através do menu "Revisar e Enviar".
              </AlertDescription>
            </Alert>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={updateCampaign.isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={updateCampaign.isPending} className="gap-2">
                {updateCampaign.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Agendando…
                  </>
                ) : (
                  <>
                    <Calendar className="h-4 w-4" />
                    Confirmar Agendamento
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
