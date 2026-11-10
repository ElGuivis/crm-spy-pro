import type { ChangelogEntry } from './types';
import { RECENT_CHANGELOG } from './recent';
import { NOVEMBER_CHANGELOG } from './november';
import { MARCH_CHANGELOG } from './march';
import { EARLY_CHANGELOG } from './early';

export type { ChangelogEntry, ChangelogItem, ChangelogItemType } from './types';

/** Todas as novidades, da mais recente para a mais antiga. Para publicar uma nova versão, adicione no topo de `november.ts` (ou do arquivo do mês corrente). */
export const CHANGELOG: ChangelogEntry[] = [...NOVEMBER_CHANGELOG, ...RECENT_CHANGELOG, ...MARCH_CHANGELOG, ...EARLY_CHANGELOG];
