export type ChangelogItemType = 'feature' | 'improvement' | 'fix';

export interface ChangelogItem {
  type: ChangelogItemType;
  text: string;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  items: ChangelogItem[];
}
