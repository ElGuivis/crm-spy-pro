import { useState } from 'react';
import { EmailBlock, EmailContent, Columns2Block, Columns3Block } from './types';
import { blockTemplates, blockCategories, blockLabels } from './blockTemplates';
import { BlockRenderer } from './BlockRenderer';
import { BlockPropertiesPanel } from './BlockPropertiesPanel';
import { generateEmailHTML } from './htmlGenerator';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { 
  Plus, 
  Trash2, 
  Copy, 
  ChevronUp, 
  ChevronDown,
  Monitor,
  Smartphone,
  Code,
  Eye
} from 'lucide-react';
import { toast } from 'sonner';

interface EmailEditorProps {
  initialContent?: EmailContent;
  onChange?: (content: EmailContent, html: string) => void;
}

// Represents which column is selected for adding blocks
interface ColumnTarget {
  blockIndex: number;
  columnKey: 'column1' | 'column2' | 'column3';
}

export function EmailEditor({ initialContent, onChange }: EmailEditorProps) {
  const [content, setContent] = useState<EmailContent>(
    initialContent || { blocks: [], globalStyles: {} }
  );
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null);
  const [selectedColumnPath, setSelectedColumnPath] = useState<{ blockIndex: number; columnKey: string; childIndex: number } | null>(null);
  const [columnTarget, setColumnTarget] = useState<ColumnTarget | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [viewMode, setViewMode] = useState<'editor' | 'preview' | 'code'>('editor');

  const handleAddBlock = (blockType: string) => {
    const template = blockTemplates[blockType];
    if (!template) return;
    const newBlock = JSON.parse(JSON.stringify(template)) as EmailBlock;

    // If a column target is set, add inside that column
    if (columnTarget) {
      const updatedBlocks = [...content.blocks];
      const parentBlock = updatedBlocks[columnTarget.blockIndex] as any;
      if (parentBlock && parentBlock[columnTarget.columnKey]) {
        parentBlock[columnTarget.columnKey] = [...parentBlock[columnTarget.columnKey], newBlock];
      }
      const updatedContent = { ...content, blocks: updatedBlocks };
      setContent(updatedContent);
      notifyChange(updatedContent);
      // Select the child block
      setSelectedBlockIndex(null);
      setSelectedColumnPath({
        blockIndex: columnTarget.blockIndex,
        columnKey: columnTarget.columnKey,
        childIndex: parentBlock[columnTarget.columnKey].length - 1,
      });
      toast.success('Bloco adicionado na coluna');
      return;
    }

    // Don't allow nesting columns
    if (blockType === 'columns-2' || blockType === 'columns-3') {
      // ok, add at root
    }

    const updatedBlocks = [...content.blocks, newBlock];
    const updatedContent = { ...content, blocks: updatedBlocks };
    
    setContent(updatedContent);
    setSelectedBlockIndex(updatedBlocks.length - 1);
    setSelectedColumnPath(null);
    notifyChange(updatedContent);
    toast.success('Bloco adicionado');
  };

  const handleUpdateBlock = (index: number, updates: Partial<EmailBlock>) => {
    const updatedBlocks = [...content.blocks];
    updatedBlocks[index] = { ...updatedBlocks[index], ...updates } as EmailBlock;
    const updatedContent = { ...content, blocks: updatedBlocks };
    
    setContent(updatedContent);
    notifyChange(updatedContent);
  };

  const handleUpdateColumnChild = (blockIndex: number, columnKey: string, childIndex: number, updates: Partial<EmailBlock>) => {
    const updatedBlocks = [...content.blocks];
    const parentBlock = updatedBlocks[blockIndex] as any;
    if (parentBlock && parentBlock[columnKey]) {
      const column = [...parentBlock[columnKey]];
      column[childIndex] = { ...column[childIndex], ...updates };
      parentBlock[columnKey] = column;
    }
    const updatedContent = { ...content, blocks: updatedBlocks };
    setContent(updatedContent);
    notifyChange(updatedContent);
  };

  const handleDeleteBlock = (index: number) => {
    const updatedBlocks = content.blocks.filter((_, i) => i !== index);
    const updatedContent = { ...content, blocks: updatedBlocks };
    
    setContent(updatedContent);
    setSelectedBlockIndex(null);
    setSelectedColumnPath(null);
    if (columnTarget && columnTarget.blockIndex === index) setColumnTarget(null);
    notifyChange(updatedContent);
    toast.success('Bloco removido');
  };

  const handleDeleteColumnChild = (blockIndex: number, columnKey: string, childIndex: number) => {
    const updatedBlocks = [...content.blocks];
    const parentBlock = updatedBlocks[blockIndex] as any;
    if (parentBlock && parentBlock[columnKey]) {
      parentBlock[columnKey] = parentBlock[columnKey].filter((_: any, i: number) => i !== childIndex);
    }
    const updatedContent = { ...content, blocks: updatedBlocks };
    setContent(updatedContent);
    setSelectedColumnPath(null);
    notifyChange(updatedContent);
    toast.success('Bloco removido da coluna');
  };

  const handleDuplicateBlock = (index: number) => {
    const blockToDuplicate = content.blocks[index];
    const duplicatedBlock = JSON.parse(JSON.stringify(blockToDuplicate)) as EmailBlock;
    const updatedBlocks = [
      ...content.blocks.slice(0, index + 1),
      duplicatedBlock,
      ...content.blocks.slice(index + 1),
    ];
    const updatedContent = { ...content, blocks: updatedBlocks };
    
    setContent(updatedContent);
    notifyChange(updatedContent);
    toast.success('Bloco duplicado');
  };

  const handleMoveBlock = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === content.blocks.length - 1) return;

    const updatedBlocks = [...content.blocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [updatedBlocks[index], updatedBlocks[targetIndex]] = [updatedBlocks[targetIndex], updatedBlocks[index]];
    
    const updatedContent = { ...content, blocks: updatedBlocks };
    setContent(updatedContent);
    setSelectedBlockIndex(targetIndex);
    notifyChange(updatedContent);
  };

  const handleMoveColumnChild = (blockIndex: number, columnKey: string, childIndex: number, direction: 'up' | 'down') => {
    const updatedBlocks = [...content.blocks];
    const parentBlock = updatedBlocks[blockIndex] as any;
    if (!parentBlock || !parentBlock[columnKey]) return;
    const column = [...parentBlock[columnKey]];
    const targetIndex = direction === 'up' ? childIndex - 1 : childIndex + 1;
    if (targetIndex < 0 || targetIndex >= column.length) return;
    [column[childIndex], column[targetIndex]] = [column[targetIndex], column[childIndex]];
    parentBlock[columnKey] = column;
    const updatedContent = { ...content, blocks: updatedBlocks };
    setContent(updatedContent);
    setSelectedColumnPath({ blockIndex, columnKey, childIndex: targetIndex });
    notifyChange(updatedContent);
  };

  const notifyChange = (updatedContent: EmailContent) => {
    if (onChange) {
      const html = generateEmailHTML(updatedContent);
      onChange(updatedContent, html);
    }
  };

  const getSelectedBlock = (): EmailBlock | null => {
    if (selectedColumnPath) {
      const parent = content.blocks[selectedColumnPath.blockIndex] as any;
      return parent?.[selectedColumnPath.columnKey]?.[selectedColumnPath.childIndex] || null;
    }
    if (selectedBlockIndex !== null) {
      return content.blocks[selectedBlockIndex] || null;
    }
    return null;
  };

  const handlePropertiesUpdate = (updates: Partial<EmailBlock>) => {
    if (selectedColumnPath) {
      handleUpdateColumnChild(selectedColumnPath.blockIndex, selectedColumnPath.columnKey, selectedColumnPath.childIndex, updates);
    } else if (selectedBlockIndex !== null) {
      handleUpdateBlock(selectedBlockIndex, updates);
    }
  };

  const handlePropertiesClose = () => {
    setSelectedBlockIndex(null);
    setSelectedColumnPath(null);
  };

  const generatedHTML = generateEmailHTML(content);

  const isColumnBlock = (block: EmailBlock) => block.type === 'columns-2' || block.type === 'columns-3';

  const renderColumnContent = (parentIndex: number, columnKey: string, blocks: EmailBlock[]) => {
    const isTarget = columnTarget?.blockIndex === parentIndex && columnTarget?.columnKey === columnKey;
    return (
      <div
        className={`min-h-[50px] border border-dashed rounded p-1 transition-colors cursor-pointer ${
          isTarget ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          setColumnTarget({ blockIndex: parentIndex, columnKey: columnKey as any });
          setSelectedBlockIndex(null);
          setSelectedColumnPath(null);
        }}
      >
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
            <Plus className="h-4 w-4 mb-1" />
            <span className="text-xs">Clique e adicione</span>
          </div>
        ) : (
          blocks.map((childBlock, childIdx) => {
            const isSelected = selectedColumnPath?.blockIndex === parentIndex && selectedColumnPath?.columnKey === columnKey && selectedColumnPath?.childIndex === childIdx;
            return (
              <div
                key={childIdx}
                className={`relative group/child ${isSelected ? 'ring-2 ring-primary rounded' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedColumnPath({ blockIndex: parentIndex, columnKey, childIndex: childIdx });
                  setSelectedBlockIndex(null);
                  setColumnTarget({ blockIndex: parentIndex, columnKey: columnKey as any });
                }}
              >
                <BlockRenderer block={childBlock} />
                {/* Child block actions */}
                <div className="absolute top-0 right-0 opacity-0 group-hover/child:opacity-100 transition-opacity flex gap-0.5 z-10">
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveColumnChild(parentIndex, columnKey, childIdx, 'up');
                    }}
                    disabled={childIdx === 0}
                  >
                    <ChevronUp className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMoveColumnChild(parentIndex, columnKey, childIdx, 'down');
                    }}
                    disabled={childIdx === blocks.length - 1}
                  >
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteColumnChild(parentIndex, columnKey, childIdx);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    );
  };

  // Filter block types that can go inside columns (no nested columns)
  const columnBlockCategories = blockCategories.map((cat) => ({
    ...cat,
    blocks: cat.blocks.filter((b) => b !== 'columns-2' && b !== 'columns-3'),
  })).filter((cat) => cat.blocks.length > 0);

  return (
    <div className="flex h-[calc(100vh-200px)] border rounded-lg overflow-hidden bg-background">
      {/* Block Palette */}
      <div className="w-64 border-r bg-muted/30">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Blocos</h3>
          {columnTarget && (
            <div className="mt-2 p-2 rounded bg-primary/10 border border-primary/30">
              <p className="text-xs font-medium text-primary">
                Adicionando em: {columnTarget.columnKey.replace('column', 'Coluna ')}
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-6 px-2 mt-1"
                onClick={() => setColumnTarget(null)}
              >
                Cancelar
              </Button>
            </div>
          )}
        </div>
        <ScrollArea className="h-[calc(100%-60px)]">
          <div className="p-4 space-y-4">
            {(columnTarget ? columnBlockCategories : blockCategories).map((category) => (
              <div key={category.name}>
                <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                  {category.name}
                </h4>
                <div className="space-y-1">
                  {category.blocks.map((blockType) => (
                    <Button
                      key={blockType}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => handleAddBlock(blockType)}
                    >
                      <Plus className="h-3 w-3 mr-2" />
                      {blockLabels[blockType]}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col">
        {/* Toolbar */}
        <div className="border-b p-4 flex items-center justify-between bg-background">
          <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
            <TabsList>
              <TabsTrigger value="editor">
                <Eye className="h-4 w-4 mr-2" />
                Editor
              </TabsTrigger>
              <TabsTrigger value="preview">
                <Monitor className="h-4 w-4 mr-2" />
                Preview
              </TabsTrigger>
              <TabsTrigger value="code">
                <Code className="h-4 w-4 mr-2" />
                HTML
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {viewMode === 'preview' && (
            <div className="flex gap-2">
              <Button
                variant={previewMode === 'desktop' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPreviewMode('desktop')}
              >
                <Monitor className="h-4 w-4 mr-2" />
                Desktop
              </Button>
              <Button
                variant={previewMode === 'mobile' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setPreviewMode('mobile')}
              >
                <Smartphone className="h-4 w-4 mr-2" />
                Mobile
              </Button>
            </div>
          )}
        </div>

        {/* Content Area */}
        <ScrollArea className="flex-1">
          {viewMode === 'editor' && (
            <div className="p-8" onClick={() => { setColumnTarget(null); setSelectedBlockIndex(null); setSelectedColumnPath(null); }}>
              <div className="max-w-3xl mx-auto bg-white rounded-lg shadow-sm border min-h-[600px]">
                {content.blocks.length === 0 ? (
                  <div className="flex items-center justify-center h-[600px] text-center p-8">
                    <div>
                      <div className="rounded-full bg-muted p-6 inline-block mb-4">
                        <Plus className="h-12 w-12 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">
                        Comece adicionando blocos
                      </h3>
                      <p className="text-muted-foreground mb-6">
                        Escolha um bloco na barra lateral para começar a construir seu e-mail
                      </p>
                    </div>
                  </div>
                ) : (
                  <div>
                    {content.blocks.map((block, index) => (
                      <div
                        key={index}
                        className={`relative group ${
                          selectedBlockIndex === index ? 'ring-2 ring-primary' : ''
                        }`}
                        onClick={() => {
                          setSelectedBlockIndex(index);
                          setSelectedColumnPath(null);
                          if (!isColumnBlock(block)) {
                            setColumnTarget(null);
                          }
                        }}
                      >
                        {/* Render columns with interactive slots */}
                        {block.type === 'columns-2' ? (
                          <div style={{ ...getBaseInlineStyles(block), display: 'flex', gap: (block as Columns2Block).columnGap || '20px', padding: block.padding || '20px' }}>
                            <div style={{ flex: 1 }}>
                              {renderColumnContent(index, 'column1', (block as Columns2Block).column1 || [])}
                            </div>
                            <div style={{ flex: 1 }}>
                              {renderColumnContent(index, 'column2', (block as Columns2Block).column2 || [])}
                            </div>
                          </div>
                        ) : block.type === 'columns-3' ? (
                          <div style={{ ...getBaseInlineStyles(block), display: 'flex', gap: (block as Columns3Block).columnGap || '15px', padding: block.padding || '20px' }}>
                            <div style={{ flex: 1 }}>
                              {renderColumnContent(index, 'column1', (block as Columns3Block).column1 || [])}
                            </div>
                            <div style={{ flex: 1 }}>
                              {renderColumnContent(index, 'column2', (block as Columns3Block).column2 || [])}
                            </div>
                            <div style={{ flex: 1 }}>
                              {renderColumnContent(index, 'column3', (block as Columns3Block).column3 || [])}
                            </div>
                          </div>
                        ) : (
                          <BlockRenderer block={block} />
                        )}
                        
                        {/* Block Actions */}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-20">
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveBlock(index, 'up');
                            }}
                            disabled={index === 0}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMoveBlock(index, 'down');
                            }}
                            disabled={index === content.blocks.length - 1}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDuplicateBlock(index);
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="destructive"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBlock(index);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {viewMode === 'preview' && (
            <div className="p-8 bg-muted/30">
              <div
                className={`mx-auto bg-white rounded-lg shadow-sm transition-all ${
                  previewMode === 'desktop' ? 'max-w-3xl' : 'max-w-sm'
                }`}
              >
                {content.blocks.map((block, index) => (
                  <BlockRenderer key={index} block={block} isPreview />
                ))}
              </div>
            </div>
          )}

          {viewMode === 'code' && (
            <div className="p-8">
              <Card className="p-4">
                <pre className="text-xs overflow-x-auto">
                  <code>{generatedHTML}</code>
                </pre>
              </Card>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Properties Panel */}
      {(selectedBlockIndex !== null || selectedColumnPath !== null) && viewMode === 'editor' && (
        <BlockPropertiesPanel
          block={getSelectedBlock()}
          onUpdate={handlePropertiesUpdate}
          onClose={handlePropertiesClose}
        />
      )}
    </div>
  );
}

function getBaseInlineStyles(block: EmailBlock): React.CSSProperties {
  const styles: React.CSSProperties = {};
  if (block.backgroundColor) styles.backgroundColor = block.backgroundColor;
  if (block.borderRadius) styles.borderRadius = block.borderRadius;
  return styles;
}
