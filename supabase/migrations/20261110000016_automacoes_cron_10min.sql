-- Ritmo de envio espacado: as automacoes de envio rodam a cada 10 min dentro da janela (11-23 UTC = 08h-20h50 de Brasilia);
-- a cada execucao a regra _shared/send-pacing.ts decide se ja passou o intervalo e libera 1 mensagem (ou mais, em lista grande).
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'invoke-birthday-processor-hourly'), schedule := '*/10 11-23 * * *');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'process-cashback-reminders-hourly'), schedule := '*/10 11-23 * * *');
SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname = 'reactivation-processor-daily'), schedule := '*/10 11-23 * * *');
