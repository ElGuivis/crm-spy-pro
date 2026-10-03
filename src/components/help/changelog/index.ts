import type { ChangelogEntry } from './types';
import { RECENT_CHANGELOG } from './recent';
import { MARCH_CHANGELOG } from './march';
import { EARLY_CHANGELOG } from './early';

export type { ChangelogEntry, ChangelogItem, ChangelogItemType } from './types';

/** Todas as novidades, da mais recente para a mais antiga. Para publicar uma nova versão, adicione no topo de `recent.ts`. */
export const CHANGELOG: ChangelogEntry[] = [...RECENT_CHANGELOG, ...MARCH_CHANGELOG, ...EARLY_CHANGELOG];
