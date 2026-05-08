import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle, RotateCcw, Activity, Zap, Skull } from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import { createLogger } from '@/lib/logger';
const log = createLogger('Operations');

interface FunctionMetric {
  id: string;
  function_name: string;
  status: string;
  duration_ms: number;
  items_processed: number;
  items_failed: number;
  items_dead: number;
  error_message: string | null;
  correlation_id: string | null;
  created_at: string;
}

interface DeadLetterItem {
  id: string;
  source_queue: string;
  channel_type: string;
  destination: string;
  error_message: string | null;
  attempts: number;
  status: string;
  correlation_id: string | null;
  created_at: string;
}

interface CircuitBreakerItem {
  id: string;
  provider: string;
  state: string;
  failure_count: number;
  last_failure_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  opened_at: string | null;
  updated_at: string;
}

interface QueueStats {
  whatsapp_pending: number;
  whatsapp_failed: number;
  whatsapp_processing: number;
  instagram_pending: number;
  instagram_retry: number;
  instagram_sending: number;
}

export default function Operations() {
  const [metrics, setMetrics] = useState<FunctionMetric[]>([]);
  const [deadLetters, setDeadLetters] = useState<DeadLetterItem[]>([]);
  const [circuits, setCircuits] = useState<CircuitBreakerItem[]>([]);
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [metricsRes, deadRes, circuitRes, wqRes, iqRes] = await Promise.all([
        supabase.from("function_metrics").select("id, function_name, status, duration_ms, items_processed, items_failed, items_dead, error_message, correlation_id, created_at").order("created_at", { ascending: false }).limit(50),
        supabase.from("dead_letter_queue").select("id, source_queue, channel_type, destination, error_message, attempts, status, correlation_id, created_at").order("created_at", { ascending: false }).limit(50),
        supabase.from("circuit_breaker_state").select("id, provider, state, failure_count, last_failure_at, last_success_at, last_error, opened_at, updated_at").order("updated_at", { ascending: false }),
        supabase.from("outbound_queue").select("status").in("status", ["pending", "failed", "processing"]),
        supabase.from("instagram_outbox").select("status").in("status", ["pending", "retry", "sending"]),
      ]);

      setMetrics((metricsRes.data || []) as FunctionMetric[]);
      setDeadLetters((deadRes.data || []) as DeadLetterItem[]);
      setCircuits((circuitRes.data || []) as CircuitBreakerItem[]);

      const wq = wqRes.data || [];
      const iq = iqRes.data || [];
      setQueueStats({
        whatsapp_pending: wq.filter(i => i.status === "pending").length,
        whatsapp_failed: wq.filter(i => i.status === "failed").length,
        whatsapp_processing: wq.filter(i => i.status === "processing").length,
        instagram_pending: iq.filter(i => i.status === "pending").length,
        instagram_retry: iq.filter(i => i.status === "retry").length,
        instagram_sending: iq.filter(i => i.status === "sending").length,
      });
    } catch (err) {
      log.error("Failed to fetch operations data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const handleRetryDeadLetter = async (itemId: string) => {
    try {
      const item = deadLetters.find(d => d.id === itemId);
      if (!item) return;

      if (item.source_queue === "outbound_queue") {
        await supabase.from("outbound_queue").update({
          status: "pending", attempts: 0, next_retry_at: new Date().toISOString(), last_error: null,
        }).eq("id", (item as any).source_item_id || itemId);
      } else if (item.source_queue === "instagram_outbox") {
        await supabase.from("instagram_outbox").update({
          status: "pending", attempt_count: 0, send_after: new Date().toISOString(), error_code: null, error_message: null,
        }).eq("id", (item as any).source_item_id || itemId);
      }

      await supabase.from("dead_letter_queue").update({
        status: "retried", retried_at: new Date().toISOString(),
      }).eq("id", itemId);

      toast.success("Item reenfileirado com sucesso");
      fetchAll();
    } catch {
      toast.error("Falha ao reenfileirar item");
    }
  };

  const circuitStateColor = (state: string) => {
    if (state === "closed") return "bg-emerald-500/10 text-emerald-600 border-emerald-200";
    if (state === "open") return "bg-destructive/10 text-destructive border-destructive/30";
    return "bg-amber-500/10 text-amber-600 border-amber-200";
  };

  const circuitStateLabel = (state: string) => {
    if (state === "closed") return "Fechado";
    if (state === "open") return "Aberto";
    return "Semi-aberto";
  };

  const metricsOk = metrics.filter(m => m.status === "ok").length;
  const metricsError = metrics.filter(m => m.status === "error").length;
  const deadActive = deadLetters.filter(d => d.status === "dead").length;
  const circuitsOpen = circuits.filter(c => c.state === "open").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Operações</h1>
          <p className="text-muted-foreground">Monitoramento de filas, jobs e integrações</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Filas Ativas</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(queueStats?.whatsapp_pending || 0) + (queueStats?.instagram_pending || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              WA: {queueStats?.whatsapp_pending || 0} pendentes, {queueStats?.whatsapp_failed || 0} falhas
            </p>
            <p className="text-xs text-muted-foreground">
              IG: {queueStats?.instagram_pending || 0} pendentes, {queueStats?.instagram_retry || 0} retry
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Execuções (últ. 50)</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metricsOk + metricsError}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-emerald-600">{metricsOk} ok</span> · <span className="text-destructive">{metricsError} erros</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dead Letters</CardTitle>
            <Skull className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${deadActive > 0 ? "text-destructive" : ""}`}>
              {deadActive}
            </div>
            <p className="text-xs text-muted-foreground">
              {deadLetters.filter(d => d.status === "retried").length} reprocessados
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Circuit Breakers</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${circuitsOpen > 0 ? "text-destructive" : "text-emerald-600"}`}>
              {circuitsOpen > 0 ? `${circuitsOpen} abertos` : "Todos OK"}
            </div>
            <p className="text-xs text-muted-foreground">
              {circuits.length} providers monitorados
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="metrics" className="space-y-4">
        <TabsList>
          <TabsTrigger value="metrics">Métricas</TabsTrigger>
          <TabsTrigger value="dead-letters">
            Dead Letters {deadActive > 0 && <Badge variant="destructive" className="ml-1.5 h-5 px-1.5">{deadActive}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="circuits">
            Circuit Breakers {circuitsOpen > 0 && <Badge variant="destructive" className="ml-1.5 h-5 px-1.5">{circuitsOpen}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="metrics">
          <Card>
            <CardHeader>
              <CardTitle>Execuções Recentes</CardTitle>
              <CardDescription>Últimas 50 execuções de edge functions</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Função</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duração</TableHead>
                    <TableHead>Processados</TableHead>
                    <TableHead>Falhas</TableHead>
                    <TableHead>Dead</TableHead>
                    <TableHead>Correlation ID</TableHead>
                    <TableHead>Quando</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs">{m.function_name}</TableCell>
                      <TableCell>
                        {m.status === "ok" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{m.duration_ms}ms</TableCell>
                      <TableCell>{m.items_processed}</TableCell>
                      <TableCell>{m.items_failed > 0 ? <span className="text-amber-600">{m.items_failed}</span> : 0}</TableCell>
                      <TableCell>{m.items_dead > 0 ? <span className="text-destructive">{m.items_dead}</span> : 0}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[120px] truncate">{m.correlation_id || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(m.created_at), { addSuffix: true, locale: ptBR })}
                      </TableCell>
                    </TableRow>
                  ))}
                  {metrics.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma métrica registrada</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dead-letters">
          <Card>
            <CardHeader>
              <CardTitle>Dead Letter Queue</CardTitle>
              <CardDescription>Mensagens que falharam em todas as tentativas</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Origem</TableHead>
                    <TableHead>Canal</TableHead>
                    <TableHead>Destino</TableHead>
                    <TableHead>Erro</TableHead>
                    <TableHead>Tentativas</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Quando</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deadLetters.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.source_queue}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{d.channel_type}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[120px] truncate">{d.destination}</TableCell>
                      <TableCell className="text-xs text-destructive max-w-[200px] truncate">{d.error_message}</TableCell>
                      <TableCell>{d.attempts}</TableCell>
                      <TableCell>
                        <Badge variant={d.status === "dead" ? "destructive" : "secondary"}>
                          {d.status === "dead" ? "Morto" : d.status === "retried" ? "Reprocessado" : d.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(d.created_at), { addSuffix: true, locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        {d.status === "dead" && (
                          <Button variant="ghost" size="sm" onClick={() => handleRetryDeadLetter(d.id)}>
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {deadLetters.length === 0 && (
                    <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum dead letter</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="circuits">
          <Card>
            <CardHeader>
              <CardTitle>Estado dos Circuit Breakers</CardTitle>
              <CardDescription>Monitoramento de integrações externas por provider</CardDescription>
            </CardHeader>
            <CardContent>
              {circuits.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum circuit breaker registrado ainda</p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {circuits.map((c) => (
                    <Card key={c.id} className="border">
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold capitalize">{c.provider.replace(/_/g, " ")}</span>
                          <Badge variant="outline" className={circuitStateColor(c.state)}>
                            {circuitStateLabel(c.state)}
                          </Badge>
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          <p>Falhas consecutivas: <span className="font-medium text-foreground">{c.failure_count}</span></p>
                          {c.last_failure_at && (
                            <p>Última falha: {formatDistanceToNow(new Date(c.last_failure_at), { addSuffix: true, locale: ptBR })}</p>
                          )}
                          {c.last_success_at && (
                            <p>Último sucesso: {formatDistanceToNow(new Date(c.last_success_at), { addSuffix: true, locale: ptBR })}</p>
                          )}
                          {c.last_error && (
                            <p className="text-destructive truncate" title={c.last_error}>Erro: {c.last_error}</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
