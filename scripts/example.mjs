import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { renderSvg } from '../src/render.mjs';

const daily = {};
for (let day = 0; day < 364; day++) {
  const date = new Date('2026-11-15T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - day);
  if (day % 17 === 0 || day > 290) continue;
  daily[date.toISOString().slice(0, 10)] = day % 5 === 0 ? 0 : Math.round(((Math.sin(day * 13) + 1) * 400_000) + (day % 9) * 220_000);
}
const usage = { schemaVersion: 1, source: 'codex-app-server', summary: { lifetimeTokens: 287_400_000, currentStreakDays: 8 }, daily };
const output = fileURLToPath(new URL('../examples/', import.meta.url));
await mkdir(output, { recursive: true });
for (const theme of ['github-dark', 'github-light']) {
  for (const language of ['en', 'zh-CN']) {
    const suffix = language === 'en' ? '' : `.${language}`;
    await writeFile(`${output}/${theme}${suffix}.svg`, renderSvg(usage, {
      now: new Date('2026-11-15T06:30:00Z'), lastUpdated: '2026-11-15T06:30:00Z', timezone: 'Asia/Singapore', theme, language,
    }));
  }
}
console.log('Synthetic examples generated. No real account data used.');
