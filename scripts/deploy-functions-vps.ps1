# Publica as edge functions no Supabase auto-hospedado (VPS). Substitui `supabase functions deploy`.
#
# Copia supabase/functions (sem tests) para /opt/supabase/volumes/functions e reinicia o runtime.
# Requer a chave SSH da VPS (padrao: ~/.ssh/spypro_vps). Nao envia segredos: os secrets das funcoes
# ficam em /opt/supabase/functions.env no servidor.
#
# Uso:
#   pwsh scripts/deploy-functions-vps.ps1                 # todas as funcoes
#   pwsh scripts/deploy-functions-vps.ps1 -Only li-sync   # so uma pasta (mais _shared)
param(
  [string]$Server = "root@37.148.134.55",
  [string]$Key = "$env:USERPROFILE\.ssh\spypro_vps",
  [string]$Only = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "supabase\functions"
if (-not (Test-Path $src)) { throw "Pasta nao encontrada: $src" }

$items = if ($Only) { @("_shared", $Only) } else { @(".") }
foreach ($i in $items) { if ($i -ne "." -and -not (Test-Path (Join-Path $src $i))) { throw "Funcao nao encontrada: $i" } }

Write-Host "Enviando para $Server ..."
# cmd /c: o pipe do PowerShell 5.1 corrompe dados binarios, o do cmd nao
$itemList = ($items | ForEach-Object { "`"$_`"" }) -join " "
cmd /c "tar --exclude=tests --exclude=*.test.ts -cf - -C `"$src`" $itemList | ssh -i `"$Key`" -o BatchMode=yes $Server `"cd /opt/supabase/volumes/functions && tar -xf -`""
if ($LASTEXITCODE -ne 0) { throw "Falha ao copiar as funcoes" }

& ssh -i $Key -o BatchMode=yes $Server "cd /opt/supabase && docker compose restart functions >/dev/null && sleep 6 && docker compose ps functions --format '{{.Service}} {{.Status}}'"
