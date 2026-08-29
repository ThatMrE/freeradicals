/** Formatting helpers shared by the block screen, the popup, and the badge. */

export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Compact form for the toolbar badge, which fits about four characters. */
export function formatBadge(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  if (total >= 60) return `${Math.ceil(total / 60)}m`;
  return `${total}s`;
}

export function formatRelative(ts, now = Date.now()) {
  const diff = Math.max(0, now - ts);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}
