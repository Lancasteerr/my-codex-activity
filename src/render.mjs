import { normalizeUsage, validDate } from './data.mjs';
import { fail } from './errors.mjs';
import { normalizeDisplayConfig } from './config.mjs';
import { CHART_DEFAULTS, themes, translations } from './chart-options.mjs';

export const escapeXml = value => String(value).replace(/[<>&"']/gu, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]);

export function dateInZone(now, timezone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatUpload(value, timezone, language = CHART_DEFAULTS.language) {
  if (!value) return translations[language].notSynced;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) fail('RENDER', '上传时间无效。');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
  }).formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${parts.timeZoneName.replace('GMT', 'UTC')}`;
}

export function renderSvg(value, { lastUpdated = null, timezone = CHART_DEFAULTS.timezone, theme = CHART_DEFAULTS.theme, language = CHART_DEFAULTS.language, now = new Date() } = {}) {
  const usage = normalizeUsage(value);
  normalizeDisplayConfig({ theme, language });
  const palette = themes[theme];
  const labels = translations[language];
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
  const compact = number => number === null ? labels.unavailable : new Intl.NumberFormat(language, { notation: 'compact', maximumFractionDigits: 2 }).format(number);
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
    const title = `${date}: ${future ? labels.future : outside ? labels.outside : known ? `${count.toLocaleString(language)} ${labels.tokens}` : labels.unknownCell}`;
    const stroke = date === today ? palette.text : known || future || outside ? palette.border : palette.outline;
    cells.push(`<rect x="${x}" y="${y}" width="10" height="10" rx="2" fill="${fill}" stroke="${stroke}"${!known && !future && !outside ? ' stroke-dasharray="2 2"' : ''}><title>${escapeXml(title)}</title></rect>`);
    const month = date.slice(0, 7);
    if (!future && !outside && month !== lastMonth) {
      months.push(`<text x="${x}" y="134">${cursor.toLocaleString(language, { month: 'short', timeZone: 'UTC' })}</text>`);
      lastMonth = month;
    }
  }
  const total = usage.summary.lifetimeTokens;
  const streak = usage.summary.currentStreakDays;
  const observed = Object.keys(usage.daily).filter(date => date <= today).length;
  const uploaded = formatUpload(lastUpdated, timezone, language);
  const legend = [palette.zero, ...palette.levels].map((color, index) => `<rect x="${656 + index * 14}" y="259" width="10" height="10" rx="2" fill="${color}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="326" viewBox="0 0 820 326" xml:lang="${language}" role="img" aria-labelledby="title description">
  <title id="title">${labels.title}</title>
  <desc id="description">${escapeXml(labels.description(today, total, uploaded))}</desc>
  <rect x="0.5" y="0.5" width="819" height="325" rx="14" fill="${palette.bg}" stroke="${palette.border}"/>
  <style>text{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Microsoft YaHei,PingFang SC,Noto Sans CJK SC,sans-serif;fill:${palette.text}}.muted{fill:${palette.muted};font-size:11px}.metric{font-size:25px;font-weight:600}.label{font-size:11px;fill:${palette.muted}}</style>
  <text x="30" y="32" font-size="18" font-weight="600">${labels.title}</text>
  <text x="30" y="77" class="label">${labels.total}</text><text x="30" y="106" class="metric">${escapeXml(compact(total))}</text>
  <text x="300" y="77" class="label">${labels.streak}</text><text x="300" y="106" class="metric">${escapeXml(streak === null ? labels.unavailable : labels.days(streak))}</text>
  <text x="610" y="77" class="label">${labels.recorded}</text><text x="610" y="106" class="metric">${observed.toLocaleString(language)}</text>
  <g class="muted">${months.join('')}</g>
  ${cells.join('\n  ')}
  <rect x="30" y="259" width="10" height="10" rx="2" fill="${palette.unknown}" stroke="${palette.outline}" stroke-dasharray="2 2"/><text x="47" y="268" class="muted">${labels.unknown}</text>
  <text x="620" y="268" class="muted">${labels.less}</text>${legend}<text x="735" y="268" class="muted">${labels.more}</text>
  <text x="30" y="298" font-size="12">${labels.updated}: ${escapeXml(uploaded)}</text>
</svg>\n`;
}
