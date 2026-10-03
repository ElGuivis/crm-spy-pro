#!/usr/bin/env bash
# Rotaciona o CRON_SECRET do Supabase auto-hospedado: vault (get_internal_headers/crons) + functions.env.
# Rodar NO SERVIDOR (root). Nao imprime nenhum valor de segredo.
#   scp scripts/rotate-cron-secret.sh root@37.148.134.55:/root/ && ssh root@37.148.134.55 "bash /root/rotate-cron-secret.sh"
set -euo pipefail
cd /opt/supabase
Q() { docker exec supabase-db psql -U supabase_admin -d postgres -At -c "$1"; }
A=$(grep '^ANON_KEY=' .env | cut -d= -f2-)
OLD=$(grep '^CRON_SECRET=' functions.env | cut -d= -f2-)
NEW=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 48)
[ ${#NEW} -eq 48 ] || { echo "falha ao gerar o segredo"; exit 1; }

# 1) vault: usado por public.get_internal_headers() e pelos crons
Q "select vault.update_secret(id, '$NEW', 'CRON_SECRET', 'CRON_SECRET') from vault.secrets where name='CRON_SECRET'" >/dev/null

# 2) edge functions: variavel de ambiente
cp functions.env functions.env.bak
sed -i "s|^CRON_SECRET=.*|CRON_SECRET=$NEW|" functions.env
chmod 600 functions.env
docker compose up -d functions 2>&1 | tail -1
sleep 10

T() { curl -s -o /dev/null -w '%{http_code}' -X POST -H "apikey: $A" -H "x-cron-secret: $1" -H 'Content-Type: application/json' -d '{}' https://api.spypro.com.br/functions/v1/message-queue-processor; }
echo "segredo ANTIGO (esperado 401): $(T "$OLD")"
echo "segredo NOVO   (esperado 200): $(T "$NEW")"

V=$(Q "select decrypted_secret from vault.decrypted_secrets where name='CRON_SECRET'")
[ "$V" = "$NEW" ] && echo "vault == functions.env: sim" || echo "vault == functions.env: NAO (investigar)"

sleep 70
echo "crons nos ultimos 70s: $(Q "select string_agg(status||'='||c, ' ') from (select status, count(*) c from cron.job_run_details where start_time > now() - interval '70 seconds' group by 1) x")"
echo "respostas http dos crons: $(Q "select string_agg(status_code||'='||c, ' ') from (select status_code, count(*) c from net._http_response where created > now() - interval '75 seconds' group by 1) x")"
rm -f functions.env.bak
echo "OK. O novo valor esta em /opt/supabase/functions.env (linha CRON_SECRET). Copie para Documents/segredos e para reference_secrets.md."
