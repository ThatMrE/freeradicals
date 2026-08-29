import { PLATFORMS, createGate } from '../../core/index.js';
import { createChromeStorage } from '../shared/chrome-storage.js';
import { MSG, send } from '../shared/messages.js';

const $ = (id) => document.getElementById(id);
const gate = createGate({ storage: createChromeStorage('local') });

const NUMBERS = ['unlockMinutes', 'minChars', 'warnAtSeconds', 'proofOverrideAfterSeconds', 'duplicateLookback'];
const FLAGS = ['requirePublishProof', 'publishAssist', 'blockDuplicatePosts', 'showQuotes'];

if (location.hash === '#welcome') $('welcome').hidden = false;

let savedTimer;
function flashSaved() {
  $('saved').dataset.on = '1';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => { $('saved').dataset.on = '0'; }, 1200);
}

async function save(patch) {
  await send(MSG.UPDATE_SETTINGS, patch);
  flashSaved();
}

function renderPlatforms(settings) {
  $('platforms').innerHTML = PLATFORMS.map((p) => `
    <label class="check">
      <input type="checkbox" data-platform="${p.id}" ${settings.platformOverrides[p.id] === false ? '' : 'checked'} />
      <span class="t">${p.name}</span>
    </label>`).join('');

  for (const input of $('platforms').querySelectorAll('input')) {
    input.addEventListener('change', () => {
      const current = gate.snapshot().settings.platformOverrides || {};
      save({ platformOverrides: { ...current, [input.dataset.platform]: input.checked } });
    });
  }
}

function render() {
  const snap = gate.snapshot();
  const s = snap.settings;
  for (const key of NUMBERS) if (document.activeElement !== $(key)) $(key).value = s[key];
  for (const key of FLAGS) $(key).checked = s[key];
  $('proofOverrideAfterSeconds').disabled = !s.requirePublishProof;
  $('duplicateLookback').disabled = !s.blockDuplicatePosts;

  const { total, words, streak } = snap.stats;
  $('journalSummary').textContent = total
    ? `${total} post${total === 1 ? '' : 's'}, ${words.toLocaleString()} words, ${streak}-day streak.`
    : 'Nothing written yet.';
}

for (const key of NUMBERS) {
  $(key).addEventListener('change', () => save({ [key]: Number($(key).value) }));
}
for (const key of FLAGS) {
  $(key).addEventListener('change', () => save({ [key]: $(key).checked }));
}

$('export').addEventListener('click', () => {
  const snap = gate.snapshot();
  const blob = new Blob([JSON.stringify({ exportedAt: Date.now(), journal: snap.journal }, null, 2)],
    { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `free-radicals-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('clear').addEventListener('click', async () => {
  if (!confirm('Delete every post you have written through the gate? This cannot be undone.')) return;
  await send(MSG.CLEAR_JOURNAL);
  await gate.load();
  render();
});

gate.subscribe(render);
await gate.load();
renderPlatforms(gate.snapshot().settings);
render();
