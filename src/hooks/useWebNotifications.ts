import { useState, useCallback, useEffect, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { createLogger } from '@/lib/logger';
import { playNotificationSound, setFaviconBadge, restoreFavicon, type NotificationSound } from './notification-effects';

const log = createLogger('useWebNotifications');

export type { NotificationSound } from './notification-effects';
export type NotificationEventType = 'new_order' | 'new_message' | 'sync_error' | 'low_stock' | 'rfm_alert' | 'campaign_complete';

interface NotificationPreferences {
  enabled: boolean;
  sound: boolean;
  soundType: NotificationSound;
  events: Record<NotificationEventType, boolean>;
}

const DEFAULT_PREFS: NotificationPreferences = {
  enabled: true,
  sound: true,
  soundType: 'default',
  events: {
    new_order: true,
    new_message: true,
    sync_error: true,
    low_stock: true,
    rfm_alert: true,
    campaign_complete: true,
  },
};

export function previewSound(soundType: NotificationSound) {
  playNotificationSound(soundType);
}

// Preferências compartilhadas por TODAS as telas que usam o hook (Configurações, aviso de pedidos...).
// Antes cada uso guardava a própria cópia: mudar na tela de Configurações só valia após recarregar a página.
let sharedPrefs: NotificationPreferences = DEFAULT_PREFS;
let loadedForUser: string | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const getSnapshot = () => sharedPrefs;
function publish(next: NotificationPreferences) {
  sharedPrefs = next;
  listeners.forEach((l) => l());
}

/** Lê as preferências no momento da chamada (útil dentro de callbacks de realtime, sem cópia desatualizada). */
export function isNotificationEnabled(event: NotificationEventType): boolean {
  return sharedPrefs.enabled && sharedPrefs.events[event];
}

function mergePrefs(saved: Partial<NotificationPreferences> | null | undefined): NotificationPreferences {
  return { ...DEFAULT_PREFS, ...saved, events: { ...DEFAULT_PREFS.events, ...(saved?.events ?? {}) } };
}

export function useWebNotifications() {
  const { user } = useAuth();
  const prefs = useSyncExternalStore(subscribe, getSnapshot);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  // Carrega do banco uma vez por usuário
  useEffect(() => {
    if (!user?.id || loadedForUser === user.id) return;
    loadedForUser = user.id;
    supabase
      .from('profiles')
      .select('notification_prefs')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { log.error('Erro ao carregar preferências de notificação:', error); loadedForUser = null; return; }
        publish(mergePrefs(data?.notification_prefs as Partial<NotificationPreferences> | null));
      });
  }, [user?.id]);

  const persist = useCallback(async (next: NotificationPreferences) => {
    if (!user?.id) return;
    const { error } = await supabase
      .from('profiles')
      .update({ notification_prefs: next as unknown as Json })
      .eq('user_id', user.id);
    if (error) log.error('Erro ao salvar preferências de notificação:', error);
  }, [user?.id]);

  const setPrefs = useCallback((update: Partial<NotificationPreferences>) => {
    const next: NotificationPreferences = { ...sharedPrefs, ...update, events: update.events ?? sharedPrefs.events };
    // Religar o som com o tipo salvo em "Sem som" deixava tudo mudo: volta ao som padrão
    if (update.sound === true && next.soundType === 'none') next.soundType = 'default';
    publish(next);
    void persist(next);
  }, [persist]);

  const setEventEnabled = useCallback((event: NotificationEventType, enabled: boolean) => {
    const next: NotificationPreferences = { ...sharedPrefs, events: { ...sharedPrefs.events, [event]: enabled } };
    publish(next);
    void persist(next);
  }, [persist]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    setPermission(await Notification.requestPermission());
  }, []);

  const updateBadge = useCallback((count: number) => setFaviconBadge(count), []);

  // Lê preferências e permissão no instante do disparo: não depende de cópia capturada antes
  const notify = useCallback((eventType: NotificationEventType, title: string, body: string, options?: { link?: string }) => {
    if (!isNotificationEnabled(eventType)) return;
    if (sharedPrefs.sound) playNotificationSound(sharedPrefs.soundType);
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const n = new Notification(title, { body, icon: '/favicon.png', tag: eventType });
      if (options?.link) {
        n.onclick = () => { window.focus(); window.location.hash = options.link!; };
      }
    }
  }, []);

  const notifyNewOrder = useCallback((orderNumber: string, customerName: string, total?: number) => {
    const body = total
      ? `Pedido #${orderNumber} - ${customerName} - R$ ${total.toFixed(2)}`
      : `Pedido #${orderNumber} - ${customerName}`;
    notify('new_order', '🛒 Novo pedido!', body, { link: '/sales' });
  }, [notify]);

  useEffect(() => restoreFavicon, []);

  return { permission, requestPermission, notifyNewOrder, notify, prefs, setPrefs, setEventEnabled, updateBadge };
}
