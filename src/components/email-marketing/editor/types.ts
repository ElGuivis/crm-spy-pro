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
  | 'social'
  | 'footer'
  | 'legal'
  | 'unsubscribe';

export interface BaseBlockProps {
  backgroundColor?: string;
  padding?: string;
  margin?: string;
  borderRadius?: string;
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
  alignment?: 'left' | 'center' | 'right';
  color?: string;
  fontSize?: string;
}

export interface TextBlock extends BaseBlockProps {
  type: 'text';
  content: string;
  alignment?: 'left' | 'center' | 'right';
  color?: string;
  fontSize?: string;
}

export interface ImageBlock extends BaseBlockProps {
  type: 'image';
  url: string;
  alt: string;
  width?: string;
  alignment?: 'left' | 'center' | 'right';
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
}

export interface Columns3Block extends BaseBlockProps {
  type: 'columns-3';
  column1: EmailBlock[];
  column2: EmailBlock[];
  column3: EmailBlock[];
  columnGap?: string;
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
  };
}
