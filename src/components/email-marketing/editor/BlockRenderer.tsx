import { EmailBlock } from './types';
import { sanitizeHtml } from '@/lib/sanitize-html';

interface BlockRendererProps {
  block: EmailBlock;
  isPreview?: boolean;
}

export function BlockRenderer({ block, isPreview = false }: BlockRendererProps) {
  const baseClasses = "border-2 border-dashed border-transparent hover:border-primary/50 transition-colors";
  const previewClasses = "pointer-events-none";
  
  const wrapperClass = isPreview ? previewClasses : baseClasses;

  const getBaseStyles = () => {
    const styles: React.CSSProperties = {};
    if (block.backgroundColor) styles.backgroundColor = block.backgroundColor;
    if (block.padding) styles.padding = block.padding;
    if (block.margin) styles.margin = block.margin;
    if (block.borderRadius) styles.borderRadius = block.borderRadius;
    return styles;
  };

  switch (block.type) {
    case 'header':
      return (
        <div className={wrapperClass} style={getBaseStyles()}>
          <div style={{ textAlign: block.alignment || 'center', padding: block.padding || '20px' }}>
            {block.logoUrl ? (
              <img src={block.logoUrl} alt={block.logoAlt || 'Logo'} style={{ width: block.logoWidth || '150px', maxWidth: '100%' }} />
            ) : (
              <div style={{ fontSize: '24px', fontWeight: 'bold' }}>Logo</div>
            )}
          </div>
        </div>
      );

    case 'heading':
      const HeadingTag = block.level as keyof JSX.IntrinsicElements;
      return (
        <div className={wrapperClass} style={getBaseStyles()}>
          <div style={{ textAlign: block.alignment || 'left', padding: block.padding || '20px' }}>
            <HeadingTag style={{ margin: 0, color: block.color || '#333', fontSize: block.fontSize || '32px', fontWeight: 'bold' }}>
              {block.text || 'Título'}
            </HeadingTag>
          </div>
        </div>
      );

    case 'text':
      return (
        <div className={wrapperClass} style={getBaseStyles()}>
          <div style={{ 
            textAlign: block.alignment || 'left', 
            color: block.color || '#666', 
            fontSize: block.fontSize || '16px',
            lineHeight: 1.6,
            padding: block.padding || '20px',
            whiteSpace: 'pre-wrap'
          }}>
            {block.content || 'Texto do parágrafo'}
          </div>
        </div>
      );

    case 'image':
      const imgElement = (
        <img 
          src={block.url || 'https://via.placeholder.com/600x300'} 
          alt={block.alt || 'Imagem'} 
          style={{ width: block.width || '100%', maxWidth: '100%', display: 'block' }} 
        />
      );
      return (
        <div className={wrapperClass} style={getBaseStyles()}>
          <div style={{ textAlign: block.alignment || 'center', padding: block.padding || '20px' }}>
            {block.linkUrl ? <a href={block.linkUrl}>{imgElement}</a> : imgElement}
          </div>
        </div>
      );

    case 'button':
      return (
        <div className={wrapperClass} style={getBaseStyles()}>
          <div style={{ textAlign: block.alignment || 'center', padding: block.padding || '20px' }}>
            <a 
              href={block.url || '#'} 
              style={{
                display: 'inline-block',
                padding: block.buttonPadding || '12px 30px',
                backgroundColor: block.buttonColor || '#0066cc',
                color: block.textColor || '#ffffff',
                textDecoration: 'none',
                borderRadius: block.borderRadius || '4px',
                fontWeight: 'bold'
              }}
            >
              {block.text || 'Clique aqui'}
            </a>
          </div>
        </div>
      );

    case 'divider':
      return (
        <div className={wrapperClass} style={getBaseStyles()}>
          <div style={{ padding: block.padding || '20px' }}>
            <hr style={{ 
              border: 'none', 
              borderTop: `${block.thickness || '1px'} solid ${block.color || '#ddd'}`,
              width: block.width || '100%',
              margin: 0
            }} />
          </div>
        </div>
      );

    case 'spacer':
      return (
        <div className={wrapperClass} style={{ height: block.height || '20px' }} />
      );

    case 'columns-2':
      return (
        <div className={wrapperClass} style={getBaseStyles()}>
          <div style={{ display: 'flex', gap: block.columnGap || '20px', padding: block.padding || '20px' }}>
            <div style={{ flex: 1, minHeight: '50px', border: '1px dashed #ccc', padding: '10px' }}>
              {block.column1?.length ? block.column1.map((b, i) => <BlockRenderer key={i} block={b} isPreview={isPreview} />) : <p className="text-muted-foreground text-center text-sm">Coluna 1</p>}
            </div>
            <div style={{ flex: 1, minHeight: '50px', border: '1px dashed #ccc', padding: '10px' }}>
              {block.column2?.length ? block.column2.map((b, i) => <BlockRenderer key={i} block={b} isPreview={isPreview} />) : <p className="text-muted-foreground text-center text-sm">Coluna 2</p>}
            </div>
          </div>
        </div>
      );

    case 'columns-3':
      return (
        <div className={wrapperClass} style={getBaseStyles()}>
          <div style={{ display: 'flex', gap: block.columnGap || '15px', padding: block.padding || '20px' }}>
            <div style={{ flex: 1, minHeight: '50px', border: '1px dashed #ccc', padding: '10px' }}>
              {block.column1?.length ? block.column1.map((b, i) => <BlockRenderer key={i} block={b} isPreview={isPreview} />) : <p className="text-muted-foreground text-center text-sm">Col 1</p>}
            </div>
            <div style={{ flex: 1, minHeight: '50px', border: '1px dashed #ccc', padding: '10px' }}>
              {block.column2?.length ? block.column2.map((b, i) => <BlockRenderer key={i} block={b} isPreview={isPreview} />) : <p className="text-muted-foreground text-center text-sm">Col 2</p>}
            </div>
            <div style={{ flex: 1, minHeight: '50px', border: '1px dashed #ccc', padding: '10px' }}>
              {block.column3?.length ? block.column3.map((b, i) => <BlockRenderer key={i} block={b} isPreview={isPreview} />) : <p className="text-muted-foreground text-center text-sm">Col 3</p>}
            </div>
          </div>
        </div>
      );

    case 'banner':
      const bannerImg = (
        <img 
          src={block.imageUrl || 'https://via.placeholder.com/600x200'} 
          alt={block.alt || 'Banner'} 
          style={{ width: '100%', height: block.height || 'auto', display: 'block' }} 
        />
      );
      return (
        <div className={wrapperClass} style={getBaseStyles()}>
          {block.linkUrl ? <a href={block.linkUrl}>{bannerImg}</a> : bannerImg}
        </div>
      );

    case 'product':
      return (
        <div className={wrapperClass} style={getBaseStyles()}>
          <div style={{ padding: block.padding || '20px', textAlign: 'center' }}>
            <img src={block.imageUrl || 'https://via.placeholder.com/300x300'} alt={block.name} style={{ maxWidth: '300px', width: '100%', marginBottom: '15px' }} />
            <h3 style={{ margin: '0 0 10px', fontSize: '20px' }}>{block.name || 'Nome do Produto'}</h3>
            {block.description && <p style={{ margin: '0 0 10px', color: '#666', fontSize: '14px' }}>{block.description}</p>}
            {block.price && <p style={{ margin: '0 0 15px', fontSize: '24px', fontWeight: 'bold', color: '#0066cc' }}>{block.price}</p>}
            {block.buttonText && (
              <a href={block.buttonUrl || '#'} style={{ display: 'inline-block', padding: '12px 30px', backgroundColor: '#0066cc', color: '#fff', textDecoration: 'none', borderRadius: '4px', fontWeight: 'bold' }}>
                {block.buttonText}
              </a>
            )}
          </div>
        </div>
      );

    case 'social':
      return (
        <div className={wrapperClass} style={getBaseStyles()}>
          <div style={{ textAlign: block.alignment || 'center', padding: block.padding || '20px' }}>
            {block.platforms?.map((platform, i) => (
              <a key={i} href={platform.url} style={{ display: 'inline-block', margin: '0 8px' }}>
                <div style={{ width: block.iconSize || '32px', height: block.iconSize || '32px', backgroundColor: '#ccc', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>
                  {platform.name[0].toUpperCase()}
                </div>
              </a>
            )) || <p className="text-muted-foreground">Adicione redes sociais</p>}
          </div>
        </div>
      );

    case 'footer':
      return (
        <div className={wrapperClass} style={getBaseStyles()}>
          <div style={{ textAlign: block.alignment || 'center', color: block.color || '#999', fontSize: block.fontSize || '14px', padding: block.padding || '20px', lineHeight: 1.6 }}>
            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(block.content || 'Rodapé do e-mail') }} />
          </div>
        </div>
      );

    case 'legal':
      return (
        <div className={wrapperClass} style={getBaseStyles()}>
          <div style={{ textAlign: 'center', color: block.color || '#999', fontSize: block.fontSize || '11px', padding: block.padding || '20px', lineHeight: 1.4 }}>
            {block.content || 'Texto legal e informações obrigatórias'}
          </div>
        </div>
      );

    case 'unsubscribe':
      return (
        <div className={wrapperClass} style={getBaseStyles()}>
          <div style={{ textAlign: block.alignment || 'center', color: block.color || '#999', fontSize: block.fontSize || '12px', padding: block.padding || '20px' }}>
            {block.text || 'Não quer mais receber nossos e-mails?'} <a href="#" style={{ color: block.color || '#999', textDecoration: 'underline' }}>{block.linkText || 'Cancelar inscrição'}</a>
          </div>
        </div>
      );

    default:
      return null;
  }
}
