/** Scratch check of the bundle's Client registration path. Not part of the plugin. */
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./my-courses/client.js', import.meta.url), 'utf8');
let definition = null;
const loaderWindow = { __ModuleLoader__: { load: (value) => { definition = value; } } };
const noop = () => {};
const reactStub = {
	createElement: () => ({ type: 'stub' }),
	useState: () => [undefined, noop],
	useEffect: noop,
	useMemo: (fn) => fn(),
	useRef: () => ({ current: null }),
	useCallback: (fn) => fn,
	useSyncExternalStore: () => undefined,
};
const requireStub = (id) => {
	if (id === 'react') return reactStub;
	throw new Error('unexpected require: ' + id);
};

new Function('window', 'require', 'document', source)(loaderWindow, requireStub, {});
if (!definition || definition.id !== '@local/my-courses') throw new Error('module definition missing or misnamed');

const plugin = definition.factory(requireStub);
const registrations = [];
const namespaces = [];
let localeBundle = null;
const ctx = {
	effect: (callback) => { callback(); return noop; },
	locale: {
		register: (namespace, bundle) => { namespaces.push(namespace); localeBundle = bundle || null; return noop; },
		bind: (namespace) => (key) => namespace + ':' + key,
	},
	slots: {
		inject: (key, callback) => { callback(); return noop; },
		register: (options, component) => { registrations.push({ options, component }); return noop; },
	},
	uiWorkspace: { marker: true },
};
plugin.apply(ctx);

const panel = registrations.find((entry) => entry.options.name === 'sidebar.panellist');
const main = registrations.find((entry) => entry.options.name === 'main');
const problems = [];
if (!panel || panel.options.id !== 'my-courses') problems.push('sidebar entry missing');
if (!main || main.options.key !== 'my-courses') problems.push('main panel missing');
if (main && panel && main.options.key !== panel.options.id) problems.push('panel id and main key diverge');
if (!namespaces.includes('myCourses')) problems.push('locale namespace missing');
const injected = main ? main.options.inject() : {};
if (!injected.t || !injected.ui) problems.push('injected props missing');

// ---- batch 2 acceptance (V19-V23) -------------------------------------------
const zh = localeBundle && localeBundle.zh;
const en = localeBundle && localeBundle.en;
if (!zh || !en) problems.push('V19 locale bundle missing zh/en');

const BATCH2_KEYS = [
	'competition.folder.new', 'competition.folder.edit', 'competition.folder.name',
	'competition.folder.moveTo', 'competition.folder.ungrouped', 'competition.folder.count',
	'competition.folder.competitions', 'competition.folder.none', 'competition.folder.noCompetition',
	'competition.folder.ungroupedPlanHint', 'competition.folder.deleteConfirm',
	'competition.folder.up', 'competition.folder.down', 'competition.folder.nextMilestone',
	'plan.tab', 'plan.view.items', 'plan.view.milestones', 'plan.view.timeline',
	'plan.empty', 'plan.items.empty', 'plan.milestones.empty', 'plan.timeline.empty',
	'plan.newItem', 'plan.itemPlaceholder', 'plan.newEntry', 'plan.newMilestone',
	'plan.field.title', 'plan.field.date', 'plan.field.kind',
	'plan.kind.milestone', 'plan.kind.step', 'plan.noDate', 'plan.doneOn',
	'plan.progress', 'plan.noUpcoming', 'plan.singleSource', 'plan.linkedCompetition', 'plan.none',
	'task.doneOn',
];

// V19: zh/en key sets are strictly equal (no key silently missing in one language).
if (zh && en) {
	const zhKeys = Object.keys(zh).sort().join('\n');
	const enKeys = Object.keys(en).sort().join('\n');
	if (zhKeys !== enKeys) {
		const onlyZh = Object.keys(zh).filter((key) => !(key in en));
		const onlyEn = Object.keys(en).filter((key) => !(key in zh));
		problems.push('V19 zh/en key sets differ: zh-only=' + onlyZh.join(',') + ' en-only=' + onlyEn.join(','));
	}
}

