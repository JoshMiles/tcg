// The end of stream summary window (ROADMAP 55.11). The data is cleaned by the app before it gets here; everything is set as text.
const $ = id => document.getElementById(id);
const fill = (id, lines, none) => {
  const el = $(id);
  el.replaceChildren(...(lines.length ? lines : [none]).map(t => Object.assign(document.createElement('li'), { textContent: t })));
};

window.tools.onSummary(s => {
  $('totals').textContent = `${s.packs}${s.partial ? '+' : ''} packs opened by ${s.pullers} viewer${s.pullers === 1 ? '' : 's'}`;
  fill('big', s.bigPulls.map(p => `${p.cardName} (${[p.rarity, p.variant !== 'Regular' ? p.variant : ''].filter(Boolean).join(', ')}${p.serial ? ', #' + p.serial : ''}) by ${p.username}`), 'None');
  fill('top', s.topPullers.map(p => `${p.username}: ${p.packs} pack${p.packs === 1 ? '' : 's'}`), 'None');
  $('bucks').textContent = `Brie Bucks: ${s.taken.toLocaleString('en-GB')} taken, ${s.refunded.toLocaleString('en-GB')} refunded`;
});
$('copy').addEventListener('click', async () => {
  const r = await window.tools.copySummary();
  $('result').textContent = r.text;
});
window.tools.ready();
