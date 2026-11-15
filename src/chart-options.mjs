// 配色和文案既供渲染使用，也作为配置校验与示例生成的支持列表。
export const themes = {
  'github-dark': { bg: '#0d1117', border: '#30363d', text: '#e6edf3', muted: '#8b949e', zero: '#161b22', unknown: '#0d1117', outline: '#484f58', levels: ['#0e4429', '#006d32', '#26a641', '#39d353'] },
  'github-light': { bg: '#ffffff', border: '#d0d7de', text: '#1f2328', muted: '#656d76', zero: '#ebedf0', unknown: '#ffffff', outline: '#afb8c1', levels: ['#9be9a8', '#40c463', '#30a14e', '#216e39'] },
};

export const translations = {
  en: {
    title: 'Codex Activity', total: 'TOTAL TOKENS', streak: 'ACTIVE STREAK · AT LAST SYNC', recorded: 'RECORDED DAYS',
    unavailable: 'Unavailable', notSynced: 'Not synced yet', unknown: 'Unknown / not synced', less: 'Less', more: 'More',
    updated: 'Last updated', future: 'future', outside: 'outside view', unknownCell: 'unknown / not synced', tokens: 'tokens',
    days: count => `${count} days`,
    description: (today, total, uploaded) => `52-week view · through ${today} · summaries as of last sync. ${total ?? 'Unknown'} lifetime tokens. Last data upload: ${uploaded}. Dashed cells are unknown, not zero.`,
  },
  'zh-CN': {
    title: 'Codex 活动', total: '累计 Token', streak: '连续活跃天数 · 截至上次同步', recorded: '已记录天数',
    unavailable: '暂无数据', notSynced: '尚未同步', unknown: '未知 / 尚未同步', less: '少', more: '多',
    updated: '最后更新', future: '未来日期', outside: '显示范围外', unknownCell: '未知 / 尚未同步', tokens: 'Token',
    days: count => `${count} 天`,
    description: (today, total, uploaded) => `最近 52 周，截至 ${today}；汇总数据截至上次同步。累计 Token：${total ?? '未知'}。上次数据上传：${uploaded}。虚线方格表示未知，而非零用量。`,
  },
};

// 纯渲染的时区回退为 UTC；本机配置未填写时区时，仍由 readConfig 读取系统时区。
export const CHART_DEFAULTS = Object.freeze({ theme: 'github-dark', language: 'en', timezone: 'UTC' });
