import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Phone, Mail, MapPin, Eye } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { Tables } from "@/integrations/supabase/types";
import { getInitials } from "../shared/clientsHelpers";

interface Props {
  clients: Tables<"li_customers">[] | undefined;
  isLoading: boolean;
  pageSize: number;
  searchTerm: string;
  isSyncing: boolean;
  onViewDetails: (client: Tables<"li_customers">) => void;
  onSync: () => void;
}

interface Address {
  cidade?: string;
  estado?: string;
  principal?: boolean;
}

const getCityState = (client: Tables<"li_customers">): string => {
  let addr = client.address_json as Address | null;
  if (!addr || (!addr.cidade && !addr.estado)) {
    const raw = client.raw_json as { enderecos?: Address[] } | null;
    const enderecos = Array.isArray(raw?.enderecos) ? raw!.enderecos : [];
    addr = enderecos.find((e) => e.principal) || enderecos[0] || null;
  }
  return addr?.cidade && addr?.estado ? `${addr.cidade}/${addr.estado}` : "-";
};

const getBirthdate = (client: Tables<"li_customers">): string => {
  const raw = client.raw_json as { data_nascimento?: string } | null;
  if (!raw?.data_nascimento) return "-";
  try {
    return format(parseISO(raw.data_nascimento), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return "-";
  }
};

export function LiClientsTable({ clients, isLoading, pageSize, searchTerm, isSyncing, onViewDetails, onSync }: Props) {
  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Cliente</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden sm:table-cell">Telefone</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden md:table-cell">Email</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden lg:table-cell">Cidade/UF</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden xl:table-cell">Nascimento</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden xl:table-cell">CPF/CNPJ</th>
            <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Ações</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: pageSize }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell"><Skeleton className="h-4 w-28" /></td>
                <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-4 w-36" /></td>
                <td className="px-4 py-3 hidden lg:table-cell"><Skeleton className="h-4 w-24" /></td>
                <td className="px-4 py-3 hidden xl:table-cell"><Skeleton className="h-4 w-24" /></td>
                <td className="px-4 py-3 hidden xl:table-cell"><Skeleton className="h-4 w-28" /></td>
                <td className="px-4 py-3"><Skeleton className="h-8 w-8 ml-auto" /></td>
              </tr>
            ))
          ) : clients?.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">
                  {searchTerm.trim() ? "Nenhum cliente encontrado" : "Nenhum cliente sincronizado ainda"}
                </p>
                {!searchTerm.trim() && (
                  <Button variant="outline" className="mt-4" onClick={onSync} disabled={isSyncing}>
                    Sincronizar Clientes
                  </Button>
                )}
              </td>
            </tr>
          ) : (
            clients?.map((client) => (
              <tr
                key={client.id}
                className="border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => onViewDetails(client)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full gradient-whatsapp flex items-center justify-center text-primary-foreground font-semibold text-sm">
                      {getInitials(client.name)}
                    </div>
                    <div>
                      <p className="font-medium text-card-foreground">{client.name || "Sem nome"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 hidden sm:table-cell">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    {client.phone || "-"}
                  </div>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    {client.email || "-"}
                  </div>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" />
                    {getCityState(client)}
                  </div>
                </td>
                <td className="px-4 py-3 hidden xl:table-cell">
                  <span className="text-sm text-muted-foreground">{getBirthdate(client)}</span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground hidden xl:table-cell">
                  {client.doc || "-"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost" size="icon" className="h-8 w-8"
                    onClick={(e) => { e.stopPropagation(); onViewDetails(client); }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
