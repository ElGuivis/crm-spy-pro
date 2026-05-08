import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type NotificationEventType = 'new_order' | 'new_message' | 'sync_error' | 'low_stock' | 'rfm_alert' | 'campaign_complete';
export type NotificationSound = 'default' | 'chime' | 'pop' | 'bell' | 'none';

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

// Sound definitions
const SOUND_CONFIGS: Record<NotificationSound, { freq: number; type: OscillatorType; duration: number; freq2?: number }> = {
  default: { freq: 880, type: 'sine', duration: 0.3 },
  chime: { freq: 1200, type: 'sine', duration: 0.4, freq2: 1600 },
  pop: { freq: 600, type: 'triangle', duration: 0.15 },
  bell: { freq: 1400, type: 'sine', duration: 0.5, freq2: 700 },
  none: { freq: 0, type: 'sine', duration: 0 },
};

// Favicon badge manager
let originalFavicon: string | null = null;

function setFaviconBadge(count: number) {
  const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) return;
  if (!originalFavicon) originalFavicon = link.href;

  if (count <= 0) {
    link.href = originalFavicon;
    document.title = document.title.replace(/^\(\d+\)\s/, '');
    return;
  }

  document.title = document.title.replace(/^\(\d+\)\s/, '');
  document.title = `(${count > 99 ? '99+' : count}) ${document.title}`;

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    ctx.drawImage(img, 0, 0, 64, 64);
    // Badge circle
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(50, 14, 14, 0, 2 * Math.PI);
    ctx.fill();
    // White border
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(count > 9 ? '9+' : String(count), 50, 15);
    link.href = canvas.toDataURL('image/png');
  };
  img.src = originalFavicon;
}

function playNotificationSound(soundType: NotificationSound = 'default') {
  if (soundType === 'none') return;
  try {
    const config = SOUND_CONFIGS[soundType];
    const ctx = new AudioContext();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + config.duration);

    const osc = ctx.createOscillator();
    osc.connect(gain);
    osc.frequency.value = config.freq;
    osc.type = config.type;
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + config.duration);

    // Second tone for chime/bell
    if (config.freq2) {
      const gain2 = ctx.createGain();
      gain2.connect(ctx.destination);
      gain2.gain.setValueAtTime(0.2, ctx.currentTime + config.duration * 0.3);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + config.duration * 1.5);
      const osc2 = ctx.createOscillator();
      osc2.connect(gain2);
      osc2.frequency.value = config.freq2;
      osc2.type = config.type;
      osc2.start(ctx.currentTime + config.duration * 0.3);
      osc2.stop(ctx.currentTime + config.duration * 1.5);
    }
  } catch {}
}

export function previewSound(soundType: NotificationSound) {
  playNotificationSound(soundType);
}

export function useWebNotifications() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [prefs, setPrefsState] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  const badgeCountRef = useRef(0);

  // Load from DB on mount
  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('notification_prefs')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data?.notification_prefs) {
        setPrefsState({ ...DEFAULT_PREFS, ...(data.notification_prefs as any) });
      }
      setLoaded(true);
    };
    load();
  }, [user?.id]);

  const persistPrefs = useCallback(async (next: NotificationPreferences) => {
    if (!user?.id) return;
    await supabase
      .from('profiles')
      .update({ notification_prefs: next as any })
      .eq('user_id', user.id);
  }, [user?.id]);

  const setPrefs = useCallback((update: Partial<NotificationPreferences>) => {
    setPrefsState(prev => {
      const next = { ...prev, ...update };
      persistPrefs(next);
      return next;
    });
  }, [persistPrefs]);

  const setEventEnabled = useCallback((event: NotificationEventType, enabled: boolean) => {
    setPrefsState(prev => {
      const next = { ...prev, events: { ...prev.events, [event]: enabled } };
      persistPrefs(next);
      return next;
    });
  }, [persistPrefs]);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }, []);

  const updateBadge = useCallback((count: number) => {
    badgeCountRef.current = count;
    setFaviconBadge(count);
  }, []);

  const notify = useCallback((eventType: NotificationEventType, title: string, body: string, options?: { link?: string }) => {
    if (!prefs.enabled || !prefs.events[eventType]) return;
    if (prefs.sound) playNotificationSound(prefs.soundType);
    if (permission === 'granted') {
      const n = new Notification(title, { body, icon: '/favicon.png', tag: eventType });
      if (options?.link) {
        n.onclick = () => { window.focus(); window.location.hash = options.link!; };
      }
    }
  }, [permission, prefs]);

  const notifyNewOrder = useCallback((orderNumber: string, customerName: string, total?: number) => {
    const body = total
      ? `Pedido #${orderNumber} - ${customerName} - R$ ${total.toFixed(2)}`
      : `Pedido #${orderNumber} - ${customerName}`;
    notify('new_order', '🛒 Novo pedido!', body, { link: '/sales' });
  }, [notify]);

  useEffect(() => {
    return () => {
      if (originalFavicon) {
        const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
        if (link) link.href = originalFavicon;
      }
    };
  }, []);

  return {
    permission,
    requestPermission,
    notifyNewOrder,
    notify,
    prefs,
    setPrefs,
    setEventEnabled,
    updateBadge,
  };
}
