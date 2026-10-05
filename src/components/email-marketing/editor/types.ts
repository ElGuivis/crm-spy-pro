export type BlockType =
  | 'header'
  | 'heading'
  | 'text'
  | 'image'
  | 'button'
  | 'divider'
  | 'spacer'
  | 'columns-2'
  | 'columns-3'
  | 'banner'
  | 'product'
  | 'coupon'
  | 'cart-items'
  | 'imagetext'
  | 'social'
  | 'footer'
  | 'legal'
  | 'unsubscribe';

export type Alignment = 'left' | 'center' | 'right';

export interface BaseBlockProps {
  backgroundColor?: string;
  padding?: string;
  margin?: string;
  borderRadius?: string;
  /** fonte só deste bloco (vazio = a do e-mail) */
  fontFamily?: string;
}

export interface HeaderBlock extends BaseBlockProps {
  type: 'header';
  logoUrl?: string;
  logoAlt?: string;
  logoWidth?: string;
  alignment?: 'left' | 'center' | 'right';
}

export interface HeadingBlock extends BaseBlockProps {
  type: 'heading';
  text: string;
  level: 'h1' | 'h2' | 'h3';
  alignment?: Alignment;
  color?: string;
  fontSize?: string;
  fontWeight?: 'normal' | 'bold';
  lineHeight?: string;
  /** TEXTO EM MAIÚSCULAS e espaçamento entre letras (títulos de impacto) */
  uppercase?: boolean;
  letterSpacing?: string;
}

export interface TextBlock extends BaseBlockProps {
  type: 'text';
  content: string;
  alignment?: Alignment;
  color?: string;
  fontSize?: string;
  fontWeight?: 'normal' | 'bold';
  lineHeight?: string;
  uppercase?: boolean;
  letterSpacing?: string;
}

export interface ImageBlock extends BaseBlockProps {
  type: 'image';
  url: string;
  alt: string;
  width?: string;
  alignment?: Alignment;
  linkUrl?: string;
}

export interface ButtonBlock extends BaseBlockProps {
  type: 'button';
  text: string;
  url: string;
  alignment?: 'left' | 'center' | 'right';
  buttonColor?: string;
  textColor?: string;
  buttonPadding?: string;
  fontSize?: string;
  fullWidth?: boolean;
}

export interface DividerBlock extends BaseBlockProps {
  type: 'divider';
  color?: string;
  thickness?: string;
  width?: string;
}

export interface SpacerBlock extends BaseBlockProps {
  type: 'spacer';
  height?: string;
}

export interface Columns2Block extends BaseBlockProps {
  type: 'columns-2';
  column1: EmailBlock[];
  column2: EmailBlock[];
  columnGap?: string;
  /** proporção das colunas (esquerda-direita, em %) */
  ratio?: '50-50' | '33-67' | '67-33' | '25-75' | '75-25';
  verticalAlign?: 'top' | 'middle';
  /** colunas por linha no celular (padrão 1) */
  mobileCols?: 1 | 2;
}

export interface Columns3Block extends BaseBlockProps {
  type: 'columns-3';
  column1: EmailBlock[];
  column2: EmailBlock[];
  column3: EmailBlock[];
  columnGap?: string;
  verticalAlign?: 'top' | 'middle';
  /** colunas por linha no celular (padrão 1; 2 deixa grades de produtos mais curtas) */
  mobileCols?: 1 | 2;
}

export interface BannerBlock extends BaseBlockProps {
  type: 'banner';
  imageUrl: string;
  alt: string;
  linkUrl?: string;
  height?: string;
}

export interface ProductBlock extends BaseBlockProps {
  type: 'product';
  imageUrl: string;
  name: string;
  description?: string;
  price?: string;
  buttonText?: string;
  buttonUrl?: string;
  /** alinhamento do conteúdo todo (imagem, textos e botão) */
  alignment?: Alignment;
  imageWidth?: string;
  imageRadius?: string;
  /** título e imagem levam ao link do botão (padrão: sim) */
  linkImage?: boolean;
  nameColor?: string;
  nameSize?: string;
  nameWeight?: 'normal' | 'bold';
  descriptionColor?: string;
  descriptionSize?: string;
  priceColor?: string;
  priceSize?: string;
  /** preço "de" (riscado) antes do preço atual */
  oldPrice?: string;
  oldPriceColor?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  buttonRadius?: string;
  buttonSize?: string;
  buttonFullWidth?: boolean;
}

/** Imagem de um lado e texto (com botão opcional) do outro. */
export interface ImageTextBlock extends BaseBlockProps {
  type: 'imagetext';
  imageUrl: string;
  alt?: string;
  linkUrl?: string;
  imagePosition?: 'left' | 'right';
  /** largura da imagem em % da linha */
  imageWidthPct?: '30' | '40' | '50';
  imageRadius?: string;
  verticalAlign?: 'top' | 'middle';
  title?: string;
  titleColor?: string;
  titleSize?: string;
  text?: string;
  textColor?: string;
  textSize?: string;
  alignment?: Alignment;
  buttonText?: string;
  buttonUrl?: string;
  buttonColor?: string;
  buttonTextColor?: string;
  buttonRadius?: string;
}

export interface CouponBlock extends BaseBlockProps {
  type: 'coupon';
  title?: string;
  code: string;
  description?: string;
  alignment?: Alignment;
  titleColor?: string;
  codeColor?: string;
  codeBackground?: string;
  borderColor?: string;
  descriptionColor?: string;
}

/** Itens que a pessoa deixou no carrinho (só em e-mails de recuperação): o envio troca {{cart_items}} pela lista. */
export interface CartItemsBlock extends BaseBlockProps {
  type: 'cart-items';
  title?: string;
  titleColor?: string;
  /** cor do nome, quantidade e preço dos itens */
  textColor?: string;
}

export interface SocialBlock extends BaseBlockProps {
  type: 'social';
  platforms: Array<{
    name: 'facebook' | 'instagram' | 'twitter' | 'linkedin' | 'youtube';
    url: string;
  }>;
  alignment?: 'left' | 'center' | 'right';
  iconSize?: string;
}

export interface FooterBlock extends BaseBlockProps {
  type: 'footer';
  content: string;
  alignment?: 'left' | 'center' | 'right';
  color?: string;
  fontSize?: string;
}

export interface LegalBlock extends BaseBlockProps {
  type: 'legal';
  content: string;
  fontSize?: string;
  color?: string;
}

export interface UnsubscribeBlock extends BaseBlockProps {
  type: 'unsubscribe';
  text: string;
  linkText: string;
  alignment?: 'left' | 'center' | 'right';
  fontSize?: string;
  color?: string;
}

export type EmailBlock =
  | HeaderBlock
  | HeadingBlock
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | Columns2Block
  | Columns3Block
  | BannerBlock
  | ProductBlock
  | CouponBlock
  | CartItemsBlock
  | ImageTextBlock
  | SocialBlock
  | FooterBlock
  | LegalBlock
  | UnsubscribeBlock;

export interface EmailContent {
  blocks: EmailBlock[];
  globalStyles?: {
    bodyBackground?: string;
    contentWidth?: string;
    fontFamily?: string;
    contentBackground?: string;
    linkColor?: string;
  };
}
