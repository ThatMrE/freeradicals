import { createGate, earnProgress, formatCountdown, formatRelative, getPlatform } from '../../core/index.js';
import { createChromeStorage } from '../shared/chrome-storage.js';
import { MSG, send } from '../shared/messages.js';

const $ = (id) => document.getElementById(id);
const gate = createGate({ storage: createChromeStorage('local') });

let minChars = 25;
let settings = null;

function updateCount() {
  const n = $('input').value.trim().length;
  $('count').textContent = `${n} / ${minChars}`;
  $('count').dataset.ok = n >= minChars ? '1' : '0';
  $('post').disabled = n < minChars;
  if (!settings) return;

  const earn = earnProgress($('input').value, settings);
  $('post').textContent = `Post & open feeds for ${formatCountdown(earn.ms)}`;
  $('earn').hidden = !earn.earning;
  if (!earn.earning) return;

  $('earnTime').textContent = formatCountdown(earn.ms);
  $('earn').dataset.cap = earn.atCap ? '1' : '0';
  if (earn.atCap) {
    $('earnNext').textContent = "that's the maximum";
    $('meterFill').parentElement.hidden = true;
  } else {
    $('meterFill').parentElement.hidden = false;
    $('earnNext').textContent = n < minChars
      ? `${earn.charsToNext} more to unlock posting`
      : `${earn.charsToNext} more buys ${formatCountdown(earn.nextMinutes * 60_000)}`;
    const step = settings.earnPerChars || 50;
    $('meterFill').style.width = `${Math.round(((step - earn.charsToNext) / step) * 100)}%`;
  }
}

function render() {
  const snap = gate.snapshot();
  settings = snap.settings;
  minChars = settings.minChars;

  $('dot').dataset.state = snap.status;
  $('clock').dataset.warn = snap.warning ? '1' : '0';
  $('clock').textContent = snap.status === 'unlocked' ? formatCountdown(snap.remainingMs) : '';
  $('statusText').textContent =
    snap.status === 'unlocked' ? 'Feeds are open'
      : snap.status === 'pending' ? 'Waiting on your post'
        : 'Feeds are locked';

  $('composeSection').hidden = snap.status !== 'locked';
  $('openSection').hidden = snap.status !== 'unlocked';
  $('pendingSection').hidden = snap.status !== 'pending';
  $('override').hidden = !snap.proofOverrideAvailable;
  if (snap.status === 'pending') {
    const p = getPlatform(snap.session && snap.session.platformId);
    $('pendingText').textContent = `Waiting for your post to appear on ${p ? p.name : 'the platform'}…`;
  }

  $('sToday').textContent = snap.stats.today;
  $('sStreak').textContent = snap.stats.streak;
  $('sWeek').textContent = snap.stats.week;
  $('sWords').textContent = snap.stats.words.toLocaleString();

  const recent = snap.journal.slice(0, 8);
  $('recent').innerHTML = recent.length
    ? recent.map((e) => {
      const platform = getPlatform(e.platformId);
      return `<div class="entry">
        <div>${escapeHtml(e.text).slice(0, 220)}</div>
        <div class="when">
          <span>${formatRelative(e.at, snap.now)}</span>
          ${platform ? `<span class="badge">${escapeHtml(platform.name)}</span>` : ''}
          ${e.verified ? '<span class="badge" data-verified="1">published</span>' : ''}
        </div>
      </div>`;
    }).join('')
    : '<p class="small muted">Nothing yet. The first post is the hard one.</p>';

  updateCount();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

$('input').addEventListener('input', () => { $('error').textContent = ''; updateCount(); });
$('input').addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
});
$('post').addEventListener('click', submit);
$('lock').addEventListener('click', async () => { await send(MSG.LOCK_NOW); render(); });
$('override').addEventListener('click', async () => { await send(MSG.OVERRIDE_PROOF); render(); });
$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

async function submit() {
  if ($('post').disabled) return;
  $('post').disabled = true;
  const res = await send(MSG.SUBMIT_POST, { text: $('input').value, platformId: null });
  if (res.ok) $('input').value = '';
  else $('error').textContent = res.message || 'Post rejected.';
  await gate.load();
  render();
}

gate.subscribe(render);
await gate.load();
render();
setInterval(render, 1000);
