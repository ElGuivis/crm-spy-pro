#!/usr/bin/env python3
"""Alarme dos números de WhatsApp (roda na VPS, cron a cada 5 min: /opt/spypro-monitor/wa_health.py).

Por número ligado a uma integração `evolution_whatsapp` do CRM, verifica:
  disconnected        - Evolution diz que não está "open"
  unstable            - reconectou 3+ vezes nos últimos 10 min (ex.: status com mídia derrubando a conexão)
  session_conflict    - loop "conflict: replaced" (duas conexões na mesma sessão; resolve com
                        `docker restart evolution-api`)
  not_receiving       - das 8h às 22h (Brasília): enviou 8+ mensagens em 3 h e não recebeu NENHUMA
                        conversa individual (caso Outback 26–27/11: "conectado" e surdo por 16 h)
  not_reaching_system - a Evolution recebeu 3+ mensagens (30 min) que não entraram no CRM (webhook falhando)
  not_receiving (teste) - das 8h às 22h, a cada 15 min, cada número conectado recebe um "[spypro-ping]" de outro
                        número nosso; se não chegar em 4 min, alarme (27/11: guivis surdo das 11:54 às 13:50).
                        O whatsapp-webhook ignora o ping (não vira conversa, não aciona bot).
Grava em public.whatsapp_health_alerts (1 aberto por número+tipo; resolve sozinho quando some).
Migration 20261127000002. Log: /var/log/wa-health.log.
"""
import json, os, re, subprocess, sys, urllib.request
from datetime import datetime, timedelta, timezone

BRT = timezone(timedelta(hours=-3))
PING_PREFIX = "[spypro-ping]"
PING_STATE = "/opt/spypro-monitor/ping_state.json"
PING_EVERY_MIN = 15
PING_TIMEOUT_S = 240
CONTENT_TYPES = ("conversation", "extendedTextMessage", "imageMessage", "audioMessage", "videoMessage", "documentMessage")


def run(args, input_=None):
    return subprocess.run(args, capture_output=True, text=True, input=input_).stdout


def evo_sql(sql):
    out = run(["docker", "exec", "evolution-postgres", "sh", "-c",
               'psql -U "$POSTGRES_USER" -d "${POSTGRES_DB:-evolution}" -At -F"|" -c "$0"', sql])
    return [l.split("|") for l in out.strip().splitlines() if l]


def crm_sql(sql):
    out = run(["docker", "exec", "-i", "supabase-db", "psql", "-U", "postgres", "-d", "postgres", "-At", "-F", "|",
               "-v", "ON_ERROR_STOP=1"], input_=sql)
    return [l.split("|") for l in out.strip().splitlines() if l]


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def env():
    vals = {}
    for line in open("/opt/supabase/functions.env"):
        if "=" in line and not line.startswith("#"):
            k, v = line.strip().split("=", 1)
            vals[k] = v
    return vals["EVOLUTION_API_URL"].rstrip("/"), vals["EVOLUTION_API_KEY"]


def state(url, key, name):
    try:
        req = urllib.request.Request(f"{url}/instance/connectionState/{name}", headers={"apikey": key})
        return json.load(urllib.request.urlopen(req, timeout=15)).get("instance", {}).get("state", "unknown")
    except Exception:
        return "unknown"


