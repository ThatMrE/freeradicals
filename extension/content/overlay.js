import { earnProgress, formatCountdown, pickQuote } from '../../core/index.js';

/**
 * The block screen and the countdown pill, rendered into a closed shadow root
 * so no site stylesheet can reach in and no site script can read it back out.
 *
 * The overlay never decides anything. It renders a snapshot from the core gate
 * and reports intent back through callbacks; every decision belongs to the gate.
 */

const HOST_ID = 'freeradicals-root';
const Z = 2147483647;

const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }
/* Several blocks below set display, which would otherwise beat [hidden]. */
[hidden] { display: none !important; }

.layer {
  position: fixed; inset: 0; z-index: ${Z};
  display: none; align-items: center; justify-content: center;
  padding: 24px;
  font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  color: #f4f4f5;
  background: radial-gradient(120% 120% at 50% 0%, #1b2030 0%, #0b0d12 60%, #08090d 100%);
  -webkit-font-smoothing: antialiased;
}
.layer[data-show="1"] { display: flex; }

.card {
  width: min(640px, 100%);
  max-height: calc(100vh - 48px);
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 18px;
}

.eyebrow {
  display: flex; align-items: center; gap: 10px;
  font-size: 12px; letter-spacing: .14em; text-transform: uppercase;
  color: #8b93a7;
}
.dot { width: 8px; height: 8px; border-radius: 999px; background: var(--accent, #7c8cff); }

h1 { margin: 0; font-size: 30px; line-height: 1.15; font-weight: 650; letter-spacing: -0.02em; }
.lede { margin: 0; font-size: 15px; line-height: 1.6; color: #a8b0c2; max-width: 52ch; }

.composer { display: flex; flex-direction: column; gap: 10px; }
textarea {
  width: 100%; min-height: 148px; resize: vertical;
  padding: 16px; border-radius: 14px;
  background: #12151d; color: #f4f4f5;
  border: 1px solid #262b38;
  font: inherit; font-size: 16px; line-height: 1.55;
  outline: none; transition: border-color .15s ease, box-shadow .15s ease;
}
textarea::placeholder { color: #5c6478; }
textarea:focus { border-color: var(--accent, #7c8cff); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #7c8cff) 22%, transparent); }

.meta { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; min-height: 20px; }
.count { color: #6f7789; font-variant-numeric: tabular-nums; }
.count[data-ok="1"] { color: #4ade80; }
.error { color: #fca5a5; text-align: right; }

.earn {
  display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap;
  font-size: 13px; color: #8b93a7; min-height: 20px;
}
.earn b {
  color: #f4f4f5; font-weight: 600; font-size: 15px;
  font-variant-numeric: tabular-nums;
  transition: color .2s ease;
}
.earn[data-grew="1"] b { color: var(--accent, #7c8cff); }
.earn[data-cap="1"] b { color: #4ade80; }
.meter {
  flex: 0 1 120px; min-width: 60px; height: 3px; border-radius: 999px;
  background: #1e232f; overflow: hidden;
}
.meter i { display: block; height: 100%; background: var(--accent, #7c8cff); transition: width .18s ease; }

.actions { display: flex; gap: 10px; flex-wrap: wrap; }
button {
  font: inherit; font-size: 15px; font-weight: 550;
  border-radius: 12px; padding: 13px 20px;
  border: 1px solid transparent; cursor: pointer;
  transition: transform .06s ease, opacity .15s ease, background .15s ease;
}
button:active { transform: translateY(1px); }
button:disabled { opacity: .45; cursor: not-allowed; }
.primary { background: var(--accent, #7c8cff); color: #0b0d12; flex: 1 1 260px; }
.ghost { background: transparent; color: #a8b0c2; border-color: #2a3040; }
.ghost:hover:not(:disabled) { color: #f4f4f5; border-color: #3d4557; }

.hint { font-size: 12.5px; color: #6f7789; }
kbd {
  font: inherit; font-size: 11px; padding: 2px 6px; border-radius: 6px;
  background: #1a1f2b; border: 1px solid #2a3040; color: #a8b0c2;
}

.foot {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 14px; padding-top: 16px; border-top: 1px solid #1e232f;
}
.stats { display: flex; gap: 18px; font-size: 13px; color: #8b93a7; }
.stats b { color: #f4f4f5; font-weight: 600; font-variant-numeric: tabular-nums; }
.link { background: none; border: none; padding: 0; color: #8b93a7; font-size: 13px; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.link:hover { color: #f4f4f5; }

.quote { font-size: 13.5px; line-height: 1.6; color: #7b8397; font-style: italic; max-width: 56ch; }
.quote span { font-style: normal; color: #5c6478; }

/* pending (publish-proof) state */
.pending { display: flex; flex-direction: column; gap: 14px; }
.spinner {
  width: 16px; height: 16px; border-radius: 999px;
  border: 2px solid #2a3040; border-top-color: var(--accent, #7c8cff);
  animation: spin 0.9s linear infinite; flex: none;
}
@keyframes spin { to { transform: rotate(360deg); } }
.waiting { display: flex; align-items: center; gap: 10px; font-size: 15px; color: #d4d8e2; }
.draft-echo {
  padding: 14px 16px; border-radius: 12px; background: #12151d;
  border: 1px solid #262b38; color: #a8b0c2; font-size: 14px; line-height: 1.55;
  white-space: pre-wrap; max-height: 140px; overflow: auto;
}

/* countdown pill */
.pill {
  position: fixed; right: 18px; bottom: 18px; z-index: ${Z};
  display: none; align-items: center; gap: 12px;
  padding: 10px 12px 10px 16px; border-radius: 999px;
  background: rgba(12, 14, 20, .92); color: #f4f4f5;
  border: 1px solid #2a3040;
  box-shadow: 0 10px 30px rgba(0,0,0,.45);
  font-family: ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px; backdrop-filter: blur(8px);
}
.pill[data-show="1"] { display: flex; }
.pill[data-warn="1"] { border-color: #7f1d1d; box-shadow: 0 10px 30px rgba(220,38,38,.25); }
.clock { font-variant-numeric: tabular-nums; font-weight: 600; letter-spacing: .01em; }
.pill[data-warn="1"] .clock { color: #fca5a5; }
.pill button { padding: 6px 12px; font-size: 13px; border-radius: 999px; }
.pill .ghost { border-color: #333a4a; }

@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 3s; } }
@media (max-width: 560px) {
  h1 { font-size: 24px; }
  .layer { padding: 16px; align-items: flex-start; padding-top: 32px; }
  .primary { flex: 1 1 100%; }
}
`;

export function createOverlay(handlers) {
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.setAttribute('data-freeradicals-ui', '');
  const shadow = host.attachShadow({ mode: 'closed' });

  shadow.innerHTML = `
    <style>${STYLES}</style>
    <div class="layer" part="layer">
      <div class="card">
        <div class="eyebrow"><span class="dot"></span><span class="where">Feed locked</span></div>
        <h1 class="title">Post before you scroll.</h1>
        <p class="lede">Write something worth publishing. Posting it opens this feed for <b class="window">5 minutes</b> — when the timer runs out, the feed closes and you write again.</p>

        <div class="composer">
          <textarea class="input" spellcheck="true" placeholder="What are you working on? What did you just learn? Say the thing you'd otherwise scroll past."></textarea>
          <div class="meta">
            <span class="count">0 / 25</span>
            <span class="error" role="alert"></span>
          </div>
          <div class="earn">
            <span class="earn-text">This post buys <b class="earn-time">5:00</b></span>
            <span class="meter"><i class="meter-fill" style="width:0%"></i></span>
            <span class="earn-next"></span>
          </div>
          <div class="actions">
            <button class="primary submit">Post &amp; open feed</button>
            <button class="ghost settings" type="button">Settings</button>
          </div>
          <div class="hint"><kbd>Ctrl</kbd> + <kbd>Enter</kbd> to post</div>
        </div>

        <div class="pending" hidden>
          <div class="waiting"><span class="spinner"></span><span class="waiting-text">Waiting for your post to go live…</span></div>
          <div class="draft-echo"></div>
          <div class="actions">
            <button class="primary compose">Open the composer</button>
            <button class="ghost override" hidden type="button">I posted it anyway</button>
          </div>
          <div class="hint override-hint">The clock starts when your post is actually published.</div>
        </div>

        <div class="foot">
          <div class="stats">
            <span><b class="s-today">0</b> today</span>
            <span><b class="s-streak">0</b> day streak</span>
            <span><b class="s-words">0</b> words written</span>
          </div>
          <button class="link settings2" type="button">Settings</button>
        </div>
        <div class="quote"></div>
      </div>
    </div>

    <div class="pill">
      <span class="clock">0:00</span>
      <button class="ghost publish" hidden type="button">Publish it</button>
      <button class="ghost lock" type="button">Lock now</button>
    </div>
  `;

  const $ = (sel) => shadow.querySelector(sel);
  const els = {
    layer: $('.layer'),
    where: $('.where'),
    title: $('.title'),
    window: $('.window'),
    composer: $('.composer'),
    input: $('.input'),
    count: $('.count'),
    error: $('.error'),
    earn: $('.earn'),
    earnText: $('.earn-text'),
    earnTime: $('.earn-time'),
    earnNext: $('.earn-next'),
    meter: $('.meter'),
    meterFill: $('.meter-fill'),
    submit: $('.submit'),
    pending: $('.pending'),
    waitingText: $('.waiting-text'),
    draftEcho: $('.draft-echo'),
    compose: $('.compose'),
    override: $('.override'),
    overrideHint: $('.override-hint'),
    today: $('.s-today'),
    streak: $('.s-streak'),
    words: $('.s-words'),
    quote: $('.quote'),
    pill: $('.pill'),
    clock: $('.clock'),
    publish: $('.publish'),
    lock: $('.lock'),
  };

  let minChars = 25;
  let busy = false;
  let settings = null;
  let lastMinutes = 0;

  /**
   * Recompute the deal on every keystroke. In earned mode the window grows as
   * you write, so the button has to name the *current* price of the feed rather
   * than a setting — the whole point is that you can see it moving.
   */
  function updateCount() {
    const n = els.input.value.trim().length;
    els.count.textContent = `${n} / ${minChars}`;
    els.count.dataset.ok = n >= minChars ? '1' : '0';
    els.submit.disabled = busy || n < minChars;
    if (!settings) return;

    const earn = earnProgress(els.input.value, settings);
    const clock = formatCountdown(earn.ms);
    els.submit.textContent = `Post & open feed for ${clock}`;
    els.earn.hidden = !earn.earning;
    if (!earn.earning) return;

    els.earnTime.textContent = clock;
    els.earn.dataset.cap = earn.atCap ? '1' : '0';

    if (earn.atCap) {
      els.earnNext.textContent = "that's the maximum";
      els.meter.hidden = true;
    } else {
      els.meter.hidden = false;
      els.earnNext.textContent = n < minChars
        ? `${earn.charsToNext} more to unlock posting`
        : `${earn.charsToNext} more buys ${formatCountdown(earn.nextMinutes * 60_000)}`;
      const step = settings.earnPerChars || 50;
      els.meterFill.style.width = `${Math.round(((step - earn.charsToNext) / step) * 100)}%`;
    }

    // Flash the clock the moment another minute is banked.
    if (earn.minutes > lastMinutes && lastMinutes > 0) {
      els.earn.dataset.grew = '1';
      setTimeout(() => { els.earn.dataset.grew = '0'; }, 600);
    }
    lastMinutes = earn.minutes;
  }

  async function submit() {
    if (busy || els.submit.disabled) return;
    busy = true;
    els.submit.disabled = true;
    els.error.textContent = '';
    const text = els.input.value;
    try {
      const res = await handlers.onSubmit(text);
      if (res && res.ok === false) els.error.textContent = res.message || 'Post rejected.';
      else els.input.value = '';
    } finally {
      busy = false;
      updateCount();
    }
  }

  els.input.addEventListener('input', () => {
    els.error.textContent = '';
    updateCount();
    handlers.onDraftChange?.(els.input.value);
  });
  els.input.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit(); }
    e.stopPropagation(); // sites bind global hotkeys to bare letters
  });
  els.input.addEventListener('keyup', (e) => e.stopPropagation());
  els.submit.addEventListener('click', submit);
  els.compose.addEventListener('click', () => handlers.onOpenComposer?.());
  els.override.addEventListener('click', () => handlers.onOverride?.());
  els.lock.addEventListener('click', () => handlers.onLockNow?.());
  els.publish.addEventListener('click', () => handlers.onOpenComposer?.());
  $('.settings').addEventListener('click', () => handlers.onOpenSettings?.());
  $('.settings2').addEventListener('click', () => handlers.onOpenSettings?.());

  /**
   * @param {object} snap    core gate snapshot
   * @param {object} ctx     { platform, blocked, showPill, canCompose }
   */
  function render(snap, ctx) {
    const { stats } = snap;
    settings = snap.settings;
    minChars = settings.minChars;
    host.style.setProperty('--accent', (ctx.platform && ctx.platform.accent) || '#7c8cff');

    const name = ctx.platform ? ctx.platform.name : 'This feed';
    els.where.textContent = snap.status === 'pending' ? `${name} — waiting on your post` : `${name} is locked`;
    els.window.textContent = settings.durationMode === 'earned'
      ? `${settings.unlockMinutes} minutes, and longer the more you write`
      : `${settings.unlockMinutes} minute${settings.unlockMinutes === 1 ? '' : 's'}`;
    els.today.textContent = stats.today;
    els.streak.textContent = stats.streak;
    els.words.textContent = stats.words.toLocaleString();

    if (settings.showQuotes) {
      const q = pickQuote(snap.now);
      els.quote.innerHTML = `“${q.text}” <span>— ${q.by}</span>`;
      els.quote.hidden = false;
    } else {
      els.quote.hidden = true;
    }

    const pending = snap.status === 'pending';
    els.composer.hidden = pending;
    els.pending.hidden = !pending;
    if (pending) {
      els.title.textContent = 'Published yet?';
      els.waitingText.textContent = `Waiting for your post to appear on ${name}…`;
      els.draftEcho.textContent = snap.journal[0] ? snap.journal[0].text : '';
      els.compose.hidden = !ctx.canCompose;
      els.override.hidden = !snap.proofOverrideAvailable;
      els.overrideHint.textContent = snap.proofOverrideAvailable
        ? 'Using this records the post as unverified.'
        : 'The clock starts when your post is actually published.';
    } else {
      els.title.textContent = 'Post before you scroll.';
    }

    els.layer.dataset.show = ctx.blocked ? '1' : '0';
    if (ctx.blocked && !pending && shadow.activeElement !== els.input) {
      // Focus without yanking the page's scroll position around.
      setTimeout(() => { try { els.input.focus({ preventScroll: true }); } catch { /* ignore */ } }, 30);
    }

    els.pill.dataset.show = ctx.showPill ? '1' : '0';
    els.pill.dataset.warn = snap.warning ? '1' : '0';
    els.clock.textContent = formatCountdown(snap.remainingMs);
    els.publish.hidden = !(ctx.showPill && ctx.canCompose && ctx.offerPublish);

    updateCount();
  }

  function setDraft(text) {
    if (!text || els.input.value) return;
    els.input.value = text;
    updateCount();
  }

  function attach() {
    if (!host.isConnected) document.documentElement.appendChild(host);
  }

  function destroy() {
    host.remove();
  }

  return { host, render, setDraft, attach, destroy, get value() { return els.input.value; } };
}
