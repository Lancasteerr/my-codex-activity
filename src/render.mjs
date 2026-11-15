import { normalizeUsage, validDate } from './data.mjs';
import { fail } from './errors.mjs';

const themes = {
  'github-dark': { bg: '#0d1117', border: '#30363d', text: '#e6edf3', muted: '#8b949e', zero: '#161b22', unknown: '#0d1117', outline: '#484f58', levels: ['#0e4429', '#006d32', '#26a641', '#39d353'] },
  'github-light': { bg: '#ffffff', border: '#d0d7de', text: '#1f2328', muted: '#656d76', zero: '#ebedf0', unknown: '#ffffff', outline: '#afb8c1', levels: ['#9be9a8', '#40c463', '#30a14e', '#216e39'] },
};

export const escapeXml = value => String(value).replace(/[<>&"']/gu, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]);

export function dateInZone(now, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatUpload(value, timezone) {
  if (!value) return 'Not synced yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail('RENDER', '上传时间无效。');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${parts.timeZoneName.replace('GMT', 'UTC')}`;
}

export function renderSvg(value, { lastUpdated = null, timezone = 'UTC', theme = 'github-dark', now = new Date() } = {}) {
  const usage = normalizeUsage(value);
  const palette = themes[theme];
  if (!palette) fail('RENDER', '不支持该图表主题。');
  let today;
  try { today = dateInZone(now, timezone); } catch { fail('RENDER', '显示时区无效。'); }
  if (!validDate(today)) fail('RENDER', '图表日期无效。');
  const end = new Date(`${today}T00:00:00Z`);
  const first = new Date(end);
  first.setUTCDate(first.getUTCDate() - 363);
  const gridStart = new Date(first);
  gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay());
  const lastGrid = new Date(end);
  lastGrid.setUTCDate(lastGrid.getUTCDate() + 6 - lastGrid.getUTCDay());
  const positive = Object.entries(usage.daily).filter(([date, count]) => date >= first.toISOString().slice(0, 10) && date <= today && count > 0).map(([, count]) => count).sort((a, b) => a - b);
  const thresholds = [0.25, 0.5, 0.75].map(q => positive[Math.max(0, Math.ceil(positive.length * q) - 1)] ?? 0);
  const levelOf = count => thresholds.filter(threshold => count > threshold).length;
  const compact = number => number === null ? 'Unavailable' : new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(number);
  const cells = [];
  const months = [];
  let lastMonth = '';
  for (let cursor = new Date(gridStart), index = 0; cursor <= lastGrid; cursor.setUTCDate(cursor.getUTCDate() + 1), index++) {
    const date = cursor.toISOString().slice(0, 10);
    const x = 30 + Math.floor(index / 7) * 14;
    const y = 145 + (index % 7) * 14;
    const future = date > today;
    const outside = date < first.toISOString().slice(0, 10);
    const known = Object.hasOwn(usage.daily, date) && !future && !outside;
    const count = usage.daily[date];
    const fill = future || outside ? palette.bg : known ? (count === 0 ? palette.zero : palette.levels[levelOf(count)]) : palette.unknown;
    const title = future ? `${date}: future` : outside ? `${date}: outside view` : known ? `${date}: ${count.toLocaleString('en-US')} tokens` : `${date}: unknown / not synced`;
    const stroke = date === today ? palette.text : known || future || outside ? palette.border : palette.outline;
    cells.push(`<rect x="${x}" y="${y}" width="10" height="10" rx="2" fill="${fill}" stroke="${stroke}"${!known && !future && !outside ? ' stroke-dasharray="2 2"' : ''}><title>${escapeXml(title)}</title></rect>`);
    const month = date.slice(0, 7);
    if (!future && !outside && month !== lastMonth) {
      months.push(`<text x="${x}" y="134">${cursor.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })}</text>`);
      lastMonth = month;
    }
  }
  const total = usage.summary.lifetimeTokens;
  const streak = usage.summary.currentStreakDays;
  const observed = Object.keys(usage.daily).filter(date => date <= today).length;
  const uploaded = formatUpload(lastUpdated, timezone);
  const subtitle = `52-week view · through ${today} · summaries as of last sync`;
  const legend = [palette.zero, ...palette.levels].map((color, index) => `<rect x="${656 + index * 14}" y="259" width="10" height="10" rx="2" fill="${color}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="326" viewBox="0 0 820 326" role="img" aria-labelledby="title description">
  <title id="title">Codex Activity</title>
  <desc id="description">${escapeXml(`${subtitle}. ${total ?? 'Unknown'} lifetime tokens. Last data upload: ${uploaded}. Dashed cells are unknown, not zero.`)}</desc>
  <rect x="0.5" y="0.5" width="819" height="325" rx="14" fill="${palette.bg}" stroke="${palette.border}"/>
  <style>text{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;fill:${palette.text}}.muted{fill:${palette.muted};font-size:11px}.metric{font-size:25px;font-weight:600}.label{font-size:11px;fill:${palette.muted}}</style>
  <text x="30" y="32" font-size="18" font-weight="600">Codex Activity</text>
  <text x="30" y="51" class="muted">${escapeXml(subtitle)}</text>
  <text x="30" y="77" class="label">TOTAL TOKENS</text><text x="30" y="106" class="metric">${escapeXml(compact(total))}</text>
  <text x="300" y="77" class="label">ACTIVE STREAK · AT LAST SYNC</text><text x="300" y="106" class="metric">${escapeXml(streak === null ? 'Unavailable' : `${streak} days`)}</text>
  <text x="610" y="77" class="label">RECORDED DAYS</text><text x="610" y="106" class="metric">${observed}</text>
  <g class="muted">${months.join('')}</g>
  ${cells.join('\n  ')}
  <rect x="30" y="259" width="10" height="10" rx="2" fill="${palette.unknown}" stroke="${palette.outline}" stroke-dasharray="2 2"/><text x="47" y="268" class="muted">Unknown / not synced</text>
  <text x="620" y="268" class="muted">Less</text>${legend}<text x="735" y="268" class="muted">More</text>
  <text x="30" y="298" font-size="12">Last updated: ${escapeXml(uploaded)}</text>
  <text x="30" y="314" class="muted">Data uploaded to GitHub · daily redraw does not refresh this time</text>
</svg>\n`;
}
