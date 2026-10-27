// Topics: every law, regulation and bill sorted into one of a few subjects,
// each with its colour and icon, so a list reads at a glance. Words in the
// name decide first (a new law has no category yet); then the ministry in
// MOJ's category (行政＞勞動部＞…).

export const TOPICS = {
  labor: { zh: '勞動', en: 'Work', color: '#f97316', icon: '<path d="M4 9h16v10H4z"/><path d="M9 9V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V9M4 13.5h16"/>' },
  health: { zh: '醫療衛生', en: 'Health', color: '#ef4444', icon: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M9.5 11.5h5M12 9v5"/>' },
  welfare: { zh: '社福長照', en: 'Welfare', color: '#ec4899', icon: '<circle cx="9" cy="7" r="2.5"/><circle cx="16.5" cy="9" r="2"/><path d="M4.5 19c0-3 2-5 4.5-5s4.5 2 4.5 5M13.5 19c.2-2.2 1.4-3.6 3-3.6s2.8 1.4 3 3.6"/>' },
  edu: { zh: '教育文化', en: 'Education', color: '#a855f7', icon: '<path d="m3 9 9-4 9 4-9 4z"/><path d="M7 11v4.5c1.5 1.3 3.2 2 5 2s3.5-.7 5-2V11M21 9v5"/>' },
  econ: { zh: '經濟產業', en: 'Economy', color: '#6366f1', icon: '<path d="M4 20V10l5 3V10l5 3V6l6 4v10z"/><path d="M8 17h1M12 17h1M16 17h1"/>' },
  money: { zh: '財稅金融', en: 'Tax & finance', color: '#22c55e', icon: '<circle cx="12" cy="12" r="8"/><path d="M14.5 9.2c-.5-.8-1.4-1.2-2.5-1.2-1.5 0-2.5.8-2.5 2s1 1.6 2.5 2 2.5.9 2.5 2-1 2-2.5 2c-1.1 0-2-.4-2.5-1.2M12 6.5v11"/>' },
  traffic: { zh: '交通', en: 'Transport', color: '#3b82f6', icon: '<path d="M5 16V9.5L7 6h10l2 3.5V16z"/><path d="M5 12h14M7.5 16v2M16.5 16v2"/><circle cx="8" cy="14" r=".6"/><circle cx="16" cy="14" r=".6"/>' },
  env: { zh: '環境能源', en: 'Environment', color: '#14b8a6', icon: '<path d="M6 18c0-7 4.5-11 13-12-1 8.5-5 13-12 13"/><path d="M6 18c2.5-3.5 5-5.5 8-7"/>' },
  farm: { zh: '農業', en: 'Farming', color: '#84cc16', icon: '<path d="M12 20V9"/><path d="M12 13c-3 0-5-2-5-5 3 0 5 2 5 5zM12 11c0-3 2-5 5-5 0 3-2 5-5 5zM12 17c-2.5 0-4.5-1.6-4.5-4 2.5 0 4.5 1.6 4.5 4zM12 15c0-2.4 2-4 4.5-4 0 2.4-2 4-4.5 4z"/>' },
  justice: { zh: '司法法務', en: 'Justice', color: '#64748b', icon: '<path d="M12 4v16M8 20h8M5 7h14"/><path d="M5 7 3 12a2.5 2.5 0 0 0 4 0zM19 7l-2 5a2.5 2.5 0 0 0 4 0z"/>' },
  home: { zh: '內政土地', en: 'Housing & land', color: '#d97706', icon: '<path d="m4 11 8-6 8 6"/><path d="M6 10v9h12v-9M10 19v-5h4v5"/>' },
  defense: { zh: '國防外交', en: 'Defence', color: '#0ea5e9', icon: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>' },
  tech: { zh: '數位通訊', en: 'Digital', color: '#06b6d4', icon: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>' },
  gov: { zh: '政府組織', en: 'Government', color: '#8b5cf6', icon: '<path d="M4 20h16M5 17h14M6 17V10M10 17V10M14 17V10M18 17V10M3.5 10h17L12 4z"/>' }
};

const WORDS = [
  ['labor', /勞|工資|職業安全|就業|工會|童工/],
  ['welfare', /長期照顧|長照|老人|兒童|少年|身心障礙|社會救助|社會福利|性別|家庭暴力|國民年金|托育/],
  ['health', /醫|藥|健康|健保|食品|傳染|疾病|衛生|護理|菸|精神|生育/],
  ['money', /稅|金融|保險|銀行|證券|期貨|預算|財政|公債|貨幣|票券|信託/],
  ['traffic', /交通|道路|公路|鐵路|捷運|航空|船舶|港|郵政|觀光|發展觀光|車/],
  ['env', /環境|空氣|水污染|廢棄物|能源|電業|氣候|核|再生|溫室|海洋|水利|自來水/],
  ['farm', /農|漁|畜|林|動物|植物|糧食|森林/],
  ['tech', /通訊|數位|電信|網路|資通|個人資料|傳播|廣播|電子簽章|人工智慧/],
  ['edu', /教育|學校|大學|學位|教師|文化|藝術|運動|原住民|客家|語言|圖書|博物館|師資/],
  ['defense', /國防|軍|兵役|外交|兩岸|大陸地區|香港澳門|國家安全|僑|退除役/],
  ['justice', /刑|法院|訴訟|檢察|毒品|詐欺|犯罪|監獄|羈押|律師|公證|仲裁|民法|強制執行|洗錢/],
  ['home', /土地|住宅|建築|戶籍|警察|消防|都市|地政|國土|國籍|公寓|災害/],
  ['gov', /選舉|罷免|公務|立法院|監察|考試|總統|政黨|組織法|組織條例|人事|地方制度|公民投票|憲法/],
  ['econ', /產業|中小企業|公司|商業|經濟|貿易|商標|專利|科學|科技|工廠|投資|消費者|公平交易/]
];
const MINISTRY = {
  勞動部: 'labor', 衛生福利部: 'welfare', 教育部: 'edu', 文化部: 'edu', 運動部: 'edu', 客家委員會: 'edu', 原住民族委員會: 'edu', 國立故宮博物院: 'edu',
  經濟部: 'econ', 國家發展委員會: 'econ', 公平交易委員會: 'econ', 行政院公共工程委員會: 'econ', 國家科學及技術委員會: 'econ',
  財政部: 'money', 金融監督管理委員會: 'money', 中央銀行: 'money', 行政院主計總處: 'money',
  交通部: 'traffic', 國家運輸安全調查委員會: 'traffic', 環境部: 'env', 核能安全委員會: 'env', 海洋委員會: 'env', 農業部: 'farm',
  法務部: 'justice', 院本部: 'gov', 懲戒法院: 'justice', 內政部: 'home', 國防部: 'defense', 外交部: 'defense', 國軍退除役官兵輔導委員會: 'defense',
  大陸委員會: 'defense', 國家安全會議: 'defense', 僑務委員會: 'defense', 國家通訊傳播委員會: 'tech', 數位發展部: 'tech', 個人資料保護委員會籌備處: 'tech'
};

// A law's (or a bill's) topic: name words, else its ministry, else 政府組織.
export function topicOf(name = '', category = '') {
  for (const [t, re] of WORDS) if (re.test(name)) return t;
  const parts = String(category).split('＞');
  if (parts[0] === '司法') return 'justice';
  return MINISTRY[parts[1]] || 'gov';
}

// The party chips: short names and colours (as Taiwan's press uses them).
const PARTY = {
  民主進步黨: ['民進黨', 'DPP', '#16a34a'],
  民進黨: ['民進黨', 'DPP', '#16a34a'],
  中國國民黨: ['國民黨', 'KMT', '#2563eb'],
  國民黨: ['國民黨', 'KMT', '#2563eb'],
  台灣民眾黨: ['民眾黨', 'TPP', '#0d9488'],
  民眾黨: ['民眾黨', 'TPP', '#0d9488'],
  時代力量: ['時力', 'NPP', '#eab308'],
  行政院: ['行政院', 'Cabinet', '#64748b'],
  司法院: ['司法院', 'Judicial Yuan', '#64748b'],
  考試院: ['考試院', 'Examination Yuan', '#64748b'],
  監察院: ['監察院', 'Control Yuan', '#64748b'],
  無黨籍: ['無黨籍', 'Independent', '#94a3b8']
};
export const partyOf = who => {
  const p = PARTY[who];
  return p ? { zh: p[0], en: p[1], color: p[2] } : { zh: who, en: who, color: '#94a3b8' };
};