// V20: every batch-2 key from spec §7 exists and is non-empty in both languages.
for (const key of BATCH2_KEYS) {
	for (const [name, dict] of [['zh', zh], ['en', en]]) {
		if (!dict || typeof dict[key] !== 'string' || dict[key].trim() === '') problems.push('V20 missing ' + name + ' ' + key);
	}
}

// V21: no new runtime dependency sneaks in with the batch.
const pkg = JSON.parse(readFileSync(new URL('./my-courses/package.json', import.meta.url), 'utf8'));
for (const field of ['dependencies', 'devDependencies']) {
	const value = pkg[field];
	if (value && Object.keys(value).length > 0) problems.push('V21 ' + field + ' must stay empty: ' + Object.keys(value).join(','));
}
if (pkg.version !== '1.5.0') problems.push('V21 version must be 1.5.0, got ' + pkg.version);

// V22/V23: the new CSS only uses theme aliases and the single 640px breakpoint.
const cssLines = source.split('\n').filter((line) => /^\s*'/.test(line) && /\.mc-(cf|plan)-/.test(line));
if (cssLines.length === 0) problems.push('V22 no batch-2 css found');
for (const line of cssLines) {
	if (/#[0-9a-fA-F]{3,8}\b/.test(line) || /\brgba?\(/.test(line)) problems.push('V22 hardcoded colour in: ' + line.slice(0, 60));
	if (/prefers-color-scheme/.test(line)) problems.push('V22 prefers-color-scheme in: ' + line.slice(0, 60));
}
const mediaLines = source.split('\n').filter((line) => /@media/.test(line) && /\.mc-(cf|plan)-/.test(line));
for (const line of mediaLines) {
	const widths = [...line.matchAll(/(?:width\s*[<>=]+\s*|min-width:|max-width:)\s*(\d+)px/g)].map((match) => match[1] + 'px');
	for (const width of widths) if (width !== '640px') problems.push('V23 unexpected breakpoint ' + width + ' in: ' + line.slice(0, 60));
}
if (mediaLines.length > 0 && mediaLines.length !== 1) problems.push('V23 expected exactly one batch-2 media query, got ' + mediaLines.length);


// ---- batch 3 acceptance (V28-V32) -------------------------------------------
// V28: the 15 §8 classes of the push/profile pane are present, and the chip "on"
// state is attribute-driven instead of a second class name (styling contract).
const BATCH3_CLASSES = ['mc-push', 'mc-push-sources', 'mc-push-source', 'mc-push-list', 'mc-push-card', 'mc-push-card-head', 'mc-push-title', 'mc-push-meta', 'mc-push-src', 'mc-push-reasons', 'mc-reason', 'mc-push-skeleton', 'mc-profile', 'mc-profile-chips', 'mc-profile-chip'];
for (const className of BATCH3_CLASSES) {
	if (!source.includes("'." + className + "{")) problems.push('V28 missing css class .' + className);
}
if (!source.includes('.mc-profile-chip[data-on="1"]')) problems.push('V28 the selected chip needs its data-on rule');

// Removes every var(...) group, including nested fallbacks such as
// var(--a, var(--b, rgba(0,0,0,.05))); a regex cannot do this in one pass.
function stripVars(text) {
	let out = '';
	let index = 0;
	while (index < text.length) {
		const at = text.indexOf('var(', index);
		if (at < 0) {
			out += text.slice(index);
			break;
		}
		out += text.slice(index, at);
		let depth = 0;
		let cursor = at + 3;
		for (; cursor < text.length; cursor += 1) {
			if (text[cursor] === '(') depth += 1;
			else if (text[cursor] === ')') {
				depth -= 1;
				if (depth === 0) {
					cursor += 1;
					break;
				}
			}
		}
		index = cursor;
	}
	return out;
}
// V29: those rules take their colours from theme aliases only — a hex/rgba value is
// allowed solely as the fallback inside var(...). The single exception is on-primary
// text (color:#fff over a solid business-primary fill): the theme exposes no alias for
// it, and the batch-2 primary button already hardcodes the same value.
// allowed solely as the fallback inside var(...).
const pushCssLines = source.split('\n').filter((line) => /^\s*'/.test(line) && /\.mc-(push|profile|reason)/.test(line));
if (pushCssLines.length < 15) problems.push('V29 expected at least 15 batch-3 css lines, got ' + pushCssLines.length);
for (const line of pushCssLines) {
	const bare = stripVars(line).replace(/color:\s*#(?:fff|ffffff)\b/gi, '');
	if (/#[0-9a-fA-F]{3,8}\b/.test(bare) || /\brgba?\(/.test(bare)) problems.push('V29 hardcoded colour outside a var() fallback in: ' + line.slice(0, 60));
	if (/prefers-color-scheme/.test(line)) problems.push('V29 prefers-color-scheme in: ' + line.slice(0, 60));
}

// V30: the client fetches the exact routes the host registers, with the same params.
for (const route of ['/my-courses/papers', '/my-courses/news', '/my-courses/repos']) {
	if (!source.includes(route)) problems.push('V30 client never calls ' + route);
}

// V31: the sidebar dot cannot rely on the panel CSS (the css array only mounts with
// the page), so it must be an inline-styled, decorative element.
if (!source.includes('data-mc-dot')) problems.push('V31 unread dot marker missing');
if (!source.includes('data-mc-unread')) problems.push('V31 unread count attribute missing');
if (!/aria-hidden/.test(source)) problems.push('V31 the unread dot must be aria-hidden');

// V32: every batch-3 i18n family is present in both languages (V19 only proves parity).
const BATCH3_FAMILIES = [['push.', 27], ['profile.', 15], ['major.', 8], ['dir.', 12]];
for (const [prefix, min] of BATCH3_FAMILIES) {
	for (const [name, dict] of [['zh', zh], ['en', en]]) {
		const count = Object.keys(dict || {}).filter((key) => key.indexOf(prefix) === 0).length;
		if (count < min) problems.push('V32 ' + name + ' has only ' + count + ' ' + prefix + ' keys, expected ' + min);
	}
}
// V33: batch-3 fix round — §3.2 feed table verbatim, per-source retry, verbatim all-fail list.
if (!source.includes('const runPush = useCallback(async (manual, only) => {')) problems.push('V33 runPush must accept the retry scope');
if (!source.includes('onRetry: (kinds) => runPush(true, kinds)')) problems.push('V33 the page must wire retry to the failed sources only');
if (!source.includes("t('push.sourceFailed')")) problems.push('V33 the failed-source note is never rendered');
if (!source.includes('items: untouched ? previous : ranked')) problems.push('V33 an all-failed run must keep the previous list verbatim');
if (!source.includes("repo: '\"large language model\" OR llm'")) problems.push('V33 the §3.2 repo query for cs.CL drifted');
if (!source.includes("news: 'LLM'")) problems.push('V33 the §3.2 news query for cs.CL drifted');
if (source.includes('en: entry[2].en')) problems.push('V33 DIRECTION_FEEDS still carries the non-spec en field');

// ---- batch 4 acceptance (V34-V39) -------------------------------------------
// V34: the client calls the four workbench routes the host registers, and the
// full text stays in one in-memory Map — the state blob never carries it.
for (const route of ['/my-courses/paper/text', '/my-courses/paper/explain', '/my-courses/paper/ask', '/my-courses/paper/status']) {
	if (!source.includes("'" + route + "'")) problems.push('V34 client never calls ' + route);
}
if (!source.includes('const paperTexts = new Map();')) problems.push('V34 the full text must live in the in-memory paperTexts map');
if (/localStorage[^\n]*paper/i.test(source)) problems.push('V34 paper state must not be written to localStorage');

// V35: every workbench string exists in both languages (the V19 parity check
// cannot see a family that is missing from both dictionaries).
const WB_MIN_KEYS = 96;
for (const [name, dict] of [['zh', zh], ['en', en]]) {
	const count = Object.keys(dict || {}).filter((key) => key.indexOf('wb.') === 0).length;
	if (count < WB_MIN_KEYS) problems.push('V35 ' + name + ' has only ' + count + ' wb. keys, expected ' + WB_MIN_KEYS);
}
for (const key of ['wb.open', 'wb.tabGuide', 'wb.tabChat', 'wb.paraExplain', 'wb.askPlaceholder', 'wb.noModel', 'wb.tab', 'wb.libTitle', 'wb.import', 'wb.importing', 'wb.libEmpty', 'wb.libOpen', 'wb.libRemove', 'wb.libRemoved', 'wb.importDone', 'wb.importSkipped', 'wb.importHint', 'wb.kindPdf', 'wb.kindArxiv', 'wb.untitled', 'wb.pdfNoText', 'wb.pdfEncrypted', 'wb.pdfTooLarge', 'wb.pdfNotCached', 'wb.pdfParseFailed', 'wb.ccfA', 'wb.ccfRated', 'wb.ccfAll', 'wb.ccfTitle', 'wb.ccfNone', 'wb.ccfNote', 'wb.view', 'wb.viewBi', 'wb.viewZh', 'wb.viewEn', 'wb.align', 'wb.realign', 'wb.aligning', 'wb.alignFailed', 'wb.noteAdd', 'wb.noteSave', 'wb.noteCancel', 'wb.noteEmpty', 'wb.noteDelete', 'wb.tabNotes', 'wb.glossary', 'wb.glossaryTitle', 'wb.glossarySave', 'wb.glossarySaved', 'wb.askScope', 'wb.scopeAll', 'wb.scopeSection', 'wb.scopeNoSection', 'wb.citeJump', 'wb.export', 'wb.exported', 'wb.exportFailed']) {
	if (!(key in (zh || {})) || !(key in (en || {}))) problems.push('V35 missing workbench key ' + key);
}

// V36: the workbench styling follows the batch-2/3 colour rule (aliases only,
// hex/rgba at most as a var() fallback) and reuses the existing 640px query.
const wbCssLines = source.split('\n').filter((line) => /^\s*'/.test(line) && /\.mc-wb/.test(line));
if (wbCssLines.length < 40) problems.push('V36 expected at least 40 .mc-wb css lines, got ' + wbCssLines.length);
for (const line of wbCssLines) {
	const bare = stripVars(line).replace(/color:\s*#(?:fff|ffffff)\b/gi, '');
	if (/#[0-9a-fA-F]{3,8}\b/.test(bare) || /\brgba?\(/.test(bare)) problems.push('V36 hardcoded colour outside a var() fallback in: ' + line.slice(0, 60));
}
const wbMediaLines = source.split('\n').filter((line) => /@media/.test(line) && /\.mc-wb/.test(line));
if (wbMediaLines.length !== 1) problems.push('V36 expected one media line for .mc-wb, got ' + wbMediaLines.length);
if (wbMediaLines.length === 1 && !/width<=640px/.test(wbMediaLines[0])) problems.push('V36 the workbench breakpoint must stay 640px');

// V37: §1.2 layout — one two-column grid, left wider than right.
if (!source.includes('.mc-wb-body{flex:1 1 auto;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);min-height:0}')) {
	problems.push('V37 the workbench body must be the 1.45fr/1fr grid');
}
if (!source.includes('.mc-wb-right{display:flex;flex-direction:column;min-width:0;min-height:0;border-left:.5px solid var(--dsw-alias-border-l2)')) {
	problems.push('V37 the right pane must be its own scroll column');
}

// V38: wiring — the button sits on paper cards, the dialog opens from state,
// Enter sends, and the stream reader is the extracted pure helper.
for (const marker of ['arxivIdOf(item.url)', 'onOpenPaper: openWorkbench', 'h(PaperWorkbench, {', "t('wb.open')", 'readSseFrames(', 'setPaperTab(value)', 'paperTexts.delete(paper.id)']) {
	if (!source.includes(marker)) problems.push('V38 workbench wiring missing: ' + marker);
}
if (!source.includes("event.key === 'Enter' && !event.shiftKey")) problems.push('V38 Enter must send and Shift+Enter must add a line');
if (!source.includes("className: 'mc-btn mc-btn-sm mc-wb-open'")) problems.push('V38 the 工作台 button class is missing');

// V39: storage contract — v9 paper slice, listed key, per-section cache.
if (!source.includes("paper: normalizePaperState(raw.paper),")) problems.push('V39 normalize() must build the paper slice');
if (!/\bversion: 11,/.test(source)) problems.push('V39 storage version must be 11');
if (!source.includes("'profile', 'push', 'paper', 'tags'")) problems.push('V39 KNOWN_STATE_KEYS must list paper');
if (!source.includes("sectionsZh: { ...(current.sectionsZh || {}), [section.key]: { zh: result.text, at: Date.now() } }")) {
	problems.push('V39 section explanations must be cached per section key');
}
if (!source.includes('Math.trunc(Number(cell.anchor) || 0)')) problems.push('V39 the scroll anchor must be an integer');

// ---- batch 5 acceptance (V40-V47) -------------------------------------------
// V40: the workbench is a top-level tab (eighth), no longer a dialog that hangs
// off a paper card, and the tab switch renders the workbench pane itself.
const tabButtons = source.match(/h\('button', \{ type: 'button', role: 'tab', className: 'mc-tab/g) || [];
if (tabButtons.length !== 8) problems.push('V40 expected eight top-level tabs, got ' + tabButtons.length);
for (const marker of ["'mc-tab mc-tab-wb'", "t('wb.tab')", "onClick: () => setTab('workbench')", "tab === 'workbench' ? workbenchView", 'h(WorkbenchPane, { t })']) {
	if (!source.includes(marker)) problems.push('V40 workbench tab wiring missing: ' + marker);
}

// V41: the library page imports local PDFs through the host route and keeps the
// parsed record in the in-memory map only.
for (const marker of ["className: 'mc-wb-lib-page'", "className: 'mc-wb-lib-row'", "'mc-btn mc-btn-primary mc-wb-import'", "accept: 'application/pdf,.pdf'", 'multiple: true', 'function readFileBase64(', 'fetch(WB_PDF_ROUTE, {', 'paperTexts.set(payload.id, payload)', 'WB_IMPORT_FILES_MAX', 'WB_IMPORT_BYTES_MAX', 'WB_LIB_MAX']) {
	if (!source.includes(marker)) problems.push('V41 pdf library wiring missing: ' + marker);
}
if (!source.includes("const WB_PDF_ROUTE = '/my-courses/paper/pdf';")) problems.push('V41 the import route constant drifted');
if (!source.includes('const WB_PDF_ID_PATTERN = /^pdf:[a-f0-9]{16}$/;')) problems.push('V41 the pdf id pattern drifted');

// V42: page mode — the reader is a page inside the tab, with a way back, and it
// must not render the dialog shell (mask + aria-modal) in that mode.
for (const marker of ["className: 'mc-wb mc-wb-inline mc-wb-tab-page'", "className: 'mc-btn mc-btn-sm mc-wb-back'", "'‹ ' + t('wb.tab')"]) {
	if (!source.includes(marker)) problems.push('V42 page-mode marker missing: ' + marker);
}
if (!/page \? h\('button', \{ type: 'button', className: 'mc-btn mc-btn-sm mc-wb-back'/.test(source)) {
	problems.push('V42 the back button must only render in page mode');
}
if (!/if \(page\) \{\s*return h\('div', \{ className: 'mc-wb mc-wb-inline mc-wb-tab-page'/.test(source)) {
	problems.push('V42 page mode must return before the dialog branch');
}
if (!source.includes("role: 'dialog', 'aria-modal': 'true'")) problems.push('V42 the dialog branch must stay for the inline card preview');

// V43: PDF entries skip arXiv text loading and go straight to the pdf route;
// every host pdf error code has a translated sentence.
for (const marker of ["String(paper.id || '').indexOf('pdf:') === 0", 'function pdfCodeText(', "if (raw === 'PDF_NO_TEXT')", "if (raw === 'PDF_ENCRYPTED')", "if (raw === 'PDF_TOO_LARGE' || raw === 'BODY_TOO_LARGE')", "if (raw === 'PDF_NOT_CACHED')"]) {
	if (!source.includes(marker)) problems.push('V43 pdf reading marker missing: ' + marker);
}
if (!source.includes('body: JSON.stringify(pdfEntry ? { id: paper.id } : { url: itemUrlOf(paper, cell) })')) {
	problems.push('V43 a pdf entry must reopen by id instead of fetching a url');
}

// V44: the papers tab keeps its own workbench entry and gains the CCF chips.
for (const marker of ['onOpenWorkbench', "'mc-btn mc-btn-sm mc-wb-open'", "'mc-chip mc-ccf-chip'", "const [ccfFilter, setCcfFilter] = useState('all')", 'ccfRank(', 'className: \'mc-ccf-badge\'']) {
	if (!source.includes(marker)) problems.push('V44 papers-tab marker missing: ' + marker);
}
if (!source.includes("const WB_CCF_FILTERS = ['all', 'A', 'rated'];")) problems.push('V44 the ccf filter set drifted');

// V45: the CCF tables are curated, whole-word matched, and never guessed.
const ccfBlock = (() => {
	const start = source.indexOf('const CCF_A_VENUES = [');
	if (start < 0) return '';
	const end = source.indexOf('const COMPETITION_LEVELS', start);
	return end > start ? source.slice(start, end) : '';
})();
if (!ccfBlock) problems.push('V45 the CCF venue tables are missing');
const listOf = (name) => {
	const start = source.indexOf('const ' + name + ' = [');
	if (start < 0) return [];
	const end = source.indexOf('];', start);
	return (source.slice(start, end).match(/'([^']+)'/g) || []).map((token) => token.slice(1, -1));
};
const ccfA = listOf('CCF_A_VENUES');
const ccfB = listOf('CCF_B_VENUES');
const ccfC = listOf('CCF_C_VENUES');
if (ccfA.length < 45) problems.push('V45 the CCF-A list is too short: ' + ccfA.length);
for (const venue of ['NEURIPS', 'NIPS', 'ICML', 'CVPR', 'ACL', 'STOC', 'OSDI', 'SIGMOD', 'CHI']) {
	if (!ccfA.includes(venue)) problems.push('V45 CCF-A list is missing ' + venue);
}
for (const venue of ['ICLR', 'ARXIV']) {
	if (ccfA.includes(venue) || ccfB.includes(venue) || ccfC.includes(venue)) problems.push('V45 ' + venue + ' must stay unrated instead of being guessed');
}
if (!source.includes("const raw = [source.venue, source.comment, source.journalRef]")) {
	problems.push('V45 paperCcfLevel must read venue/comment/journalRef and nothing else');
}
if (!source.includes("if (!raw) return '';")) problems.push('V45 paperCcfLevel must stay silent when the metadata is empty');
if (/function paperCcfLevel[\s\S]{0,800}?\.title/.test(source)) problems.push('V45 paperCcfLevel must never match the title');
if (!source.includes('return Object.prototype.hasOwnProperty.call(CCF_RANK, key) ? CCF_RANK[key] : 3;')) {
	problems.push('V45 an unknown CCF level must sort last');
}
if (!source.includes("if (ccfMatchList(haystack, CCF_A_VENUES)) return 'A';")) problems.push('V45 the A lookup is missing');

// V46: styling for the new pieces stays on aliases and the 640px query.
const ccfCssLines = source.split('\n').filter((line) => /^\s*'/.test(line) && /\.mc-ccf-/.test(line));
if (ccfCssLines.length < 8) problems.push('V46 expected at least 8 .mc-ccf- css lines, got ' + ccfCssLines.length);
for (const line of ccfCssLines) {
	const bare = stripVars(line).replace(/color:\s*#(?:fff|ffffff)\b/gi, '');
	if (/#[0-9a-fA-F]{3,8}\b/.test(bare) || /\brgba?\(/.test(bare)) problems.push('V46 hardcoded colour outside a var() fallback in: ' + line.slice(0, 60));
}
for (const marker of ['.mc-wb-lib-row{', '.mc-wb-back{', '.mc-wb-import{', '.mc-wb-file{', '.mc-wb-inline{', '.mc-wb-tab-page{']) {
	if (!source.includes(marker)) problems.push('V46 missing css rule ' + marker);
}
if (!/\.mc-ccf-badge\[data-level="A"\]/.test(source)) problems.push('V46 the CCF-A badge needs its own colour');
const wbMedia = source.split('\n').filter((line) => /@media/.test(line) && /\.mc-wb/.test(line));
if (wbMedia.length !== 1) problems.push('V46 expected one media line for .mc-wb, got ' + wbMedia.length);
if (!source.includes('.mc-wb-box{border-radius:0}')) problems.push('V46 the page-mode reader must go edge to edge on phones');

// ---- batch 6 acceptance (V47-V52) ------------------------------------------
// V47: three reading views, persisted per paper, off by default effects none of
// the other panes (the switch is pure render state + a paper patch).
for (const marker of ["const WB_VIEWS = ['bi', 'zh', 'en'];", "const WB_VIEW_LABEL = { bi: 'wb.viewBi', zh: 'wb.viewZh', en: 'wb.viewEn' };", "onClick: () => changeView(key)", "'aria-pressed': view === key ? 'true' : 'false'", 'patchPaper(paper.id, { view: next })', 'const showEn = view !== \'zh\';', 'const showZh = view !== \'en\';']) {
	if (!source.includes(marker)) problems.push('V47 view-switch marker missing: ' + marker);
}
if (!source.includes("view: WB_VIEWS.indexOf(String(cell.view || '')) >= 0 ? String(cell.view) : 'bi',")) {
	problems.push('V47 the stored view must be validated against WB_VIEWS with a bi default');
}

// V48: paragraph alignment is validated before it is stored — a short, long or
// out-of-order [n] list must degrade to the whole-section blockquote.
for (const marker of ['function parseAlignedTranslation(text, count)', 'if (total <= 0 || total > WB_NOTE_SECTION_MAX) return null;', 'if (rows.length !== total) return null;', 'if (!rows[index]) return null;', '{ zh: \'\', aligned, at: Date.now() }', "setNotice(aligned ? '' : t('wb.alignFailed'));", 'const aligned = stored && Array.isArray(stored.aligned) && stored.aligned.length === visible.length ? stored.aligned : null;']) {
	if (!source.includes(marker)) problems.push('V48 alignment marker missing: ' + marker);
}
if (!source.includes('onClick: () => runAlign(section)')) problems.push('V48 every section heading needs its align button');
const sectionRender = (() => {
	const start = source.indexOf('const sectionNode = (section) => {');
	const end = source.indexOf('const leftBody = textBusy', start);
	return start >= 0 && end > start ? source.slice(start, end) : '';
})();
if (!sectionRender) problems.push('V48 the section renderer is missing');
if (/aligned\[order\]\s*\|\|/.test(sectionRender)) problems.push('V48 a missing aligned row must not be silently back-filled');

// V49: notes are paragraph-anchored, capped, stored in the paper slice and
// reachable from both the paragraph and the notes tab.
for (const marker of ['function normalizePaperNotes(raw)', 'const WB_NOTE_MAX = 200;', 'const WB_NOTE_QUOTE_MAX = 160;', 'const WB_NOTE_TEXT_MAX = 2000;', 'notes: normalizePaperNotes(cell.notes),', 'function beginNote(section, order, paragraph)', 'function saveNote()', 'function removeNote(id)', 'function jumpToNote(note)', "onClick: () => beginNote(section, order, paragraph)"]) {
	if (!source.includes(marker)) problems.push('V49 note marker missing: ' + marker);
}
if (!source.includes('.mc-wb-p.mc-wb-has-note{border-left')) problems.push('V49 a noted paragraph needs its own marker style');
if (!source.includes('const WB_NOTE_SECTION_MAX = 64;')) problems.push('V49 the notes-per-paper cap drifted');

// V50: the glossary is prompt-only — it is normalised, capped and posted with
// every model call, and never substituted into the rendered text.
for (const marker of ['function normalizeGlossary(raw)', 'function glossaryText(list)', 'const WB_GLOSSARY_MAX = 40;', 'setGlossary(list)', 'glossary: glossaryList()']) {
	if (!source.includes(marker)) problems.push('V50 glossary marker missing: ' + marker);
}
const glossaryCalls = (source.match(/glossary: glossaryList\(\)/g) || []).length;
if (glossaryCalls < 4) problems.push('V50 expected the glossary on every model call, found ' + glossaryCalls);
for (const bad of ['paragraph.replace(', 'aligned[order].replace(', 'translateTerm(']) {
	if (source.includes(bad)) problems.push('V50 the glossary must never rewrite body text: ' + bad);
}

// V51: 本节/全文 ask scope plus clickable citation chips.
for (const marker of ['function parseCitations(text)', 'const WB_CITE_PATTERN = /[\\[【]§', '[^\\[\\]【】¶]{1,120}?', "'mc-wb-cite'", 'onClick: () => jumpToCitation(cite)', "onClick: () => setScope('section')", "className: 'mc-wb-scope'", 'function jumpToCitation(cite)']) {
	if (!source.includes(marker)) problems.push('V51 citation marker missing: ' + marker);
}
if (!source.includes('scope: sectionKey ? \'section\' : \'all\',')) problems.push('V51 the ask body must carry the scope');
if (!source.includes('sectionKey,')) problems.push('V51 the ask body must carry the section key');

// V52: markdown export is data-only, and the notes tab is the third pane.
for (const marker of ['function buildPaperMarkdown(input)', "type: 'text/markdown;charset=utf-8'", "anchor.download = name + '.md';", 'const WB_EXPORT_NAME_MAX = 80;', "onClick: exportMarkdown", "onClick: () => switchTab('notes')", "tab === 'notes' ? notesPane"]) {
	if (!source.includes(marker)) problems.push('V52 export/notes marker missing: ' + marker);
}
for (const marker of ['.mc-wb-views{', '.mc-wb-pair{', '.mc-wb-cite{', '.mc-wb-noterow{', '.mc-wb-gloss{', '.mc-wb-flash{', '.mc-wb-pnote{', '.mc-wb-scope{']) {
	if (!source.includes(marker)) problems.push('V52 missing css rule ' + marker);
}
if (/@keyframes mc-wb-flash[^}]*#[0-9a-fA-F]{3}/.test(source)) problems.push('V52 the flash animation must stay on aliases');

console.log('inject:', JSON.stringify(plugin.inject));
console.log('registrations:', registrations.map((entry) => entry.options.name + ':' + (entry.options.id || entry.options.key)).join(', '));
console.log('components:', registrations.map((entry) => entry.component && entry.component.name).join(', '));
console.log(problems.length === 0 ? 'CLIENT OK' : 'CLIENT FAILURES: ' + problems.join('; '));
process.exitCode = problems.length === 0 ? 0 : 1;
