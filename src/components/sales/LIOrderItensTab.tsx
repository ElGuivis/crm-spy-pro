import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import { OrderView, formatCurrency, getItemRaw } from "./li-order-helpers";

interface Props { order: OrderView; }

export function LIOrderItensTab({ order }: Props) {
  const items = order.items || [];

  return (
    <TabsContent value="itens" className="mt-4">
      {items.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
          <p>Nenhum item encontrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => {
            const imgUrl = getItemRaw(item, 'imagem_url');
            const variacao = getItemRaw(item, 'variacao');
            return (
              <div key={item.id || index} className="border rounded-lg p-4">
                <div className="flex gap-4">
                  {imgUrl && (
                    <img src={imgUrl} alt={item.name || "Produto"} className="w-16 h-16 object-cover rounded-lg"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  )}
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h5 className="font-medium">{item.name || "Produto sem nome"}</h5>
                        {item.sku && <p className="text-sm text-muted-foreground">SKU: {item.sku}</p>}
                        {variacao && <p className="text-sm text-muted-foreground">Variação: {variacao}</p>}
                      </div>
                      <Badge variant="outline">{item.qty || 1}x</Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Unitário:</span>
                        <p className="font-medium">{formatCurrency(item.price)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Subtotal:</span>
                        <p className="font-semibold">{formatCurrency(item.price * item.qty)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div className="bg-muted/50 p-4 rounded-lg mt-4">
            <div className="flex justify-between text-sm">
              <span>Total de itens:</span>
              <span className="font-medium">{items.reduce((sum, i) => sum + (i.qty || 1), 0)}</span>
            </div>
          </div>
        </div>
      )}
    </TabsContent>
  );
}
