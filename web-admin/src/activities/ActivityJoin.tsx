import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/**
 * How the room is told to join.
 *
 * A relative "/play/CODE" cannot be typed into a phone, so the server resolves
 * an absolute address (Cloudflare tunnel, .local name, or LAN address — the
 * teacher chooses in Settings) and projects it as `joinUrl`. The QR encodes
 * that absolute URL; the printed line drops the scheme because it is read
 * aloud and typed by hand.
 */

const textOf = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;

/** "https://room.example.com/play/AB12CD" -> "room.example.com/play/AB12CD" */
export function readableJoinAddress(joinUrl: string, joinCode: string): string {
  const trimmed = joinUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return trimmed || `/play/${joinCode}`;
}

export const ActivityQr: React.FC<{ value: string; size?: number; label?: string }> = ({
  value,
  size = 160,
  label,
}) => {
  const [source, setSource] = useState('');

  useEffect(() => {
    let active = true;
    // High error correction: a projected code is often scanned at an angle,
    // from across a room, or partly glared out.
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: 'H',
      color: { dark: '#101418', light: '#ffffff' },
    })
      .then(url => { if (active) setSource(url); })
      .catch(() => { if (active) setSource(''); });
    return () => { active = false; };
  }, [size, value]);

  if (!source) return <div className="activity-qr activity-qr-pending" style={{ width: size, height: size }} aria-hidden="true" />;
  return <img
    className="activity-qr"
    src={source}
    width={size}
    height={size}
    alt={label || `QR code to join at ${readableJoinAddress(value, '')}`}
  />;
};

export interface ActivityJoinBannerProps {
  joinCode?: unknown;
  joinUrl?: unknown;
  participantCount?: unknown;
  /**
   * `prominent` is the lobby treatment, `compact` rides above live play, and
   * `corner` sits out of the way for the whole game so a latecomer always has
   * something to join with.
   */
  variant?: 'compact' | 'prominent' | 'corner';
}

/**
 * One join banner for every engine. Engines previously duplicated this markup,
 * which is why some stages showed a URL a phone could not use.
 */
export const ActivityJoinBanner: React.FC<ActivityJoinBannerProps> = ({
  joinCode,
  joinUrl,
  participantCount,
  variant = 'compact',
}) => {
  const code = textOf(joinCode).toUpperCase();
  if (!code) return null;
  const url = textOf(joinUrl);
  const address = url ? readableJoinAddress(url, code) : `/play/${code}`;
  const joined = typeof participantCount === 'number' ? participantCount : 0;

  if (variant === 'prominent') {
    return <section className="activity-join-prominent" aria-label="Join this game on a phone">
      <div className="activity-join-prominent-copy">
        <span>JOIN ON YOUR PHONE</span>
        <strong className="activity-join-address">{address}</strong>
        <div className="activity-join-code" aria-label={`Game code ${code.split('').join(' ')}`}>{code}</div>
        <small>{joined === 1 ? '1 player in' : `${joined} players in`}</small>
      </div>
      {url && <div className="activity-join-prominent-qr">
        <ActivityQr value={url} size={220} label={`Scan to join at ${address}`} />
        <span>SCAN TO JOIN</span>
      </div>}
    </section>;
  }

  if (variant === 'corner') {
    return <aside className="activity-join-corner" aria-label="Join this game on a phone">
      {url && <ActivityQr value={url} size={64} label={`Scan to join at ${address}`} />}
      <div>
        <span>JOIN</span>
        <strong className="activity-join-corner-address">{address}</strong>
        <b aria-label={`Game code ${code.split('').join(' ')}`}>{code}</b>
      </div>
    </aside>;
  }

  return <div className="interactive-join-banner" aria-label="Join this activity on a phone">
    {url && <ActivityQr value={url} size={44} label={`Scan to join at ${address}`} />}
    <span>JOIN THE GAME</span>
    <strong>{address}</strong>
    <b>CODE {code}</b>
    <small>{joined} joined</small>
  </div>;
};
