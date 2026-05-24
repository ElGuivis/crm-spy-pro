import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Phone, Mail, MapPin, Eye, ShoppingBag } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { getInitials, parseBlingEnderecoGeral } from "../shared/clientsHelpers";

interface Props {
  clients: Tables<"bling_customers">[] | undefined;
  isLoading: boolean;
  pageSize: number;
  searchTerm: string;
  orderCounts?: Record<number, number>;
  onViewDetails: (client: Tables<"bling_customers">) => void;
}

export function BlingClientsTable({ clients, isLoading, pageSize, searchTerm, orderCounts, onViewDetails }: Props) {
  return (
    <div className="rounded-xl border border-border/50 bg-card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border bg-muted/50">
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Cliente</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden sm:table-cell">Telefone</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden md:table-cell">Email</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden lg:table-cell">Cidade/UF</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground hidden xl:table-cell">CPF/CNPJ</th>
            <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground hidden sm:table-cell">Vendas</th>
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
                <td className="px-4 py-3 hidden xl:table-cell"><Skeleton className="h-4 w-28" /></td>
                <td className="px-4 py-3 hidden sm:table-cell"><Skeleton className="h-6 w-8 mx-auto" /></td>
                <td className="px-4 py-3"><Skeleton className="h-8 w-8 ml-auto" /></td>
              </tr>
            ))
          ) : clients?.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">
                  {searchTerm ? 'Nenhum cliente encontrado' : 'Nenhum cliente sincronizado ainda'}
                </p>
                {!searchTerm && (
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    Sincronize as vendas primeiro e depois clique em "Sincronizar Clientes"
                  </p>
                )}
              </td>
            </tr>
          ) : (
            clients?.map((client) => {
              const enderecoGeral = parseBlingEnderecoGeral(client.endereco);
              const cidade = enderecoGeral.municipio || '';
              const uf = enderecoGeral.uf || '';
              const cidadeUf = cidade && uf ? `${cidade}/${uf}` : cidade || uf || '';
              const isConsumidorFinal = client.nome?.toLowerCase().includes('consumidor final');
              const clientOrderCount = orderCounts?.[client.bling_id] || 0;

              return (
                <tr key={client.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium text-sm">
                        {getInitials(client.nome)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-foreground">{client.nome || 'Sem nome'}</p>
                          {isConsumidorFinal && (
                            <Badge variant="outline" className="text-xs text-muted-foreground">Balcão</Badge>
                          )}
                        </div>
                        {client.fantasia && <p className="text-xs text-muted-foreground">{client.fantasia}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <div className="flex items-center gap-1.5 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {client.celular || client.telefone ? (
                        <span className="text-foreground">{client.celular || client.telefone}</span>
                      ) : (
                        <span className="text-muted-foreground/60 italic">Sem telefone</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex items-center gap-1.5 text-sm">
                      <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                      {client.email ? (
                        <span className="truncate max-w-[200px] text-foreground">{client.email}</span>
                      ) : (
                        <span className="text-muted-foreground/60 italic">Sem email</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-1.5 text-sm">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {cidadeUf ? (
                        <span className="text-foreground">{cidadeUf}</span>
                      ) : (
                        <span className="text-muted-foreground/60 italic">Sem localização</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    {client.cpf_cnpj ? (
                      <span className="text-sm font-mono text-foreground">{client.cpf_cnpj}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground/60 italic">Não informado</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-center">
                    {clientOrderCount > 0 ? (
                      <Badge variant="secondary" className="text-xs font-medium">
                        <ShoppingBag className="h-3 w-3 mr-1" />
                        {clientOrderCount}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground/60 text-sm">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onViewDetails(client)}
                      className="h-8 w-8"
                      title="Ver vendas do cliente"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
