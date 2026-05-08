import { useState, useEffect } from "react";
import { Clock, CheckCircle, AlertCircle, RefreshCw, Timer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, addMinutes, differenceInSeconds } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { createLogger } from '@/lib/logger';
const log = createLogger('CronStatusIndicator');

interface CronJob {
  jobid: number;
  schedule: string;
  active: boolean;
  jobname: string;
}

interface CronJobRun {
  runid: number;
  job_pid: number | null;
  status: string;
  start_time: string;
  end_time: string | null;
  return_message: string | null;
}

// Parse cron schedule to get interval in minutes
const getCronIntervalMinutes = (schedule: string): number => {
  // Handle "* * * * *" = every minute
  if (schedule.startsWith('* ')) {
    return 1;
  }
  // Handle "*/N * * * *" = every N minutes
  const match = schedule.match(/^\*\/(\d+)\s/);
  if (match) {
    return parseInt(match[1], 10);
  }
  // Default to 1 minute if we can't parse
  return 1;
};

export const CronStatusIndicator = () => {
  const [cronJob, setCronJob] = useState<CronJob | null>(null);
  const [lastRun, setLastRun] = useState<CronJobRun | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [nextRunCountdown, setNextRunCountdown] = useState<string | null>(null);

  const fetchCronStatus = async () => {
    try {
      // Fetch cron job info
      const { data: jobData } = await supabase.rpc('get_cron_job_status');
      
      if (jobData && Array.isArray(jobData) && jobData.length > 0) {
        setCronJob(jobData[0]);
      }

      // Fetch last run
      const { data: runData } = await supabase.rpc('get_cron_last_run');
      
      if (runData && Array.isArray(runData) && runData.length > 0) {
        setLastRun(runData[0]);
      }
    } catch (error) {
      log.error("Error fetching cron status:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate and update countdown to next run
  useEffect(() => {
    if (!cronJob || !lastRun?.end_time) {
      setNextRunCountdown(null);
      return;
    }

    const updateCountdown = () => {
      const intervalMinutes = getCronIntervalMinutes(cronJob.schedule);
      const lastRunTime = new Date(lastRun.end_time!);
      const nextRunTime = addMinutes(lastRunTime, intervalMinutes);
      const now = new Date();
      const secondsUntilNext = differenceInSeconds(nextRunTime, now);

      if (secondsUntilNext <= 0) {
        setNextRunCountdown("em breve");
      } else if (secondsUntilNext < 60) {
        setNextRunCountdown(`${secondsUntilNext}s`);
      } else {
        const minutes = Math.ceil(secondsUntilNext / 60);
        setNextRunCountdown(`${minutes}min`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [cronJob, lastRun]);

  useEffect(() => {
    fetchCronStatus();
    
    // Refresh every minute
    const interval = setInterval(fetchCronStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
        <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-muted-foreground">Carregando status...</span>
      </div>
    );
  }

  if (!cronJob) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
        <AlertCircle className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">Cron não configurado</span>
      </div>
    );
  }

  const isActive = cronJob.active;
  const lastRunSuccess = lastRun?.status === "succeeded";
  const lastRunTime = lastRun?.end_time || lastRun?.start_time;
  const intervalMinutes = getCronIntervalMinutes(cronJob.schedule);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
            isActive 
              ? "border-green-500/30 bg-green-500/10" 
              : "border-yellow-500/30 bg-yellow-500/10"
          }`}>
            <div className="flex items-center gap-1.5">
              {isActive ? (
                <CheckCircle className="h-4 w-4 text-green-500" />
              ) : (
                <AlertCircle className="h-4 w-4 text-yellow-500" />
              )}
              <span className={isActive ? "text-green-700 dark:text-green-400" : "text-yellow-700 dark:text-yellow-400"}>
                Auto-sync {isActive ? "ativo" : "inativo"}
              </span>
            </div>
            
            {isActive && nextRunCountdown && (
              <>
                <span className="text-muted-foreground">•</span>
                <div className="flex items-center gap-1.5">
                  <Timer className="h-3.5 w-3.5 text-primary" />
                  <span className="text-primary font-medium">
                    Próxima: {nextRunCountdown}
                  </span>
                </div>
              </>
            )}
            
            {lastRunTime && (
              <>
                <span className="text-muted-foreground hidden sm:inline">•</span>
                <div className="hidden sm:flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Última: {formatDistanceToNow(new Date(lastRunTime), { 
                      addSuffix: false, 
                      locale: ptBR 
                    })}
                  </span>
                </div>
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <p><strong>Agendamento:</strong> A cada {intervalMinutes} minutos</p>
            <p><strong>Status:</strong> {isActive ? "Ativo" : "Inativo"}</p>
            {nextRunCountdown && (
              <p><strong>Próxima execução:</strong> {nextRunCountdown}</p>
            )}
            {lastRun && (
              <>
                <p><strong>Última execução:</strong> {lastRunSuccess ? "Sucesso" : lastRun.status}</p>
                {lastRun.return_message && (
                  <p><strong>Mensagem:</strong> {lastRun.return_message}</p>
                )}
              </>
            )}
            <p className="text-muted-foreground mt-2">
              Jobs travados, pausados ou com erro são retomados automaticamente.
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
