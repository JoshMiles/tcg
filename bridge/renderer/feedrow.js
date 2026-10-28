// One live-feed row (ROADMAP 59.5), shared by the main window's Home and Feed pages and the pull feed window (59.8). The row comes from src/home.ts
// mergeFeed; everything is set with textContent. The badge letter has a spoken name, since a lone "P" or "E" says nothing to a screen reader.
const BADGE_TITLE = { P: 'Pull', E: 'Event reward', J: 'Mix It Up job', '!': 'Refused or failed' };

function feedBadge(r) {
  const badge = document.createElement('span');
  badge.className = 'feed-badge';
  badge.textContent = r.badge;
  badge.title = BADGE_TITLE[r.badge];
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', BADGE_TITLE[r.badge]);
  return badge;
}

function feedRow(r) {
  const li = document.createElement('li');
  li.className = 'feed-row ' + r.tone;
  const when = document.createElement('span');
  when.className = 'feed-time';
  when.textContent = r.time;
  const who = document.createElement('b');
  who.textContent = r.viewer;
  const text = document.createElement('span');
  text.className = 'feed-text';
  text.textContent = r.text;
  const tag = document.createElement('span');
  tag.className = 'feed-tag';
  tag.textContent = r.tag;
  li.append(when, feedBadge(r), who, text, tag);
  return li;
}
