import { Button } from "@/components/ui/button";
import { RefreshCw, User, Store, ExternalLink, FileText, Copy, Cake } from "lucide-react";
import { BlingOrderFull, BlingCustomer } from "./bling-order-types";
import {
  formatCurrency, formatDate, formatDateShort,
  displayValue, calculateAge, formatBirthday, getSexoLabel,
} from "./bling-order-helpers";

interface Props {
  order: BlingOrderFull;
  customer: BlingCustomer | null;
  loadingCustomer: boolean;
  copyToClipboard: (text: string, label: string) => void;
}

export function BlingOrderResumoTab({ order, customer, loadingCustomer, copyToClipboard }: Props) {
  return (
    <div className="space-y-4">
      {/* Main Values */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Produtos</p>
          <p className="text-lg font-bold">{formatCurrency(order.valor_produtos)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Frete</p>
          <p className="text-lg font-semibold text-blue-600">{formatCurrency(order.valor_frete)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Desconto</p>
          <p className="text-lg font-semibold text-red-600">-{formatCurrency(order.valor_desconto)}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-xl font-bold text-primary">{formatCurrency(order.valor_total)}</p>
        </div>
      </div>

      {/* Client */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <User className="h-4 w-4" />
          Cliente
          {loadingCustomer && <RefreshCw className="h-3 w-3 animate-spin" />}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-3 border rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">Nome</p>
            <p className="font-medium">{displayValue(order.cliente_nome)}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">CPF/CNPJ</p>
              <p className="font-medium">{displayValue(order.cliente_cpf_cnpj)}</p>
            </div>
            {order.cliente_cpf_cnpj && (
              <Button variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => copyToClipboard(order.cliente_cpf_cnpj!, 'CPF/CNPJ')}>
                <Copy className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">E-mail</p>
              <p className="font-medium">{displayValue(order.cliente_email)}</p>
            </div>
            {order.cliente_email && (
              <Button variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => copyToClipboard(order.cliente_email!, 'E-mail')}>
                <Copy className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Telefone</p>
              <p className="font-medium">{displayValue(order.cliente_telefone)}</p>
            </div>
            {order.cliente_telefone && (
              <Button variant="ghost" size="icon" className="h-6 w-6"
                onClick={() => copyToClipboard(order.cliente_telefone!, 'Telefone')}>
                <Copy className="h-3 w-3" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Cake className="h-4 w-4 text-pink-500" />
            <div>
              <p className="text-xs text-muted-foreground">Data de Nascimento</p>
              <p className="font-medium">
                {customer?.data_nascimento ? (
                  <>
                    {formatBirthday(customer.data_nascimento)}
                    {calculateAge(customer.data_nascimento) !== null && (
                      <span className="text-muted-foreground ml-1">
                        ({calculateAge(customer.data_nascimento)} anos)
                      </span>
                    )}
                  </>
                ) : "-"}
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Sexo</p>
            <p className="font-medium">{getSexoLabel(customer?.sexo || null)}</p>
          </div>
        </div>
      </div>

      {/* Dates and Store */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-3 border rounded-lg">
          <p className="text-xs text-muted-foreground">Data do Pedido</p>
          <p className="font-medium">{formatDate(order.data_criacao)}</p>
        </div>
        <div className="p-3 border rounded-lg">
          <p className="text-xs text-muted-foreground">Data de Saída</p>
          <p className="font-medium">{formatDateShort(order.data_saida)}</p>
        </div>
        <div className="p-3 border rounded-lg">
          <p className="text-xs text-muted-foreground">Previsão de Entrega</p>
          <p className="font-medium">{formatDateShort(order.data_prevista)}</p>
        </div>
        <div className="p-3 border rounded-lg">
          <div className="flex items-center gap-1">
            <Store className="h-3 w-3 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loja/Canal</p>
          </div>
          <p className="font-medium">{displayValue(order.loja_nome)}</p>
        </div>
      </div>

      {/* Marketplace */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ExternalLink className="h-4 w-4" />
          Marketplace / Intermediador
        </div>
        <div className="grid grid-cols-2 gap-4 p-3 border rounded-lg bg-orange-50 dark:bg-orange-950/20">
          <div>
            <p className="text-xs text-muted-foreground">Usuário</p>
            <p className="font-medium">{displayValue(order.intermediador_nome_usuario)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">CNPJ Intermediador</p>
            <p className="font-medium">{displayValue(order.intermediador_cnpj)}</p>
          </div>
        </div>
      </div>

      {/* References */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4" />
          Referências
        </div>
        <div className="grid grid-cols-3 gap-4 p-3 border rounded-lg">
          <div>
            <p className="text-xs text-muted-foreground">ID Bling</p>
            <p className="font-medium">{displayValue(order.bling_id)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Nº Pedido Compra</p>
            <p className="font-medium">{displayValue(order.numero_pedido_compra)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">ID Vendedor</p>
            <p className="font-medium">{displayValue(order.vendedor_id)}</p>
          </div>
        </div>
      </div>

      {/* Observations */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4" />
          Observações
        </div>
        <div className="space-y-2">
          <div className="p-3 border rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">Observação do Cliente</p>
            <p className="text-sm">{displayValue(order.observacoes)}</p>
          </div>
          <div className="p-3 border rounded-lg bg-yellow-50 dark:bg-yellow-950/20">
            <p className="text-xs text-muted-foreground mb-1">Observação Interna</p>
            <p className="text-sm">{displayValue(order.observacoes_internas)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
