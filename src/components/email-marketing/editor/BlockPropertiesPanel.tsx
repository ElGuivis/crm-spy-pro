import { useState } from 'react';
import { EmailBlock } from './types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { X, Package } from 'lucide-react';
import { VariablesPicker } from '../VariablesPicker';
import { ProductPickerDialog } from './ProductPickerDialog';

interface BlockPropertiesPanelProps {
  block: EmailBlock | null;
  onUpdate: (updates: Partial<EmailBlock>) => void;
  onClose: () => void;
}

export function BlockPropertiesPanel({ block, onUpdate, onClose }: BlockPropertiesPanelProps) {
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  if (!block) return null;

  const handleChange = (field: string, value: any) => {
    onUpdate({ [field]: value });
  };

  const handleProductSelect = (product: { imageUrl: string; name: string; description: string; price: string; buttonUrl: string }) => {
    onUpdate({
      imageUrl: product.imageUrl,
      name: product.name,
      description: product.description,
      price: product.price,
      buttonUrl: product.buttonUrl,
    } as any);
  };

  return (
    <div className="w-80 border-l bg-background p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold">Propriedades do Bloco</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        {/* Common Properties */}
        <div className="space-y-2">
          <Label>Padding</Label>
          <Input
            value={block.padding || ''}
            onChange={(e) => handleChange('padding', e.target.value)}
            placeholder="Ex: 20px"
          />
        </div>

        <div className="space-y-2">
          <Label>Cor de Fundo</Label>
          <Input
            type="color"
            value={block.backgroundColor || '#ffffff'}
            onChange={(e) => handleChange('backgroundColor', e.target.value)}
          />
        </div>

        {/* Block-specific properties */}
        {block.type === 'header' && (
          <>
            <div className="space-y-2">
              <Label>URL do Logo</Label>
              <Input
                value={block.logoUrl || ''}
                onChange={(e) => handleChange('logoUrl', e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Largura do Logo</Label>
              <Input
                value={block.logoWidth || ''}
                onChange={(e) => handleChange('logoWidth', e.target.value)}
                placeholder="150"
              />
            </div>
            <div className="space-y-2">
              <Label>Alinhamento</Label>
              <Select value={block.alignment || 'center'} onValueChange={(v) => handleChange('alignment', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Esquerda</SelectItem>
                  <SelectItem value="center">Centro</SelectItem>
                  <SelectItem value="right">Direita</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {block.type === 'heading' && (
          <>
            <div className="space-y-2">
              <Label>Texto</Label>
              <Input
                value={block.text || ''}
                onChange={(e) => handleChange('text', e.target.value)}
              />
              <VariablesPicker 
                onSelect={(variable) => handleChange('text', (block.text || '') + variable)}
              />
            </div>
            <div className="space-y-2">
              <Label>Nível</Label>
              <Select value={block.level} onValueChange={(v) => handleChange('level', v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="h1">H1</SelectItem>
                  <SelectItem value="h2">H2</SelectItem>
                  <SelectItem value="h3">H3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cor do Texto</Label>
              <Input
                type="color"
                value={block.color || '#333333'}
                onChange={(e) => handleChange('color', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tamanho da Fonte</Label>
              <Input
                value={block.fontSize || ''}
                onChange={(e) => handleChange('fontSize', e.target.value)}
                placeholder="32px"
              />
            </div>
          </>
        )}

        {block.type === 'text' && (
          <>
            <div className="space-y-2">
              <Label>Conteúdo</Label>
              <Textarea
                value={block.content || ''}
                onChange={(e) => handleChange('content', e.target.value)}
                rows={6}
              />
              <VariablesPicker 
                onSelect={(variable) => handleChange('content', (block.content || '') + variable)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor do Texto</Label>
              <Input
                type="color"
                value={block.color || '#666666'}
                onChange={(e) => handleChange('color', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Tamanho da Fonte</Label>
              <Input
                value={block.fontSize || ''}
                onChange={(e) => handleChange('fontSize', e.target.value)}
                placeholder="16px"
              />
            </div>
          </>
        )}

        {block.type === 'image' && (
          <>
            <div className="space-y-2">
              <Label>URL da Imagem</Label>
              <Input
                value={block.url || ''}
                onChange={(e) => handleChange('url', e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Texto Alternativo</Label>
              <Input
                value={block.alt || ''}
                onChange={(e) => handleChange('alt', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Largura</Label>
              <Input
                value={block.width || ''}
                onChange={(e) => handleChange('width', e.target.value)}
                placeholder="100%"
              />
            </div>
            <div className="space-y-2">
              <Label>Link (opcional)</Label>
              <Input
                value={block.linkUrl || ''}
                onChange={(e) => handleChange('linkUrl', e.target.value)}
                placeholder="https://..."
              />
            </div>
          </>
        )}

        {block.type === 'button' && (
          <>
            <div className="space-y-2">
              <Label>Texto do Botão</Label>
              <Input
                value={block.text || ''}
                onChange={(e) => handleChange('text', e.target.value)}
              />
              <VariablesPicker 
                onSelect={(variable) => handleChange('text', (block.text || '') + variable)}
              />
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input
                value={block.url || ''}
                onChange={(e) => handleChange('url', e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Cor do Botão</Label>
              <Input
                type="color"
                value={block.buttonColor || '#0066cc'}
                onChange={(e) => handleChange('buttonColor', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor do Texto</Label>
              <Input
                type="color"
                value={block.textColor || '#ffffff'}
                onChange={(e) => handleChange('textColor', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Border Radius</Label>
              <Input
                value={block.borderRadius || ''}
                onChange={(e) => handleChange('borderRadius', e.target.value)}
                placeholder="4px"
              />
            </div>
          </>
        )}

        {block.type === 'divider' && (
          <>
            <div className="space-y-2">
              <Label>Cor</Label>
              <Input
                type="color"
                value={block.color || '#dddddd'}
                onChange={(e) => handleChange('color', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Espessura</Label>
              <Input
                value={block.thickness || ''}
                onChange={(e) => handleChange('thickness', e.target.value)}
                placeholder="1px"
              />
            </div>
          </>
        )}

        {block.type === 'spacer' && (
          <div className="space-y-2">
            <Label>Altura</Label>
            <Input
              value={block.height || ''}
              onChange={(e) => handleChange('height', e.target.value)}
              placeholder="20px"
            />
          </div>
        )}

        {(block.type === 'columns-2' || block.type === 'columns-3') && (
          <>
            <div className="space-y-2">
              <Label>Espaço entre Colunas</Label>
              <Input
                value={(block as any).columnGap || ''}
                onChange={(e) => handleChange('columnGap', e.target.value)}
                placeholder="20px"
              />
            </div>
            <div className="p-3 rounded bg-muted/50 text-sm text-muted-foreground">
              Clique em uma coluna no editor para selecionar onde adicionar blocos. Depois escolha um bloco na barra lateral.
            </div>
          </>
        )}

        {block.type === 'product' && (
          <>
            <Button
              variant="outline"
              className="w-full mb-2"
              onClick={() => setProductPickerOpen(true)}
            >
              <Package className="h-4 w-4 mr-2" />
              Buscar Produto da Loja
            </Button>
            <ProductPickerDialog
              open={productPickerOpen}
              onOpenChange={setProductPickerOpen}
              onSelect={handleProductSelect}
            />
            <div className="space-y-2">
              <Label>URL da Imagem</Label>
              <Input
                value={block.imageUrl || ''}
                onChange={(e) => handleChange('imageUrl', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={block.name || ''}
                onChange={(e) => handleChange('name', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={block.description || ''}
                onChange={(e) => handleChange('description', e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label>Preço</Label>
              <Input
                value={block.price || ''}
                onChange={(e) => handleChange('price', e.target.value)}
                placeholder="R$ 99,00"
              />
            </div>
            <div className="space-y-2">
              <Label>Texto do Botão</Label>
              <Input
                value={block.buttonText || ''}
                onChange={(e) => handleChange('buttonText', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>URL do Botão</Label>
              <Input
                value={block.buttonUrl || ''}
                onChange={(e) => handleChange('buttonUrl', e.target.value)}
              />
            </div>
          </>
        )}

        {block.type === 'banner' && (
          <>
            <div className="space-y-2">
              <Label>URL da Imagem</Label>
              <Input
                value={block.imageUrl || ''}
                onChange={(e) => handleChange('imageUrl', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Texto Alternativo</Label>
              <Input
                value={block.alt || ''}
                onChange={(e) => handleChange('alt', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Link (opcional)</Label>
              <Input
                value={block.linkUrl || ''}
                onChange={(e) => handleChange('linkUrl', e.target.value)}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>Altura</Label>
              <Input
                value={block.height || ''}
                onChange={(e) => handleChange('height', e.target.value)}
                placeholder="auto"
              />
            </div>
          </>
        )}

        {block.type === 'footer' && (
          <>
            <div className="space-y-2">
              <Label>Conteúdo (HTML)</Label>
              <Textarea
                value={block.content || ''}
                onChange={(e) => handleChange('content', e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Alinhamento</Label>
              <Select value={block.alignment || 'center'} onValueChange={(v) => handleChange('alignment', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="left">Esquerda</SelectItem>
                  <SelectItem value="center">Centro</SelectItem>
                  <SelectItem value="right">Direita</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Cor do Texto</Label>
              <Input type="color" value={block.color || '#999999'} onChange={(e) => handleChange('color', e.target.value)} />
            </div>
          </>
        )}

        {block.type === 'legal' && (
          <>
            <div className="space-y-2">
              <Label>Conteúdo</Label>
              <Textarea
                value={block.content || ''}
                onChange={(e) => handleChange('content', e.target.value)}
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor do Texto</Label>
              <Input type="color" value={block.color || '#999999'} onChange={(e) => handleChange('color', e.target.value)} />
            </div>
          </>
        )}

        {block.type === 'social' && (
          <div className="p-3 rounded bg-muted/50 text-sm text-muted-foreground">
            Configure os links das redes sociais diretamente nos campos abaixo.
            {block.platforms?.map((platform, i) => (
              <div key={i} className="mt-2 space-y-1">
                <Label className="text-xs capitalize">{platform.name}</Label>
                <Input
                  value={platform.url}
                  onChange={(e) => {
                    const updated = [...(block.platforms || [])];
                    updated[i] = { ...updated[i], url: e.target.value };
                    handleChange('platforms', updated);
                  }}
                  placeholder="https://..."
                />
              </div>
            ))}
          </div>
        )}

        {block.type === 'unsubscribe' && (
          <>
            <div className="space-y-2">
              <Label>Texto</Label>
              <Input
                value={block.text || ''}
                onChange={(e) => handleChange('text', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Texto do Link</Label>
              <Input
                value={block.linkText || ''}
                onChange={(e) => handleChange('linkText', e.target.value)}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
