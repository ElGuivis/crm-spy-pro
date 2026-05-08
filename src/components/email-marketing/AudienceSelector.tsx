import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, UserCheck, UserX, Loader2, AlertCircle, Filter, List, Layers, TrendingUp } from "lucide-react";
import { useAudienceEstimate, AudienceReference } from "@/hooks/useAudienceEstimate";
import { useCrmSegments } from "@/hooks/useCrmSegments";
import { useTags } from "@/hooks/useTags";
import { useAllRFMAudiences } from "@/hooks/useAllRFMAudiences";
import { cn } from "@/lib/utils";

export type AudienceType = "all" | "segment" | "filters" | "manual" | "rfm";

interface AudienceSelectorProps {
  value: {
    type: AudienceType;
    reference: AudienceReference;
  };
  onChange: (value: { type: AudienceType; reference: AudienceReference }) => void;
  className?: string;
}

export function AudienceSelector({ value, onChange, className }: AudienceSelectorProps) {
  const { segments, isLoading: loadingSegments } = useCrmSegments();
  const { tags } = useTags();
  const { data: rfmAudiences, isLoading: loadingRfmAudiences } = useAllRFMAudiences();

  // Local state for filters
  const [selectedSegmentId, setSelectedSegmentId] = useState<string>(value.reference?.segment_id || "");
  const [selectedRfmAudienceId, setSelectedRfmAudienceId] = useState<string>(value.reference?.rfm_audience_id || "");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(value.reference?.filters?.tag_ids || []);
  const [nameContains, setNameContains] = useState(value.reference?.filters?.name_contains || "");
  const [emailContains, setEmailContains] = useState(value.reference?.filters?.email_contains || "");
  const [manualEmails, setManualEmails] = useState<string>(value.reference?.emails?.join("\n") || "");

  // Build reference object based on type
  const audienceReference = useMemo((): AudienceReference => {
    switch (value.type) {
      case "segment":
        return { segment_id: selectedSegmentId };
      case "rfm":
        return { rfm_audience_id: selectedRfmAudienceId };
      case "filters":
        return {
          filters: {
            tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
            name_contains: nameContains || undefined,
            email_contains: emailContains || undefined,
          },
        };
      case "manual":
        const emails = manualEmails
          .split(/[\n,;]/)
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e && e.includes("@"));
        return { emails };
      case "all":
      default:
        return {};
    }
  }, [value.type, selectedSegmentId, selectedRfmAudienceId, selectedTagIds, nameContains, emailContains, manualEmails]);

  // Estimate audience
  const { data: estimate, isLoading: loadingEstimate, error: estimateError } = useAudienceEstimate(
    value.type,
    audienceReference,
    value.type !== "manual" || manualEmails.trim().length > 0
  );

  // Sync changes back to parent - use JSON comparison to prevent loops
  const referenceJson = JSON.stringify(audienceReference);
  useEffect(() => {
    const currentRef = JSON.stringify(value.reference || {});
    // Only update if reference actually changed (prevents infinite loops)
    if (referenceJson !== currentRef) {
      onChange({ type: value.type, reference: audienceReference });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referenceJson, value.type]);

  const handleTypeChange = (newType: AudienceType) => {
    onChange({ type: newType, reference: {} });
    // Reset local state
    setSelectedSegmentId("");
    setSelectedRfmAudienceId("");
    setSelectedTagIds([]);
    setNameContains("");
    setEmailContains("");
    setManualEmails("");
  };

  const modeOptions = [
    { value: "all", label: "Todos os contatos", icon: Users },
    { value: "segment", label: "Segmento salvo", icon: Layers },
    { value: "rfm", label: "Audiência RFM", icon: TrendingUp },
    { value: "filters", label: "Filtros customizados", icon: Filter },
    { value: "manual", label: "Lista manual", icon: List },
  ];

  return (
    <Card className={cn("border-dashed", className)}>
      <CardContent className="pt-4 space-y-4">
        {/* Mode selector */}
        <div className="space-y-2">
          <Label>Tipo de Audiência</Label>
          <Select value={value.type} onValueChange={(v) => handleTypeChange(v as AudienceType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {modeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    <opt.icon className="h-4 w-4" />
                    {opt.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Segment selector */}
        {value.type === "segment" && (
          <div className="space-y-2">
            <Label>Segmento</Label>
            {loadingSegments ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando segmentos...
              </div>
            ) : segments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum segmento cadastrado. Crie segmentos no CRM Avançado.
              </p>
            ) : (
              <Select value={selectedSegmentId} onValueChange={setSelectedSegmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um segmento" />
                </SelectTrigger>
                <SelectContent>
                  {segments.map((seg) => (
                    <SelectItem key={seg.id} value={seg.id}>
                      {seg.name} ({seg.contact_count} contatos)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {/* RFM Audience selector */}
        {value.type === "rfm" && (
          <div className="space-y-2">
            <Label>Audiência RFM</Label>
            {loadingRfmAudiences ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando audiências...
              </div>
            ) : !rfmAudiences || rfmAudiences.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma audiência RFM cadastrada. Crie audiências na Matriz RFM.
              </p>
            ) : (
              <Select value={selectedRfmAudienceId} onValueChange={setSelectedRfmAudienceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma audiência RFM" />
                </SelectTrigger>
                <SelectContent>
                  {rfmAudiences.map((aud) => (
                    <SelectItem key={aud.id} value={aud.id}>
                      <div className="flex flex-col">
                        <span>{aud.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {aud.member_count} membros • {aud.integration_name}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedRfmAudienceId && rfmAudiences && (
              <p className="text-xs text-muted-foreground">
                {rfmAudiences.find(a => a.id === selectedRfmAudienceId)?.description || "Sem descrição"}
              </p>
            )}
          </div>
        )}

        {/* Custom filters */}
        {value.type === "filters" && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Tags</Label>
              <Select
                value={selectedTagIds[0] || "__none__"}
                onValueChange={(v) => setSelectedTagIds(v === "__none__" ? [] : v ? [v] : [])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por tag (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Todas as tags</SelectItem>
                  {tags?.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Nome contém</Label>
                <Input
                  placeholder="Ex: João"
                  value={nameContains}
                  onChange={(e) => setNameContains(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail contém</Label>
                <Input
                  placeholder="Ex: @gmail.com"
                  value={emailContains}
                  onChange={(e) => setEmailContains(e.target.value)}
                />
              </div>
            </div>
          </div>
        )}

        {/* Manual email list */}
        {value.type === "manual" && (
          <div className="space-y-2">
            <Label>Lista de E-mails</Label>
            <Textarea
              placeholder="Digite os e-mails (um por linha, ou separados por vírgula)"
              value={manualEmails}
              onChange={(e) => setManualEmails(e.target.value)}
              rows={5}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {manualEmails.split(/[\n,;]/).filter((e) => e.trim() && e.includes("@")).length} e-mails detectados
            </p>
          </div>
        )}

        {/* Estimate display */}
        <div className="pt-2 border-t">
          {loadingEstimate ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Calculando audiência...
            </div>
          ) : estimateError ? (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              Erro ao calcular audiência
            </div>
          ) : estimate ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="outline" className="gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {estimate.total_with_email} com e-mail
              </Badge>
              {estimate.suppressed > 0 && (
                <Badge variant="secondary" className="gap-1.5 text-muted-foreground">
                  <UserX className="h-3.5 w-3.5" />
                  {estimate.suppressed} suprimidos
                </Badge>
              )}
              <Badge className="gap-1.5 bg-primary">
                <UserCheck className="h-3.5 w-3.5" />
                {estimate.eligible} elegíveis
              </Badge>
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