def send_text(url, key, inst, number, text):
    req = urllib.request.Request(f"{url}/message/sendText/{inst}", data=json.dumps({"number": number, "text": text}).encode(),
                                 headers={"apikey": key, "Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=30)).get("key", {}).get("id")


def ping_probe(url, key, now, connected):
    """connected: [(integ_id, inst, phone)] abertos. Confere os pings pendentes e manda novos a cada 15 min.
    Devolve {inst: falha_dict} dos números que NÃO receberam o último ping."""
    try:
        st = json.load(open(PING_STATE))
    except Exception:
        st = {}
    failed = {}
    for inst, p in list(st.items()):
        if p.get("result") == "fail":
            failed[inst] = p
        if p.get("result") != "pending":
            continue
        got = evo_sql(f"""select count(*) from "Message" m join "Instance" i on i.id=m."instanceId"
          where i.name={q(inst)} and m.key->>'fromMe'='false'
            and coalesce(m.message->>'conversation', m.message->'extendedTextMessage'->>'text','') = {q(p["text"])}""")
        if got and int(got[0][0] or 0) > 0:
            p["result"] = "ok"; failed.pop(inst, None)
        elif now.timestamp() - p["sent_at"] > PING_TIMEOUT_S:
            p["result"] = "fail"; failed[inst] = p
    in_hours = 8 <= now.hour < 22
    if in_hours and now.minute % PING_EVERY_MIN < 5 and len(connected) >= 2:
        for idx, (_, inst, phone) in enumerate(connected):
            prev = st.get(inst, {})
            if prev.get("result") == "pending" or now.timestamp() - prev.get("sent_at", 0) < 600:
                continue
            sender = connected[(idx + 1) % len(connected)][1]
            text = f"{PING_PREFIX} teste automático de recebimento {now.strftime('%d/%m %H:%M')} - pode ignorar"
            try:
                send_text(url, key, sender, phone, text)
                st[inst] = {"sent_at": now.timestamp(), "text": text, "from": sender, "result": "pending",
                            "last_fail": prev.get("last_fail")}
            except Exception as e:
                print("ping falhou ao enviar", sender, "->", inst, e, file=sys.stderr)
    for inst, p in st.items():
        if p.get("result") == "fail" and not p.get("last_fail"):
            p["last_fail"] = p["sent_at"]
        if p.get("result") == "ok":
            p["last_fail"] = None
    tmp = PING_STATE + ".tmp"
    json.dump(st, open(tmp, "w")); os.replace(tmp, PING_STATE)
    return failed


def log_counts():
    logs = run(["sh", "-c", "docker logs --since 10m evolution-api 2>&1"])
    clean = re.sub(r"\x1b\[[0-9;]*m", "", logs)
    reconnects = {}
    for m in re.finditer(r"\[Evolution API\]\s+\[([^\]]+)\].*Baileys version", clean):
        reconnects[m.group(1)] = reconnects.get(m.group(1), 0) + 1
    return reconnects, clean.count('"type":"replaced"')


def main():
    url, key = env()
    now = datetime.now(BRT)
    integrations = crm_sql("""select id, tenant_id, metadata->>'instanceName', coalesce(name,''), coalesce(metadata->>'phoneNumber','')
      from integrations where type='evolution_whatsapp' and metadata->>'instanceName' is not null""")
    reconnects, conflicts = log_counts()
    found = []  # (integration_id, tenant_id, instance, kind, message, details)
    states = {r[2]: state(url, key, r[2]) for r in integrations}
    connected = [(r[0], r[2], r[4]) for r in integrations if states[r[2]] == "open" and r[4]]
    ping_failed = ping_probe(url, key, now, connected)

    for integ_id, tenant_id, inst, label, _phone in integrations:
        st = states[inst]
        if st == "unknown":
            continue  # Evolution fora do ar ou instância inexistente: não chuta
        if st != "open":
            found.append((integ_id, tenant_id, inst, "disconnected",
                          f"O número {label or inst} está desconectado. Reconecte em Canais (ler o QR code).", {"state": st}))
            continue
        rc = reconnects.get(inst, 0)
        if rc >= 3 and conflicts >= 10:
            found.append((integ_id, tenant_id, inst, "session_conflict",
                          f"O número {label or inst} está em conflito de sessão (duas conexões ao mesmo tempo): mensagens podem não sair nem chegar.",
                          {"reconnects_10min": rc, "conflicts_10min": conflicts}))
        elif rc >= 3:
            found.append((integ_id, tenant_id, inst, "unstable",
                          f"A conexão do número {label or inst} está caindo ({rc} vezes em 10 min). Mensagens recebidas podem atrasar. Evite postar status com foto/vídeo por este número.",
                          {"reconnects_10min": rc}))

        ev = evo_sql(f"""select
            count(*) filter (where m.key->>'fromMe'='true'  and m."messageTimestamp" > extract(epoch from now()-interval '3 hours')),
            count(*) filter (where m.key->>'fromMe'='false' and m."messageTimestamp" > extract(epoch from now()-interval '3 hours')),
            coalesce(max(m."messageTimestamp") filter (where m.key->>'fromMe'='false'), 0)
          from "Message" m join "Instance" i on i.id=m."instanceId"
          where i.name={q(inst)} and m.key->>'remoteJid' !~ '@(g\\.us|newsletter|broadcast)$'
            and m."messageTimestamp" > extract(epoch from now()-interval '7 days')""")
        sent3h, recv3h, last_in = (int(x or 0) for x in ev[0]) if ev else (0, 0, 0)
        if 8 <= now.hour < 22 and sent3h >= 8 and recv3h == 0:
            last = datetime.fromtimestamp(last_in, BRT).strftime("%d/%m %H:%M") if last_in else "nunca"
            found.append((integ_id, tenant_id, inst, "not_receiving",
                          f"O número {label or inst} enviou {sent3h} mensagens nas últimas 3 h e não recebeu nenhuma (última recebida: {last}). Ele pode estar 'conectado' mas surdo: desconecte e leia o QR code de novo.",
                          {"sent_3h": sent3h, "received_3h": recv3h, "last_inbound": last}))

        pf = ping_failed.get(inst)
        if pf:
            since = datetime.fromtimestamp(pf.get("last_fail") or pf["sent_at"], BRT).strftime("%H:%M")
            found.append((integ_id, tenant_id, inst, "not_receiving",
                          f"O número {label or inst} parou de RECEBER mensagens (teste automático das {since} não chegou). Ele envia, mas as respostas dos clientes não entram: desconecte e leia o QR code de novo.",
                          {"probe": True, "since": since, "from": pf.get("from")}))

        types = ",".join(q(t) for t in CONTENT_TYPES)
        recent = evo_sql(f"""select distinct m.key->>'id' from "Message" m join "Instance" i on i.id=m."instanceId"
          where i.name={q(inst)} and m.key->>'fromMe'='false' and m."messageType" in ({types})
            and m.key->>'remoteJid' !~ '@(g\\.us|newsletter|broadcast)$'
            and coalesce(m.message->>'conversation', m.message->'extendedTextMessage'->>'text','') not like '[spypro-ping]%'
            and m."messageTimestamp" between extract(epoch from now()-interval '30 minutes') and extract(epoch from now()-interval '3 minutes')""")
        ids = [r[0] for r in recent if r and r[0]]
        if ids:
            have = {r[0] for r in crm_sql(f"select provider_message_id from messages where provider_message_id in ({','.join(q(i) for i in ids)})")}
            missing = [i for i in ids if i not in have]
            if len(missing) >= 3:
                found.append((integ_id, tenant_id, inst, "not_reaching_system",
                              f"{len(missing)} mensagens recebidas pelo número {label or inst} nos últimos 30 min não entraram no sistema. Confira o Atendimento pelo celular.",
                              {"missing_30min": len(missing), "received_30min": len(ids)}))

    # grava: abre/atualiza o que achou; resolve o que sumiu (só dos números verificados agora)
    checked = {i[0] for i in integrations}
    sql = ["begin;"]
    for integ_id, tenant_id, inst, kind, msg, details in found:
        sql.append(f"""insert into whatsapp_health_alerts (tenant_id, integration_id, instance_name, kind, message, details)
          values ({q(tenant_id)}, {q(integ_id)}, {q(inst)}, {q(kind)}, {q(msg)}, {q(json.dumps(details))}::jsonb)
          on conflict (integration_id, kind) where resolved_at is null
          do update set last_seen_at=now(), message=excluded.message, details=excluded.details;""")
    keep = " or ".join(f"(integration_id={q(f[0])} and kind={q(f[3])})" for f in found) or "false"
    in_hours = 8 <= now.hour < 22
    skip_nr = "" if in_hours else " and kind <> 'not_receiving'"  # fora do horário não dá para afirmar que voltou
    if checked:
        sql.append(f"""update whatsapp_health_alerts set resolved_at=now() where resolved_at is null
          and integration_id in ({','.join(q(c) for c in checked)}) and not ({keep}){skip_nr};""")
    sql.append("commit;")
    crm_sql("\n".join(sql))
    print(now.strftime("%d/%m %H:%M"), "alertas:", [(f[2], f[3]) for f in found] or "nenhum",
          "| reconexões 10min:", reconnects, "| conflitos:", conflicts)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # nunca derrubar o cron; o log mostra
        print(datetime.now(BRT).strftime("%d/%m %H:%M"), "ERRO:", e, file=sys.stderr)
        sys.exit(1)
