-- Horário de Brasília como fuso padrão do banco.
-- Colunas continuam timestamptz (o instante guardado não muda; só a forma como "dia" e "hora" são lidos em
-- CURRENT_DATE, ::date, date_trunc('day'), EXTRACT, to_char). Brasília não tem horário de verão (UTC-3 fixo).
-- Vale para conexões NOVAS; as agendas do pg_cron seguem em UTC de propósito (mesmos instantes de antes).
ALTER DATABASE postgres SET timezone TO 'America/Sao_Paulo';
