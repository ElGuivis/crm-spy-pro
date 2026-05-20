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
import { useBestSendTime } from '@/hooks/useBestSendTime';
import { format, addHours } from 'date-fns';
import { Sparkles } from 'lucide-react';

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
  const { topHours, topDays, totalOpens, bestHour } = useBestSendTime();

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

            {totalOpens > 0 && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/30 p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  Melhor horário — baseado em {totalOpens} aberturas (90 dias)
                </div>
                <div className="flex flex-wrap gap-2">
                  {topHours.map(h => (
                    <button
                      key={h.hour_of_day}
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        const target = new Date(now);
                        target.setHours(h.hour_of_day, 0, 0, 0);
                        if (target <= now) target.setDate(target.getDate() + 1);
                        const pad = (n: number) => String(n).padStart(2, '0');
                        form.setValue('scheduled_at', `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}T${pad(h.hour_of_day)}:00`);
                      }}
                      className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300 hover:bg-yellow-200 transition-colors"
                    >
                      {String(h.hour_of_day).padStart(2, '0')}h · {h.open_count} abert.
                    </button>
                  ))}
                  {topDays.map(d => (
                    <span key={d.day_of_week} className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300">
                      {d.day_label}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-yellow-600 dark:text-yellow-500">Clique em uma hora para preencher automaticamente</p>
              </div>
            )}

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
