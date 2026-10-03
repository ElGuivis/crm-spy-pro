// Efeitos de notificação sem React: som e contador no ícone da aba. Usados por useWebNotifications.

export type NotificationSound = 'default' | 'chime' | 'pop' | 'bell' | 'none';

const SOUND_CONFIGS: Record<NotificationSound, { freq: number; type: OscillatorType; duration: number; freq2?: number }> = {
  default: { freq: 880, type: 'sine', duration: 0.3 },
  chime: { freq: 1200, type: 'sine', duration: 0.4, freq2: 1600 },
  pop: { freq: 600, type: 'triangle', duration: 0.15 },
  bell: { freq: 1400, type: 'sine', duration: 0.5, freq2: 700 },
  none: { freq: 0, type: 'sine', duration: 0 },
};

let originalFavicon: string | null = null;

export function setFaviconBadge(count: number) {
  const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) return;
  if (!originalFavicon) originalFavicon = link.href;

  document.title = document.title.replace(/^\(\d+\)\s/, '');
  if (count <= 0) {
    link.href = originalFavicon;
    return;
  }
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
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(50, 14, 14, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(count > 9 ? '9+' : String(count), 50, 15);
    link.href = canvas.toDataURL('image/png');
  };
  img.src = originalFavicon;
}

export function restoreFavicon() {
  if (!originalFavicon) return;
  const link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (link) link.href = originalFavicon;
}

export function playNotificationSound(soundType: NotificationSound = 'default') {
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
  } catch { /* áudio indisponível (autoplay bloqueado ou sem AudioContext): ignora */ }
}
