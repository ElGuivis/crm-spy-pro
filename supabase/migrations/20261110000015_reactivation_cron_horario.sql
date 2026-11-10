-- Reativacao: o cron rodava 1x por dia as 07h de Brasilia (fora da janela 08h-21h) e mandava tudo de uma vez.
-- Agora roda de hora em hora dentro da janela (11-23 UTC = 08h-20h de Brasilia); cada execucao envia so a sua parte do dia (_shared/send-pacing.ts).
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'reactivation-processor-daily'),
  schedule := '0 11-23 * * *'
);
