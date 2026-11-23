/**
 * Host half of the "My Courses" bundle.
 *
 * The page owns all course data. This half adds the capabilities the page
 * cannot obtain on its own: reading a timetable picture with the model the
 * user already configured, and the paper workbench (full text, Chinese
 * explanation, grounded Q&A). It registers these same-origin routes:
 * `POST /my-courses/extract`, which saves the submitted image as a durable
 * attachment, asks the default model to transcribe the week into JSON, and
 * returns the raw model text. The page validates and applies that text, and
 * falls back to its paste dialog when this route reports a failure.
 *
 * The workbench routes are `POST /my-courses/paper/text` (fetch, parse and
 * cache one arXiv paper), `POST /my-courses/paper/pdf` (parse a PDF the user
 * imported, so the same two-column reader works on any paper), 
 * `POST /my-courses/paper/explain` and `POST /my-courses/paper/ask`
 * (streamed SSE answers), and `GET /my-courses/paper/status` (whether a
 * model is reachable). They use
 * the same default model under the same key-less contract: nothing here
 * reads an API key, and every call is capped by maxTokens and a timeout.
 *
 * The web server is the sole hard dependency: without it the page cannot be
 * reached anyway. The model and attachment services are resolved per request,
 * so a profile without them answers `NO_SERVICES` instead of staying inactive.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ROUTE_PATH = '/my-courses/extract';
const PAPERS_PATH = '/my-courses/papers';
const NEWS_PATH = '/my-courses/news';
const REPOS_PATH = '/my-courses/repos';
const ARXIV_QUERY_URL = 'https://export.arxiv.org/api/query';
const HN_SEARCH_URL = 'https://hn.algolia.com/api/v1/search';
const GITHUB_SEARCH_URL = 'https://api.github.com/search/repositories';
const FEED_LIMIT = 20;
const FEED_QUERY_MAX = 120;
const NEWS_WINDOW_DAYS = 30;
const REPO_STALE_DAYS = 180;
const USER_AGENT = 'dsh-my-courses/1.5.0 (local study workspace)';
const PAPER_LIMIT = 30;
const MIN_SUMMARY_LEN = 120;
const DEDUP_ABSTRACT_PREFIX = 120;
const CATEGORY_PATTERN = /^[a-z-]+\.[A-Z]{2}$/;
/* 与客户端 DIRECTIONS 同源的 arXiv 真白名单：形态合法但不在表内的码一律拒绝（R1）。 */
const DIRECTION_CODES = ['cs.CL', 'cs.AI', 'cs.LG', 'cs.CV', 'cs.CR', 'cs.RO', 'cs.DB', 'cs.DC', 'cs.SE', 'cs.HC', 'cs.CY', 'stat.ML'];
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const CALL_TIMEOUT_MS = 120000;
const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const PAPER_TEXT_PATH = '/my-courses/paper/text';
const PAPER_EXPLAIN_PATH = '/my-courses/paper/explain';
const PAPER_ASK_PATH = '/my-courses/paper/ask';
const PAPER_STATUS_PATH = '/my-courses/paper/status';
const ARXIV_HTML_BASE = 'https://arxiv.org/html/';
const AR5IV_HTML_BASE = 'https://ar5iv.labs.arxiv.org/html/';
const PAPER_JSON_LIMIT = 64 * 1024;
const PAPER_HTML_MAX_BYTES = 4 * 1024 * 1024;
const PAPER_TEXT_MAX_CHARS = 200000;
const PAPER_SECTION_PARAS_MAX = 80;
const PAPER_PARA_MAX_CHARS = 4000;
const PAPER_CACHE_TTL_MS = 7 * 24 * 3600 * 1000;
const PAPER_FETCH_TIMEOUT_MS = 25000;
const PAPER_PDF_PATH = '/my-courses/paper/pdf';
const PDF_MAX_BYTES = 8 * 1024 * 1024;
const PDF_JSON_LIMIT = 12 * 1024 * 1024;
const PDF_PAGE_MAX = 200;
const PDF_TEXT_MIN_CHARS = 500;
const PDF_READABLE_MIN = 0.85;
const PDF_PARA_GAP_RATIO = 1.8;
const PDF_HEADING_SCALE = 1.12;
const EXPLAIN_TIMEOUT_MS = 90000;
const ASK_CONTEXT_MAX_CHARS = 6000;
const ASK_HISTORY_MAX = 2;
const ARXIV_ID_PATTERN = /^(?:\d{4}\.\d{4,5}|[a-z][a-z-]*(?:\.[A-Z]{2})?\/\d{7})(?:v\d+)?$/;
const ARXIV_HOSTS = new Set(['arxiv.org', 'www.arxiv.org', 'ar5iv.labs.arxiv.org']);

const SYSTEM_PROMPT = [
	'You transcribe a university timetable screenshot into JSON for a study planner.',
	'Return ONLY one JSON object, no prose, no markdown fences.',
	'Shape: {"courses":[{"name":"...","room":"...","teacher":"...","day":0,"periods":[1,2]}]}',
	'Rules:',
	'- day: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday.',
	'- periods: the 1-based row numbers of the timetable left time column, matching the period labels shown (第1节 = 1). A block spanning several consecutive periods lists every period in ascending order.',
	'- Enumerate one object per timetable block per weekday; the same course on two weekdays is two objects.',
	'- name is the course title exactly as printed; room is the classroom/building text exactly as printed; drop trailing ellipses instead of inventing text.',
	'- teacher is "" when the picture does not show it.',
	'- Keep the original language of the text; never translate.',
	'- Emit at most 60 objects. Skip decorative rows (month, week number, weekday header).',
].join('\n');

const USER_PROMPT = '这是本周课表截图。请按约定输出 JSON。';

/**
 * Register the extraction route when the composition provides a web server.
 * The route is the only thing this half adds, so the web server is the sole
 * hard dependency; the model and attachment services are resolved per request
 * and a profile without them simply answers `NO_SERVICES`.
 * @param ctx - Host context of the plugin fiber.
 */
export function apply(ctx) {
	const server = ctx.webServer || (typeof ctx.get === 'function' ? ctx.get('webServer') : undefined);
	if (!server) return;
	ctx.effect(() => server.register({
		kind: 'exact',
		path: ROUTE_PATH,
		handler: (req, res) => handleExtract(ctx, req, res),
	}), 'my-courses: timetable extraction route');
	ctx.effect(() => server.register({
		kind: 'exact',
		path: PAPERS_PATH,
		handler: (req, res) => handlePapers(req, res),
	}), 'my-courses: paper feed route');
	ctx.effect(() => server.register({
		kind: 'exact',
		path: NEWS_PATH,
		handler: (req, res) => handleNews(req, res),
	}), 'my-courses: news feed route');
	ctx.effect(() => server.register({
		kind: 'exact',
		path: REPOS_PATH,
		handler: (req, res) => handleRepos(req, res),
	}), 'my-courses: repository feed route');
	ctx.effect(() => server.register({
		kind: 'exact',
		path: PAPER_TEXT_PATH,
		handler: (req, res) => handlePaperText(req, res),
	}), 'my-courses: paper full text route');
	ctx.effect(() => server.register({
		kind: 'exact',
		path: PAPER_EXPLAIN_PATH,
		handler: (req, res) => handlePaperExplain(ctx, req, res),
	}), 'my-courses: paper explanation route');
	ctx.effect(() => server.register({
		kind: 'exact',
		path: PAPER_ASK_PATH,
		handler: (req, res) => handlePaperAsk(ctx, req, res),
	}), 'my-courses: paper question route');
	ctx.effect(() => server.register({
		kind: 'exact',
		path: PAPER_STATUS_PATH,
		handler: (req, res) => handlePaperStatus(ctx, req, res),
	}), 'my-courses: paper status route');
	ctx.effect(() => server.register({
		kind: 'exact',
		path: PAPER_PDF_PATH,
		handler: (req, res) => handlePaperPdf(req, res),
	}), 'my-courses: paper pdf route');
}

/** The route needs the browser HTTP carrier; everything else is optional. */
export const inject = ['webServer'];

/**
 * Answer one extraction request.
 * @param ctx - Host context used to resolve the optional services.
 * @param req - node HTTP request.
 * @param res - node HTTP response.
 */
async function handleExtract(ctx, req, res) {
	if (req.method !== 'POST') {
		send(res, 405, { ok: false, error: 'HTTP_METHOD' });
		return;
	}

	let body = '';
	try {
		body = await readBody(req, MAX_BODY_BYTES);
	} catch (error) {
		send(res, 413, { ok: false, error: 'BODY_TOO_LARGE' });
		return;
	}

	let input;
	try {
		input = JSON.parse(body || '{}');
	} catch (error) {
		send(res, 400, { ok: false, error: 'BAD_REQUEST' });
		return;
	}

	const url = typeof input.image === 'string' ? input.image : '';
	const parsed = parseDataUrl(url);
	if (!parsed) {
		send(res, 400, { ok: false, error: 'NO_IMAGE' });
		return;
	}

	const llm = ctx.get('llm');
	const attachments = ctx.get('attachments');
	const defaults = ctx.get('agentDefaultModel');
	if (!llm || !attachments || !defaults) {
		send(res, 503, { ok: false, error: 'NO_SERVICES' });
		return;
	}

	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), CALL_TIMEOUT_MS);
	res.on('close', () => abort.abort());

	try {
		const selection = defaults.currentSelection();
		const modalities = await modalitiesOf(llm, selection);
		if (modalities !== undefined && modalities.indexOf('image') < 0) {
			send(res, 200, { ok: false, error: 'MODEL_NO_VISION', model: selection.model });
			return;
		}

		const reference = await attachments.saveImage({
			data: parsed.data,
			mediaType: parsed.mediaType,
			name: 'my-courses-timetable.' + parsed.mediaType.split('/')[1],
		});

		const options = {
			provider: selection.provider,
			model: selection.model,
			system: SYSTEM_PROMPT,
			messages: [{
				role: 'user',
				content: [
					{ type: 'image', attachment: reference },
					{ type: 'text', text: USER_PROMPT },
				],
			}],
			temperature: 0,
			maxTokens: 3000,
			signal: abort.signal,
		};

		let text = '';
		let failure;
		for await (const chunk of llm.stream(options)) {
			if (chunk.type === 'text-delta') text += chunk.text;
			else if (chunk.type === 'finish' && chunk.reason !== undefined && chunk.reason.kind !== 'stop') {
				const reason = chunk.reason;
				failure = reason.kind === 'error' || reason.kind === 'aborted'
					? (reason.failure && reason.failure.message) || reason.kind
					: reason.kind;
			}
		}

		if (failure !== undefined) {
			send(res, 200, { ok: false, error: String(failure), model: selection.model });
			return;
		}
		if (text.trim().length === 0) {
			send(res, 200, { ok: false, error: 'EMPTY_RESULT', model: selection.model });
			return;
		}
		send(res, 200, { ok: true, text, model: selection.model });
	} catch (error) {
		send(res, 200, { ok: false, error: messageOf(error) });
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Resolve the selected model's input modalities when the adapter reports them.
 * @param llm - the llm service.
 * @param selection - provider/model selection.
 * @returns modalities, or undefined when unknown.
 */
async function modalitiesOf(llm, selection) {
	try {
		const info = await llm.resolveModelInfo(selection.provider, selection.model);
		return info && Array.isArray(info.inputModalities) ? info.inputModalities : undefined;
	} catch (error) {
		return undefined;
	}
}

/**
 * Split one data URL into bytes and media type.
 * @param url - `data:<type>;base64,<payload>`.
 * @returns the decoded image, or null when unsupported.
 */
function parseDataUrl(url) {
	const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(url);
	if (!match) return null;
	const mediaType = match[1].toLowerCase();
	if (!MEDIA_TYPES.has(mediaType)) return null;
	const data = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
	if (data.length === 0) return null;
	return { data: new Uint8Array(data), mediaType };
}

/**
 * Read a request body up to a byte cap.
 * @param req - node HTTP request.
 * @param limit - maximum accepted byte count.
 * @returns the body text.
 */
async function readBody(req, limit) {
	const parts = [];
	let total = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		total += buffer.length;
		if (total > limit) throw new Error('body too large');
		parts.push(buffer);
	}
	return Buffer.concat(parts).toString('utf8');
}

/**
 * Write one JSON response.
 * @param res - node HTTP response.
 * @param status - HTTP status.
 * @param payload - JSON body.
 */
function send(res, status, payload) {
	if (res.headersSent) {
		res.end();
		return;
	}
	const body = JSON.stringify(payload);
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'cache-control': 'no-store',
		'content-length': Buffer.byteLength(body),
	});
	res.end(body);
}

/**
 * Read a message off any thrown value.
 * @param error - thrown value.
 * @returns a readable message.
 */
function messageOf(error) {
	if (!error) return 'unknown error';
	return String(error.message || error);
}

/**
 * Answer one paper-feed request by proxying the arXiv Atom API. The browser
 * cannot call arXiv directly (no CORS headers), so the Host does it and hands
 * back a compact JSON list.
 * @param req - node HTTP request.
 * @param res - node HTTP response.
 */
async function handlePapers(req, res) {
	if (req.method !== 'GET') {
		send(res, 405, { ok: false, error: 'HTTP_METHOD' });
		return;
	}
	let url;
	try {
		url = new URL(req.url || '/', 'http://localhost');
	} catch (error) {
		send(res, 400, { ok: false, error: 'BAD_REQUEST' });
		return;
	}
	const asked = String(url.searchParams.get('cats') || '')
		.split(',')
		.map((code) => code.trim())
		.filter(Boolean);
	const unknown = asked.filter((code) => DIRECTION_CODES.indexOf(code) < 0);
	if (unknown.length > 0) {
		send(res, 400, { ok: false, error: 'BAD_CATEGORY' });
		return;
	}
	const categories = asked.filter((code) => CATEGORY_PATTERN.test(code)).slice(0, 6);
	const keywords = String(url.searchParams.get('q') || '').trim().slice(0, 120);
	const limit = Math.min(PAPER_LIMIT, Math.max(1, Number(url.searchParams.get('max')) || 20));

	const terms = [];
	if (categories.length > 0) terms.push('(' + categories.map((code) => 'cat:' + code).join(' OR ') + ')');
	if (keywords) {
		const words = keywords.split(/\s+/).filter(Boolean).slice(0, 5);
		if (words.length > 0) terms.push('(' + words.map((word) => 'all:"' + word.replace(/"/g, '') + '"').join(' AND ') + ')');
	}
	if (terms.length === 0) {
		send(res, 400, { ok: false, error: 'NO_FILTER' });
		return;
	}

	const target = new URL(ARXIV_QUERY_URL);
	target.searchParams.set('search_query', terms.join(' AND '));
	target.searchParams.set('start', '0');
	target.searchParams.set('max_results', String(limit));
	target.searchParams.set('sortBy', 'submittedDate');
	target.searchParams.set('sortOrder', 'descending');

	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), 20000);
	res.on('close', () => abort.abort());
	try {
		const response = await fetch(target, {
			headers: { 'user-agent': USER_AGENT },
			signal: abort.signal,
		});
		if (!response.ok) {
			send(res, 200, { ok: false, error: 'ARXIV_' + response.status });
			return;
		}
		const xml = await response.text();
		send(res, 200, { ok: true, items: parseAtom(xml, limit), fetchedAt: Date.now() });
	} catch (error) {
		send(res, 200, { ok: false, error: messageOf(error) });
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Answer one news-feed request by proxying the key-less Hacker News search.
 * Only story titles with a resolvable link survive; failures still answer 200
 * with `ok:false` so the page can mark that one source as failed.
 * @param req - node HTTP request.
 * @param res - node HTTP response.
 */
async function handleNews(req, res) {
	if (req.method !== 'GET') {
		send(res, 405, { ok: false, error: 'HTTP_METHOD' });
		return;
	}
	let url;
	try {
		url = new URL(req.url || '/', 'http://localhost');
	} catch (error) {
		send(res, 400, { ok: false, error: 'BAD_REQUEST' });
		return;
	}
	const query = String(url.searchParams.get('q') || '').trim().slice(0, FEED_QUERY_MAX);
	const limit = Math.min(FEED_LIMIT, Math.max(1, Number(url.searchParams.get('max')) || 10));
	if (!query) {
		send(res, 400, { ok: false, error: 'NO_FILTER' });
		return;
	}
	const since = Math.floor(Date.now() / 1000) - NEWS_WINDOW_DAYS * 86400;
	const target = new URL(HN_SEARCH_URL);
	target.searchParams.set('query', query);
	target.searchParams.set('tags', 'story');
	target.searchParams.set('hitsPerPage', String(limit));
	target.searchParams.set('numericFilters', 'created_at_i>' + String(since));

	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), 20000);
	res.on('close', () => abort.abort());
	try {
		const response = await fetch(target, {
			headers: { 'user-agent': USER_AGENT },
			signal: abort.signal,
		});
		if (!response.ok) {
			send(res, 200, { ok: false, error: 'HN_' + response.status });
			return;
		}
		const payload = await response.json();
		if (!payload || !Array.isArray(payload.hits)) {
			send(res, 200, { ok: false, error: 'HN_SHAPE' });
			return;
		}
		const items = [];
		for (const hit of payload.hits) {
			if (items.length >= limit) break;
			const title = cleanText(hit.title || hit.story_title || '');
			if (!title) continue;
			const objectId = String(hit.objectID || '');
			if (!objectId) continue;
			const link = String(hit.url || (objectId ? 'https://news.ycombinator.com/item?id=' + objectId : ''));
			if (!link) continue;
			items.push({
				id: 'hn:' + objectId,
				title: title.slice(0, 200),
				summary: cleanText(hit.story_text || hit.comment_text || '').slice(0, 240),
				url: link.slice(0, 500),
				publishedAt: Math.round(Number(hit.created_at_i || 0) * 1000) || (Date.parse(hit.created_at) || 0),
				hot: Number(hit.points) || 0,
			});
		}
		send(res, 200, { ok: true, items, fetchedAt: Date.now() });
	} catch (error) {
		send(res, 200, { ok: false, error: 'HN_' + messageOf(error) });
	} finally {
		clearTimeout(timer);
	}
}

/**
 * Answer one repository-feed request by proxying the anonymous GitHub search.
 * Repositories idle for REPO_STALE_DAYS are dropped so the feed stays current.
 * Rate limiting is reported as `GITHUB_RATE`, never as a 5xx.
 * @param req - node HTTP request.
 * @param res - node HTTP response.
 */
async function handleRepos(req, res) {
	if (req.method !== 'GET') {
		send(res, 405, { ok: false, error: 'HTTP_METHOD' });
		return;
	}
	let url;
	try {
		url = new URL(req.url || '/', 'http://localhost');
	} catch (error) {
		send(res, 400, { ok: false, error: 'BAD_REQUEST' });
		return;
	}
	const query = String(url.searchParams.get('q') || '').trim().slice(0, FEED_QUERY_MAX);
	const limit = Math.min(FEED_LIMIT, Math.max(1, Number(url.searchParams.get('max')) || 10));
	if (!query) {
		send(res, 400, { ok: false, error: 'NO_FILTER' });
		return;
	}
	const target = new URL(GITHUB_SEARCH_URL);
	target.searchParams.set('q', query + ' stars:>100');
	target.searchParams.set('sort', 'stars');
	target.searchParams.set('order', 'desc');
	target.searchParams.set('per_page', String(limit));

	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), 20000);
	res.on('close', () => abort.abort());
	try {
		const response = await fetch(target, {
			headers: {
				accept: 'application/vnd.github+json',
				'user-agent': USER_AGENT,
				'x-github-api-version': '2022-11-28',
			},
			signal: abort.signal,
		});
		if (response.status === 403 || response.status === 429) {
			send(res, 200, { ok: false, error: 'GITHUB_RATE' });
			return;
		}
		if (!response.ok) {
			send(res, 200, { ok: false, error: 'GITHUB_' + response.status });
			return;
		}
		if (String(response.headers.get('x-ratelimit-remaining') || '') === '0') {
			send(res, 200, { ok: false, error: 'GITHUB_RATE' });
			return;
		}
		const payload = await response.json();
		if (!payload || !Array.isArray(payload.items)) {
			send(res, 200, { ok: false, error: 'GITHUB_SHAPE' });
			return;
		}
		const cutoff = Date.now() - REPO_STALE_DAYS * 86400000;
		const items = [];
		for (const row of payload.items) {
			if (items.length >= limit) break;
			const name = String(row.full_name || '');
			const link = String(row.html_url || '');
			const pushed = Date.parse(String(row.pushed_at || '')) || 0;
			if (!name || !link) continue;
			if (pushed > 0 && pushed < cutoff) continue;
			const topics = Array.isArray(row.topics) ? row.topics : [];
			const tags = [];
			if (row.language) tags.push(String(row.language));
			for (const topic of topics) {
				if (tags.length >= 4) break;
				const text = String(topic || '');
				if (text && tags.indexOf(text) < 0) tags.push(text);
			}
			items.push({
				id: 'gh:' + String(row.id || name),
				title: name.slice(0, 200),
				summary: cleanText(row.description || '').slice(0, 240),
				url: link.slice(0, 500),
				publishedAt: pushed,
				hot: Number(row.stargazers_count) || 0,
				tags,
			});
		}
		send(res, 200, { ok: true, items, fetchedAt: Date.now() });
	} catch (error) {
		send(res, 200, { ok: false, error: 'GITHUB_' + messageOf(error) });
	} finally {
		clearTimeout(timer);
	}
}

/* ------------------------------------------------------------------------- *
 * Batch ④ — paper workbench.
 *
 * Three capabilities the page cannot obtain on its own:
 *   POST /my-courses/paper/text     — fetch one arXiv paper's HTML, parse it
 *                                     into sections/paragraphs, cache on disk;
 *   POST /my-courses/paper/explain  — stream a Chinese explanation (SSE);
 *   POST /my-courses/paper/ask      — stream a grounded answer (SSE);
 *   GET  /my-courses/paper/status   — report whether a model is available.
 *
 * The model comes from the user's own DSH selection, exactly like the
 * timetable route above: no API key, no environment variable, no extra
 * credential file. Every model call is bounded by maxTokens and a timeout so
 * an idle workbench never spends quota.
 * ------------------------------------------------------------------------- */

/** Where parsed papers are cached; tests may point this elsewhere. */
let paperCacheRoot = '';

/**
 * Override the paper cache directory (test seam; production uses ~/.dsh/cache).
 * @param dir - absolute directory, or '' to restore the default.
 */
export function setPaperCacheDir(dir) {
	paperCacheRoot = String(dir || '');
}

/**
 * Resolve the directory that stores parsed paper JSON.
 * @returns absolute directory path.
 */
function paperCacheDir() {
	if (paperCacheRoot) return paperCacheRoot;
	return join(homedir(), '.dsh', 'cache', 'my-courses', 'papers');
}

/**
 * JSON cache file for one paper id.
 * @param id - normalized arXiv id.
 * @returns absolute file path.
 */
function paperCacheFile(id) {
	return join(paperCacheDir(), String(id).replace(/[^A-Za-z0-9._-]/g, '_') + '.json');
}

/**
 * Read one cached paper record.
 * @param id - normalized arXiv id.
 * @returns the record, or null when absent, unreadable or stale.
 */
async function readPaperCache(id) {
	try {
		const raw = await fs.readFile(paperCacheFile(id), 'utf8');
		const parsed = JSON.parse(raw);
		if (!parsed || parsed.ok !== true || !Array.isArray(parsed.sections)) return null;
		if (Date.now() - Number(parsed.fetchedAt || 0) > PAPER_CACHE_TTL_MS) return null;
		return parsed;
	} catch (error) {
		return null;
	}
}

/**
 * Persist one paper record. A read-only home directory must not fail the request.
 * @param record - parsed paper record.
 * @returns whether the write succeeded.
 */
async function writePaperCache(record) {
	try {
		await fs.mkdir(paperCacheDir(), { recursive: true });
		await fs.writeFile(paperCacheFile(record.id), JSON.stringify(record), 'utf8');
		return true;
	} catch (error) {
		return false;
	}
}

/**
 * Count cached papers for the status route.
 * @returns file count, 0 when the cache does not exist yet.
 */
async function countCachedPapers() {
	try {
		const names = await fs.readdir(paperCacheDir());
		return names.filter((name) => name.endsWith('.json')).length;
	} catch (error) {
		return 0;
	}
}

/**
 * Reduce any arXiv reference to a bare, validated id. The host never fetches a
 * URL supplied by the browser: only ids from this function reach `fetch`, so a
 * crafted link cannot turn the route into an SSRF primitive.
 * @param input - arXiv abs/pdf/html URL, or a bare id.
 * @returns `{ ok: true, id, version }` or `{ ok: false, error: 'BAD_URL' }`.
 */
function normalizeArxivId(input) {
	const raw = String(input || '').trim();
	if (!raw) return { ok: false, error: 'BAD_URL' };
	let candidate = raw;
	if (/^https?:\/\//i.test(raw)) {
		let parsed;
		try {
			parsed = new URL(raw);
		} catch (error) {
			return { ok: false, error: 'BAD_URL' };
		}
		if (!ARXIV_HOSTS.has(parsed.hostname.toLowerCase())) return { ok: false, error: 'BAD_URL' };
		const match = /\/(?:abs|pdf|html)\/(.+?)\/?$/.exec(parsed.pathname);
		if (!match) return { ok: false, error: 'BAD_URL' };
		candidate = match[1];
	}
	candidate = candidate.replace(/\.pdf$/i, '').replace(/\/+$/, '');
	if (!ARXIV_ID_PATTERN.test(candidate)) return { ok: false, error: 'BAD_URL' };
	const versionMatch = /v(\d+)$/.exec(candidate);
	return {
		ok: true,
		id: candidate.replace(/v\d+$/, ''),
		version: versionMatch ? 'v' + versionMatch[1] : '',
	};
}

/**
 * Fetch one paper's HTML, preferring arXiv's own renderer and falling back to
 * ar5iv when arXiv has no HTML for that submission.
 * @param id - normalized arXiv id (no version).
 * @param version - version suffix such as `v1`, or ''.
 * @returns `{ ok: true, html, source }` or `{ ok: false, error }`.
 */
async function fetchPaperHtml(id, version) {
	const targets = [ARXIV_HTML_BASE + id + version, AR5IV_HTML_BASE + id];
	let lastStatus = 0;
	let lastError = '';
	for (const target of targets) {
		const abort = new AbortController();
		const timer = setTimeout(() => abort.abort(), PAPER_FETCH_TIMEOUT_MS);
		try {
			const response = await fetch(target, {
				headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
				signal: abort.signal,
			});
			lastStatus = response.status;
			if (!response.ok) continue;
			const html = await response.text();
			if (html.length > PAPER_HTML_MAX_BYTES) return { ok: false, error: 'PAPER_TOO_LARGE' };
			if (html.indexOf('ltx_section') < 0 && html.indexOf('ltx_para') < 0) {
				lastError = 'PAPER_NO_HTML';
				continue;
			}
			return {
				ok: true,
				html,
				source: target.indexOf('ar5iv') >= 0 ? 'ar5iv-html' : 'arxiv-html',
			};
		} catch (error) {
			lastError = messageOf(error);
		} finally {
			clearTimeout(timer);
		}
	}
	if (lastError === 'PAPER_NO_HTML') return { ok: false, error: 'PAPER_NO_HTML' };
	if (lastStatus) return { ok: false, error: 'UPSTREAM_' + String(lastStatus) };
	return { ok: false, error: lastError || 'PAPER_NO_HTML' };
}

/**
 * Decode numeric and the handful of named entities arXiv emits.
 * @param value - raw text.
 * @returns decoded text.
 */
function decodeEntities(value) {
	const codePoint = (code, fallback) => {
		try {
			return String.fromCodePoint(code);
		} catch (error) {
			return fallback;
		}
	};
	return String(value || '')
		.replace(/&#x([0-9a-f]+);/gi, (whole, hex) => codePoint(parseInt(hex, 16), whole))
		.replace(/&#(\d+);/g, (whole, dec) => codePoint(Number(dec), whole))
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&nbsp;/g, ' ');
}

/**
 * Strip LaTeX-MathML duplicates and every tag, then collapse whitespace.
 * The `<annotation>` pass must run first: it holds a second copy of each formula.
 * @param value - HTML fragment.
 * @returns plain text.
 */
function stripPaperMarkup(value) {
	const withoutMath = String(value || '').replace(/<annotation[\s\S]*?<\/annotation>/gi, ' ');
	return decodeEntities(withoutMath.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/**
 * Read the first capture group of a pattern.
 * @param source - text to search.
 * @param pattern - regular expression with one capture group.
 * @returns the captured text, or ''.
 */
function firstMatch(source, pattern) {
	const match = pattern.exec(source);
	return match ? match[1] : '';
}

/**
 * Pull `p.ltx_p` paragraphs out of one section body.
 * @param body - section HTML (heading excluded).
 * @returns paragraph strings, bounded per section and per paragraph.
 */
function extractParagraphs(body) {
	const out = [];
	const pattern = /<p\b[^>]*class="[^"]*ltx_p[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
	let match = pattern.exec(body);
	while (match !== null && out.length < PAPER_SECTION_PARAS_MAX) {
		const text = stripPaperMarkup(match[1]);
		if (text.length >= 20) out.push(text.slice(0, PAPER_PARA_MAX_CHARS));
		match = pattern.exec(body);
	}
	return out;
}

/**
 * Turn one arXiv HTML document into the section list the workbench renders.
 * Only headings and `ltx_p` paragraphs matter; figures, tables and the
 * bibliography are dropped so the reading pane stays prose.
 * @param html - response body.
 * @returns `{ title, sections, truncated }`.
 */
function parsePaperHtml(html) {
	const source = String(html || '')
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<!--[\s\S]*?-->/g, ' ');
	const title =
		stripPaperMarkup(firstMatch(source, /<h1[^>]*class="[^"]*ltx_title_document[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)) ||
		stripPaperMarkup(firstMatch(source, /<title>([\s\S]*?)<\/title>/i)).replace(/^\[?[\d.]+v?\d*\]?\s*/, '');

	const headings = [];
	const headingPattern = /<h([2-4])\b[^>]*class="[^"]*ltx_title[^"]*"[^>]*>([\s\S]*?)<\/h\1>/gi;
	let match = headingPattern.exec(source);
	while (match !== null) {
		const heading = stripPaperMarkup(match[2]);
		if (heading && !/^contents$/i.test(heading)) {
			headings.push({
				start: match.index,
				end: match.index + match[0].length,
				level: Number(match[1]),
				heading,
			});
		}
		match = headingPattern.exec(source);
	}

	const sections = [];
	for (let index = 0; index < headings.length; index += 1) {
		const head = headings[index];
		const stop = index + 1 < headings.length ? headings[index + 1].start : source.length;
		const paragraphs = extractParagraphs(source.slice(head.end, stop));
		if (paragraphs.length === 0) continue;
		sections.push({
			key: 'sec' + String(sections.length + 1),
			heading: head.heading,
			level: head.level,
			paragraphs,
		});
	}

	let abstractText = extractParagraphs(firstMatch(source, /<div[^>]*class="[^"]*ltx_abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/i)).join(' ');
	if (abstractText.length < 80) {
		const marker = source.search(/class="[^"]*ltx_abstract[^"]*"/i);
		if (marker >= 0) {
			const tail = source.slice(marker);
			let cut = tail.length;
			for (const pattern of [/<figure/i, /<section/i, /class="[^"]*ltx_bibliography/i]) {
				const at = tail.search(pattern);
				if (at >= 0 && at < cut) cut = at;
			}
			abstractText = extractParagraphs(tail.slice(0, cut)).join(' ');
		}
	}
	if (abstractText) {
		sections.unshift({ key: 'abstract', heading: 'Abstract', level: 1, paragraphs: [abstractText] });
	}

	let total = 0;
	let truncated = false;
	const bounded = [];
	for (const section of sections) {
		if (total >= PAPER_TEXT_MAX_CHARS) {
			truncated = true;
			break;
		}
		const kept = [];
		for (const paragraph of section.paragraphs) {
			if (total + paragraph.length > PAPER_TEXT_MAX_CHARS) {
				truncated = true;
				break;
			}
			kept.push(paragraph);
			total += paragraph.length;
		}
		if (kept.length > 0) bounded.push({ key: section.key, heading: section.heading, level: section.level, paragraphs: kept });
	}
	return { title, sections: bounded, truncated };
}

/**
 * Answer one full-text request: normalize the id, reuse the disk cache, or
 * fetch + parse + cache. Upstream trouble stays HTTP 200 with `ok:false`.
 * @param req - node HTTP request.
 * @param res - node HTTP response.
 */
async function handlePaperText(req, res) {
	if (req.method !== 'POST') {
		send(res, 405, { ok: false, error: 'HTTP_METHOD' });
		return;
	}
	let payload;
	try {
		payload = JSON.parse(await readBody(req, PAPER_JSON_LIMIT));
	} catch (error) {
		const tooLarge = /body too large/.test(messageOf(error));
		send(res, tooLarge ? 413 : 400, { ok: false, error: tooLarge ? 'BODY_TOO_LARGE' : 'BAD_REQUEST' });
		return;
	}
	const normalized = normalizeArxivId(payload && payload.url);
	if (!normalized.ok) {
		send(res, 400, { ok: false, error: normalized.error });
		return;
	}
	const cached = await readPaperCache(normalized.id);
	if (cached) {
		send(res, 200, { ...cached, cached: true });
		return;
	}
	const fetched = await fetchPaperHtml(normalized.id, normalized.version);
	if (!fetched.ok) {
		send(res, 200, { ok: false, error: fetched.error });
		return;
	}
	const parsed = parsePaperHtml(fetched.html);
	if (parsed.sections.length === 0) {
		send(res, 200, { ok: false, error: 'PAPER_NO_HTML' });
		return;
	}
	const record = {
		ok: true,
		id: normalized.id,
		title: parsed.title || normalized.id,
		source: fetched.source,
		url: 'https://arxiv.org/abs/' + normalized.id,
		sections: parsed.sections,
		truncated: parsed.truncated,
		fetchedAt: Date.now(),
	};
	await writePaperCache(record);
	send(res, 200, { ...record, cached: false });
}

/* ------------------------------------------------------------------------- *
 * Batch ⑤ — PDF import for the workbench.
 *
 * An arXiv HTML build is a luxury: most papers only exist as PDF. The route
 * below turns an uploaded PDF into the same `sections[{heading, paragraphs}]`
 * shape the reader already renders, and caches it next to the HTML cache, so
 * the left pane and the two model routes stay unchanged.
 *
 * Everything here is the text layer only: pdfjs runs in this process, without
 * canvas and without a browser worker, because we never draw a page. A scanned
 * PDF therefore has no text to read, and we say so (`PDF_NO_TEXT`) instead of
 * handing the model unreadable output.
 * ------------------------------------------------------------------------- */

/** The vendored pdfjs build is CommonJS; import it lazily and only once. */
let pdfjsPromise = null;

/**
 * Load the vendored pdfjs legacy build (2.8 MB, never touched at startup).
 * @returns the module namespace.
 */
function loadPdfjs() {
	if (!pdfjsPromise) {
		pdfjsPromise = import(new URL('./vendor/pdf.js', import.meta.url).href);
	}
	return pdfjsPromise;
}

/**
 * Median of a numeric list, ignoring non-positive entries.
 * @param values - candidate numbers.
 * @param fallback - value when nothing usable is present.
 * @returns the median.
 */
function pdfMedian(values, fallback) {
	const kept = (Array.isArray(values) ? values : [])
		.filter((value) => Number.isFinite(value) && value > 0)
		.sort((left, right) => left - right);
	if (kept.length === 0) return fallback;
	return kept[Math.floor(kept.length / 2)];
}

/**
 * Count characters a human can actually read; broken font maps produce
 * replacement characters and control codes, which is how we detect a scan
 * whose "text layer" is garbage.
 * @param text - candidate text.
 * @returns the readable character count.
 */
function pdfReadableChars(text) {
	const source = String(text || '');
	let good = 0;
	for (const char of source) {
		const code = char.codePointAt(0);
		if (code === 9 || code === 10) {
			good += 1;
			continue;
		}
		if (code < 32) continue;
		if (code >= 0x4e00 && code <= 0x9fff) {
			good += 1;
			continue;
		}
		if (/[\p{L}\p{N}\p{P}\p{Zs}]/u.test(char)) good += 1;
	}
	return good;
}

/**
 * Group the text items of one page into visual lines. `hasEOL` is not
 * reliable on its own, so a large vertical jump also starts a new line.
 * @param content - `getTextContent()` result.
 * @param pageNumber - 1-based page index.
 * @returns `[{ text, top, size, page, eol }]`.
 */
function pdfPageLines(content, pageNumber) {
	const items = content && Array.isArray(content.items) ? content.items : [];
	const lines = [];
	let current = null;
	for (const item of items) {
		const str = String((item && item.str) || '');
		if (!str || !str.trim()) continue;
		const transform = Array.isArray(item.transform) ? item.transform : [1, 0, 0, 1, 0, 0];
		const top = Number(transform[5]) || 0;
		const size = Math.abs(Number(item.height) || Number(transform[3]) || 0);
		if (current && !current.eol && Math.abs(current.top - top) <= Math.max(2, size * 0.35)) {
			const glue = current.text.endsWith('-') || /[\u4e00-\u9fff]$/.test(current.text) ? '' : ' ';
			current.text += glue + str;
			current.size = Math.max(current.size, size);
		} else {
			if (current) lines.push(current);
			current = { text: str, top, size, page: pageNumber, eol: false };
		}
		if (item.hasEOL) {
			if (current) lines.push(current);
			current = null;
		}
	}
	if (current) lines.push(current);
	return lines
		.map((line) => ({ ...line, text: line.text.replace(/\s+/g, ' ').trim() }))
		.filter((line) => line.text);
}

/**
 * The body font size: the size carrying the most characters, so headings and
 * captions cannot win the vote.
 * @param lines - page lines.
 * @returns the dominant font size, defaulting to 10.
 */
function pdfBodySize(lines) {
	const weights = new Map();
	for (const line of lines) {
		const key = Math.round(line.size * 2) / 2;
		if (!(key > 0)) continue;
		weights.set(key, (weights.get(key) || 0) + line.text.length);
	}
	let best = 0;
	let bestWeight = 0;
	for (const [size, weight] of weights) {
		if (weight > bestWeight) {
			best = size;
			bestWeight = weight;
		}
	}
	return best || 10;
}

/**
 * Paragraph break threshold: 1.8× the median line gap of the paper.
 * @param lines - page lines.
 * @param bodySize - dominant font size.
 * @returns the vertical gap that starts a new paragraph.
 */
function pdfParagraphGap(lines, bodySize) {
	const gaps = [];
	for (let index = 1; index < lines.length; index += 1) {
		const previous = lines[index - 1];
		const line = lines[index];
		if (previous.page !== line.page) continue;
		const delta = previous.top - line.top;
		if (delta > 0 && delta < bodySize * 4) gaps.push(delta);
	}
	return pdfMedian(gaps, bodySize * 1.35) * PDF_PARA_GAP_RATIO;
}

/** Headings after which the rest of a paper is not reading material. */
const PDF_STOP_HEADING = /^(?:\d+(?:\.\d+)*\s*)?(?:references|bibliography|acknowledg(?:e)?ments?|appendix)\b/i;
/** arXiv's own margin stamp ("arXiv:2501.12948v1 [cs.CL] 22 Jan 2025"). */
const PDF_STAMP_LINE = /^arxiv:\d{4}\.\d{4,5}v?\d*\s*\[/i;
/** Table-of-contents leader dots, which are navigation, not prose. */
const PDF_TOC_LEADER = /(?:\.\s*){4,}\d{1,4}$/;
/** A title broken across lines continues when it ends on a function word. */
const PDF_TITLE_CONTINUES = /(?:\b(?:a|an|the|of|via|with|for|and|or|in|on|at|to|by|from|using|towards?|beyond|under|into|over)\b|[-,:;])$/i;

/**
 * Drop empty sections and renumber the keys so the reader's anchors are stable.
 * @param sections - raw section list.
 * @returns tidy section list.
 */
function pdfTidySections(sections) {
	const kept = [];
	let counter = 0;
	for (const section of Array.isArray(sections) ? sections : []) {
		if (!section || section.paragraphs.length === 0) continue;
		const abstract = /^abstract\b/i.test(section.heading || '');
		if (!abstract) counter += 1;
		kept.push({
			key: abstract ? 'abstract' : 's' + counter,
			heading: section.heading || '',
			level: 2,
			paragraphs: section.paragraphs,
		});
	}
	return kept;
}

/**
 * Rebuild sections and paragraphs from the visual lines of a PDF.
 * @param lines - all page lines, in reading order.
 * @returns `{ sections, truncated }`.
 */
function pdfBuildSections(lines) {
	const bodySize = pdfBodySize(lines);
	const gap = pdfParagraphGap(lines, bodySize);
	const sections = [];
	let current = null;
	let buffer = [];
	let previousTop = null;
	let previousPage = 0;
	let truncated = false;
	let total = 0;
	let suppress = false;
	const flush = () => {
		const joined = buffer.join(' ').replace(/\s+/g, ' ').trim();
		buffer = [];
		if (suppress || !joined) return;
		if (!current) {
			current = { key: 's1', heading: '', level: 2, paragraphs: [] };
			sections.push(current);
		}
		if (current.paragraphs.length >= PAPER_SECTION_PARAS_MAX) return;
		if (total + joined.length > PAPER_TEXT_MAX_CHARS) {
			truncated = true;
			return;
		}
		const bounded = joined.slice(0, PAPER_PARA_MAX_CHARS);
		current.paragraphs.push(bounded);
		total += bounded.length;
	};
	const start = (heading) => {
		flush();
		suppress = /^(?:table of )?contents$/i.test(heading);
		const key = /^abstract\b/i.test(heading) ? 'abstract' : 's' + (sections.length + 1);
		current = { key, heading: heading.slice(0, 200), level: 2, paragraphs: [] };
		sections.push(current);
	};
	for (const line of lines) {
		const text = line.text;
		if (!text) continue;
		if (PDF_STAMP_LINE.test(text) || PDF_TOC_LEADER.test(text)) continue;
		if (line.size >= bodySize * PDF_HEADING_SCALE && text.length <= 120 && !/[.;:,]$/.test(text)) {
			if (PDF_STOP_HEADING.test(text)) {
				flush();
				return { sections, truncated };
			}
			const bare = current && current.paragraphs.length === 0;
			if (bare && current.heading && current.heading.length + text.length <= 200 && PDF_TITLE_CONTINUES.test(current.heading)) {
				current.heading = (current.heading + ' ' + text).trim();
			} else {
				start(text);
			}
			previousTop = line.top;
			previousPage = line.page;
			continue;
		}
		if (previousPage !== line.page) {
			flush();
		} else if (previousTop !== null && previousTop - line.top > gap) {
			flush();
		}
		if (suppress) {
			previousTop = line.top;
			previousPage = line.page;
			continue;
		}
		buffer.push(text);
		previousTop = line.top;
		previousPage = line.page;
	}
	flush();
	return { sections, truncated };
}

/**
 * Turn a PDF buffer into a cacheable record.
 * @param buffer - raw PDF bytes.
 * @param fallbackTitle - filename, used when the PDF carries no title.
 * @returns the record, or `{ ok:false, error }`.
 */
async function extractPdfRecord(buffer, fallbackTitle) {
	let pdfjs;
	try {
		pdfjs = await loadPdfjs();
	} catch (error) {
		return { ok: false, error: 'PDF_PARSE_FAILED' };
	}
	let doc;
	try {
		doc = await pdfjs.getDocument({
			data: new Uint8Array(buffer),
			useSystemFonts: false,
			isEvalSupported: false,
			disableFontFace: true,
		}).promise;
	} catch (error) {
		const message = String((error && error.message) || error || '');
		if (error && (error.name === 'PasswordException' || /password/i.test(message))) {
			return { ok: false, error: 'PDF_ENCRYPTED' };
		}
		return { ok: false, error: 'PDF_PARSE_FAILED' };
	}
	const totalPages = Math.max(0, Math.trunc(Number(doc.numPages) || 0));
	if (totalPages === 0) return { ok: false, error: 'PDF_PARSE_FAILED' };
	const pages = Math.min(totalPages, PDF_PAGE_MAX);
	const lines = [];
	let chars = 0;
	let readable = 0;
	for (let index = 1; index <= pages; index += 1) {
		let page;
		try {
			page = await doc.getPage(index);
		} catch (error) {
			continue;
		}
		const content = await page.getTextContent();
		const rows = pdfPageLines(content, index);
		for (const row of rows) {
			lines.push(row);
			chars += row.text.length;
			readable += pdfReadableChars(row.text);
		}
		if (chars >= PAPER_TEXT_MAX_CHARS) break;
	}
	if (chars < PDF_TEXT_MIN_CHARS || readable / Math.max(1, chars) < PDF_READABLE_MIN) {
		return { ok: false, error: 'PDF_NO_TEXT', pages: totalPages };
	}
	const built = pdfBuildSections(lines);
	if (built.sections.length === 0) return { ok: false, error: 'PDF_NO_TEXT', pages: totalPages };
	let metaTitle = '';
	try {
		const meta = await doc.getMetadata();
		metaTitle = String((meta && meta.info && meta.info.Title) || '').replace(/\s+/g, ' ').trim();
	} catch (error) {
		metaTitle = '';
	}
	const firstHeading = built.sections.length > 0 ? String(built.sections[0].heading || '') : '';
	const headingTitle = firstHeading.length >= 12 && firstHeading.length <= 200 && /\s/.test(firstHeading) && !PDF_STOP_HEADING.test(firstHeading) && !/^(?:abstract|introduction|contents)\b/i.test(firstHeading)
		? firstHeading
		: '';
	const cleanTitle = metaTitle.length >= 4 && metaTitle.length <= 300 && pdfReadableChars(metaTitle) >= metaTitle.length * 0.9
		? metaTitle
		: headingTitle || String(fallbackTitle || '').replace(/\.pdf$/i, '').trim().slice(0, 300);
	if (headingTitle && headingTitle === cleanTitle) {
		built.sections.shift();
	}
	built.sections = pdfTidySections(built.sections);
	if (built.sections.length === 0) return { ok: false, error: 'PDF_NO_TEXT', pages: totalPages };
	const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
	return {
		ok: true,
		id: 'pdf:' + hash,
		kind: 'pdf',
		title: cleanTitle || 'PDF',
		source: 'pdf',
		url: '',
		sections: built.sections,
		truncated: built.truncated || totalPages > pages,
		pages: totalPages,
		chars,
		fetchedAt: Date.now(),
	};
}

/**
 * Serve one PDF request. Import carries `{ name, data, size }`; reopening an
 * already imported paper carries `{ id }` and reads the disk cache.
 * @param req - node HTTP request.
 * @param res - node HTTP response.
 */
async function handlePaperPdf(req, res) {
	if (req.method !== 'POST') {
		send(res, 405, { ok: false, error: 'HTTP_METHOD' });
		return;
	}
	let payload;
	try {
		payload = JSON.parse(await readBody(req, PDF_JSON_LIMIT));
	} catch (error) {
		const tooLarge = /body too large/.test(messageOf(error));
		send(res, tooLarge ? 413 : 400, { ok: false, error: tooLarge ? 'BODY_TOO_LARGE' : 'BAD_REQUEST' });
		return;
	}
	const body = payload && typeof payload === 'object' ? payload : {};
	const wantedId = typeof body.id === 'string' ? body.id.trim() : '';
	if (wantedId) {
		if (!/^pdf:[a-f0-9]{16}$/.test(wantedId)) {
			send(res, 400, { ok: false, error: 'PDF_BAD_INPUT' });
			return;
		}
		const cached = await readPaperCache(wantedId);
		if (!cached) {
			send(res, 200, { ok: false, error: 'PDF_NOT_CACHED', id: wantedId });
			return;
		}
		send(res, 200, { ...cached, cached: true });
		return;
	}
	const data = typeof body.data === 'string' ? body.data : '';
	if (!data) {
		send(res, 400, { ok: false, error: 'PDF_BAD_INPUT' });
		return;
	}
	const declared = Math.trunc(Number(body.size) || 0);
	if (declared > PDF_MAX_BYTES) {
		send(res, 413, { ok: false, error: 'PDF_TOO_LARGE' });
		return;
	}
	const buffer = Buffer.from(data, 'base64');
	if (buffer.length === 0) {
		send(res, 400, { ok: false, error: 'PDF_BAD_INPUT' });
		return;
	}
	if (buffer.length > PDF_MAX_BYTES) {
		send(res, 413, { ok: false, error: 'PDF_TOO_LARGE' });
		return;
	}
	if (buffer.subarray(0, 1024).indexOf('%PDF-') < 0) {
		send(res, 400, { ok: false, error: 'PDF_BAD_INPUT' });
		return;
	}
	const record = await extractPdfRecord(buffer, body.name);
	if (record.ok !== true) {
		send(res, 200, { ok: false, error: record.error, pages: record.pages });
		return;
	}
	const existing = await readPaperCache(record.id);
	if (existing) {
		send(res, 200, { ...existing, cached: true });
		return;
	}
	await writePaperCache(record);
	send(res, 200, { ...record, cached: false });
}

/** Shared voice for every paper explanation: Chinese, terse, no formula syntax. */
const PAPER_SYSTEM_PROMPT = [
	'你是一位计算机方向的中文助教，正在帮中国学生读懂一篇英文学术论文。',
	'只输出中文。不要寒暄，不要复述原文，不要使用表格。',
	'公式一律用文字描述（例如「交叉熵损失」），不要输出 LaTeX。',
	'如果原文信息不足以支撑某个结论，直接说「原文未说明」，不要编造。',
].join('');

/** Hard caps for the per-profile glossary that rides along with every prompt. */
const GLOSSARY_MAX = 40;
const GLOSSARY_SIDE_MAX = 64;

/**
 * Normalize one glossary list (`source=target` or `source：target`, 40 rows).
 * Anything unparseable is dropped rather than guessed, so a typo can never
 * reach the model as a bogus "this English word means X" instruction.
 * @param raw - array of strings from the browser.
 * @returns normalized `['source=target']` rows.
 */
function normalizeGlossary(raw) {
	if (!Array.isArray(raw)) return [];
	const seen = new Set();
	const out = [];
	for (const entry of raw) {
		const text = String(entry == null ? '' : entry).trim();
		if (!text) continue;
		const equal = text.indexOf('=');
		const split = equal >= 0 ? equal : text.indexOf('：');
		if (split <= 0) continue;
		const source = text.slice(0, split).trim().slice(0, GLOSSARY_SIDE_MAX);
		const target = text.slice(split + 1).trim().slice(0, GLOSSARY_SIDE_MAX);
		if (!source || !target) continue;
		const key = source.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(source + '=' + target);
		if (out.length >= GLOSSARY_MAX) break;
	}
	return out;
}

/**
 * Append the student's own term table to the shared system voice. The table is
 * an instruction ("translate it this way"), never a post-hoc text replacement.
 * @param entries - normalized glossary rows.
 * @returns system prompt.
 */
function paperSystemPrompt(entries) {
	const list = normalizeGlossary(entries);
	if (list.length === 0) return PAPER_SYSTEM_PROMPT;
	return (
		PAPER_SYSTEM_PROMPT +
		'\n\n这位学生给了一份自定义术语表，凡遇到左侧英文，必须一律译成右侧中文，不得改用其他译名：\n' +
		list.map((row) => '- ' + row).join('\n')
	);
}

/**
 * Accept both arXiv ids and workbench PDF ids (`pdf:<16 hex>`).
 * @param input - id or URL from the browser.
 * @returns `{ ok: true, id }` or `{ ok: false, error }`.
 */
function resolvePaperId(input) {
	const raw = String(input || '').trim();
	if (/^pdf:[a-f0-9]{16}$/.test(raw)) return { ok: true, id: raw };
	return normalizeArxivId(raw);
}

/** Per-mode generation budget and prompt builder. */
const EXPLAIN_PLANS = {
	guide: {
		maxTokens: 700,
		build(input) {
			const abstract = String(input.abstract || '').slice(0, 2400);
			if (!abstract) return null;
			return (
				'论文标题：' + String(input.title || '').slice(0, 300) + '\n' +
				'摘要：\n' + abstract + '\n\n' +
				'请用 3 到 5 条中文短句写一份导读，每条以「- 」开头，依次覆盖：' +
				'①这篇论文要解决什么问题；②核心方法是什么；③关键结论或最有说服力的结果；④建议的阅读顺序（先看哪一节、为什么）。' +
				'总字数不超过 260 字。'
			);
		},
	},
	section: {
		maxTokens: 1500,
		build(input) {
			const title = '论文标题：' + String(input.title || '').slice(0, 300) + '\n' +
				'本节标题：' + String(input.heading || '未命名小节').slice(0, 200) + '\n';
			const paragraphs = Array.isArray(input.paragraphs)
				? input.paragraphs
					.map((row) => String(row || '').trim())
					.filter((row) => row.length > 0)
					.slice(0, 40)
					.map((row) => row.slice(0, 2000))
				: [];
			/* 逐段对照：段号协议 [n] 中文；段数由前端回传，模型多写少写都只算失败。 */
			if (paragraphs.length > 0) {
				const numbered = paragraphs.map((row, index) => '[' + (index + 1) + '] ' + row).join('\n');
				return (
					title + '本节段落（已按段编号）：\n' + numbered + '\n\n' +
					'任务：把上面每一段英文翻译成中文，逐段对照。\n' +
					'输出格式：每段独占一行，行首必须是「[段号] 」，段号与输入一致，共 ' + paragraphs.length + ' 段，顺序不得打乱。\n' +
					'不要输出任何解释、标题、前言或总结；不要合并段落；不要新增或省略段号。\n' +
					'公式、引用编号、DOI、URL 原样保留；术语表里出现的词必须用给定译名。'
				);
			}
			const body = String(input.text || '').slice(0, 12000);
			if (body.length < 40) return null;
			return (
				title +
				'本节正文：\n' + body + '\n\n' +
				'请输出两块内容：\n' +
				'1) 「讲解」：用中文说明这一节在讲什么、为什么需要它、关键结论是什么（不超过 300 字，可以用短横线分条）；\n' +
				'2) 「术语」：列出本节 3 到 5 个关键英文术语，每行一个，格式为「English — 一句中文解释」。'
			);
		},
	},
	sentence: {
		maxTokens: 500,
		build(input) {
			const body = String(input.text || '').slice(0, 3000);
			if (body.length < 20) return null;
			return (
				'论文标题：' + String(input.title || '').slice(0, 300) + '\n' +
				'所属小节：' + String(input.heading || '未命名小节').slice(0, 200) + '\n' +
				'英文原文段落：\n' + body + '\n\n' +
				'请按三步用中文回答，总字数不超过 300 字：\n' +
				'1) 关键句直译（1 到 2 句）；\n' +
				'2) 这一段在论文论证里起什么作用；\n' +
				'3) 读懂它需要的前置概念（最多 2 个，每个一句）。'
			);
		},
	},
};

/**
 * Start an SSE response. Called only after every validation that can still
 * answer with JSON has passed.
 * @param res - node HTTP response.
 */
function beginSse(res) {
	if (res.headersSent) return;
	res.writeHead(200, {
		'content-type': 'text/event-stream; charset=utf-8',
		'cache-control': 'no-store',
		connection: 'keep-alive',
		'x-accel-buffering': 'no',
	});
	if (typeof res.flushHeaders === 'function') res.flushHeaders();
}

/**
 * Write one SSE frame.
 * @param res - node HTTP response.
 * @param event - frame name (`delta`, `done`, `error`).
 * @param payload - JSON-serializable data.
 */
function sseSend(res, event, payload) {
	if (res.writableEnded) return;
	res.write('event: ' + event + '\ndata: ' + JSON.stringify(payload) + '\n\n');
}

/**
 * Resolve the model selection the user already configured.
 * @param ctx - host context.
 * @returns `{ ok: true, llm, selection }` or `{ ok: false, error }`.
 */
function resolveModel(ctx) {
	const llm = ctx && typeof ctx.get === 'function' ? ctx.get('llm') : undefined;
	const defaults = ctx && typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : undefined;
	if (!llm || !defaults) return { ok: false, error: 'NO_SERVICES' };
	let selection = null;
	try {
		selection = defaults.currentSelection();
	} catch (error) {
		selection = null;
	}
	if (!selection || !selection.provider || !selection.model) return { ok: false, error: 'NO_MODEL' };
	return { ok: true, llm, selection };
}

/**
 * Stream one model turn into an open SSE response, reporting token deltas.
 * @param res - node HTTP response (already in SSE mode).
 * @param llm - llm service.
 * @param selection - provider/model.
 * @param options - `{ system, user, maxTokens, temperature, timeoutMs }`.
 */
async function streamToSse(res, llm, selection, options) {
	const abort = new AbortController();
	const timer = setTimeout(() => abort.abort(), options.timeoutMs);
	res.on('close', () => abort.abort());
	let text = '';
	let failure = '';
	try {
		const stream = llm.stream({
			provider: selection.provider,
			model: selection.model,
			system: options.system,
			messages: [{ role: 'user', content: [{ type: 'text', text: options.user }] }],
			temperature: options.temperature,
			maxTokens: options.maxTokens,
			signal: abort.signal,
		});
		for await (const chunk of stream) {
			if (!chunk) continue;
			if (chunk.type === 'text-delta') {
				text += chunk.text;
				sseSend(res, 'delta', { text: chunk.text });
			} else if (chunk.type === 'finish' && chunk.reason !== undefined && chunk.reason.kind !== 'stop') {
				failure = (chunk.reason.failure && chunk.reason.failure.message) || 'MODEL_' + String(chunk.reason.kind);
			}
		}
	} catch (error) {
		failure = messageOf(error);
	} finally {
		clearTimeout(timer);
	}
	if (failure) sseSend(res, 'error', text ? { error: failure, partial: true } : { error: failure });
	else if (!text.trim()) sseSend(res, 'error', { error: 'EMPTY_RESULT' });
	else sseSend(res, 'done', { model: selection.provider + '/' + selection.model });
	if (!res.writableEnded) res.end();
}

/**
 * Answer one explanation request with a token stream.
 * @param ctx - host context.
 * @param req - node HTTP request.
 * @param res - node HTTP response.
 */
async function handlePaperExplain(ctx, req, res) {
	if (req.method !== 'POST') {
		send(res, 405, { ok: false, error: 'HTTP_METHOD' });
		return;
	}
	let payload;
	try {
		payload = JSON.parse(await readBody(req, PAPER_JSON_LIMIT));
	} catch (error) {
		const tooLarge = /body too large/.test(messageOf(error));
		send(res, tooLarge ? 413 : 400, { ok: false, error: tooLarge ? 'BODY_TOO_LARGE' : 'BAD_REQUEST' });
		return;
	}
	const mode = String((payload && payload.mode) || 'guide');
	const plan = Object.prototype.hasOwnProperty.call(EXPLAIN_PLANS, mode) ? EXPLAIN_PLANS[mode] : null;
	if (!plan) {
		send(res, 400, { ok: false, error: 'BAD_MODE' });
		return;
	}
	const user = plan.build(payload || {});
	if (!user) {
		send(res, 400, { ok: false, error: 'NO_TEXT' });
		return;
	}
	const resolved = resolveModel(ctx);
	if (!resolved.ok) {
		send(res, 503, { ok: false, error: resolved.error });
		return;
	}
	beginSse(res);
	await streamToSse(res, resolved.llm, resolved.selection, {
		system: paperSystemPrompt(payload && payload.glossary),
		user,
		maxTokens: plan.maxTokens,
		temperature: 0.3,
		timeoutMs: EXPLAIN_TIMEOUT_MS,
	});
}

/** Words too common to locate a paragraph; keeps retrieval cheap and sharp. */
const ASK_STOPWORDS = new Set([
	'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'has', 'have', 'had', 'not', 'but',
	'you', 'can', 'could', 'how', 'what', 'why', 'does', 'did', 'which', 'when', 'where', 'about', 'into', 'than',
	'then', 'them', 'they', 'their', 'there', 'these', 'those', 'using', 'used', 'use', 'also', 'such', 'more',
	'most', 'some', 'any', 'all', 'one', 'two', 'we', 'our', 'it', 'its', 'is', 'of', 'in', 'on', 'to', 'as',
	'by', 'at', 'an', 'a', 'be', 'or', 'if', 'so', 'no', 'do', 'vs', 'per', 'via', 'both', 'each', 'other',
]);

/**
 * Tokenize a question into lowercase words plus Chinese bigrams.
 * @param value - question text.
 * @returns search tokens.
 */
function tokenizeQuestion(value) {
	const text = String(value || '').toLowerCase();
	const latin = text
		.split(/[^\p{L}\p{N}]+/u)
		.filter((word) => word.length >= 2 && !ASK_STOPWORDS.has(word));
	const cjk = [];
	const runs = text.match(/[\u4e00-\u9fff]{2,}/g) || [];
	for (const run of runs) {
		for (let index = 0; index + 1 < run.length && index < 24; index += 1) cjk.push(run.slice(index, index + 2));
	}
	const seen = new Set();
	const out = [];
	for (const token of latin.concat(cjk)) {
		if (seen.has(token)) continue;
		seen.add(token);
		out.push(token);
		if (out.length >= 24) break;
	}
	return out;
}

/**
 * Pick the paragraphs most likely to answer a question, by token overlap with
 * a length penalty so a long paragraph cannot win on word count alone.
 * @param record - cached paper record.
 * @param question - the student's question.
 * @param limit - maximum paragraph count.
 * @returns `[{ heading, text }]`, possibly a generic fallback.
 */
function selectPassages(record, question, limit) {
	const tokens = tokenizeQuestion(question);
	const sections = record && Array.isArray(record.sections) ? record.sections : [];
	const scored = [];
	for (const section of sections) {
		const paragraphs = Array.isArray(section.paragraphs) ? section.paragraphs : [];
		for (let order = 0; order < paragraphs.length; order += 1) {
			const paragraph = String(paragraphs[order] || '');
			if (!paragraph.trim()) continue;
			const lower = paragraph.toLowerCase();
			let score = 0;
			for (const token of tokens) {
				let hits = 0;
				let at = lower.indexOf(token);
				while (at >= 0 && hits < 3) {
					hits += 1;
					at = lower.indexOf(token, at + token.length);
				}
				score += hits;
			}
			if (score <= 0) continue;
			scored.push({
				heading: section.heading,
				para: order + 1,
				text: paragraph,
				rank: score * 1000 - Math.min(999, Math.floor(paragraph.length / 20)),
			});
		}
	}
	scored.sort((left, right) => right.rank - left.rank);
	const picked = [];
	let used = 0;
	for (const row of scored) {
		if (picked.length >= limit) break;
		if (used + row.text.length > ASK_CONTEXT_MAX_CHARS) continue;
		picked.push({ heading: row.heading, para: row.para, text: row.text });
		used += row.text.length;
	}
	if (picked.length === 0) {
		const abstract = sections.find((section) => section.key === 'abstract');
		const first = sections.find((section) => section.key !== 'abstract' && section.paragraphs.length > 0);
		if (abstract && abstract.paragraphs[0]) picked.push({ heading: abstract.heading, para: 1, text: abstract.paragraphs[0] });
		if (first) {
			if (first.paragraphs[0]) picked.push({ heading: first.heading, para: 1, text: first.paragraphs[0] });
			if (first.paragraphs[1]) picked.push({ heading: first.heading, para: 2, text: first.paragraphs[1] });
		}
	}
	return picked;
}

/**
 * Answer one grounded question about an already-cached paper with a token stream.
 * @param ctx - host context.
 * @param req - node HTTP request.
 * @param res - node HTTP response.
 */
async function handlePaperAsk(ctx, req, res) {
	if (req.method !== 'POST') {
		send(res, 405, { ok: false, error: 'HTTP_METHOD' });
		return;
	}
	let payload;
	try {
		payload = JSON.parse(await readBody(req, PAPER_JSON_LIMIT));
	} catch (error) {
		const tooLarge = /body too large/.test(messageOf(error));
		send(res, tooLarge ? 413 : 400, { ok: false, error: tooLarge ? 'BODY_TOO_LARGE' : 'BAD_REQUEST' });
		return;
	}
	const question = String((payload && payload.question) || '').trim().slice(0, 2000);
	if (question.length < 2) {
		send(res, 400, { ok: false, error: 'BAD_QUESTION' });
		return;
	}
	const normalized = resolvePaperId((payload && (payload.id || payload.url)) || '');
	if (!normalized.ok) {
		send(res, 400, { ok: false, error: normalized.error });
		return;
	}
	const record = await readPaperCache(normalized.id);
	if (!record) {
		send(res, 200, { ok: false, error: 'NO_PAPER_TEXT' });
		return;
	}
	const resolved = resolveModel(ctx);
	if (!resolved.ok) {
		send(res, 503, { ok: false, error: resolved.error });
		return;
	}
	/* 本节提问：只在这一节的段落里检索；这一节没有正文就明确报错，不悄悄退回全文。 */
	const scope = String((payload && payload.scope) || 'all') === 'section' ? 'section' : 'all';
	const sectionKey = String((payload && payload.sectionKey) || '').trim().slice(0, 200);
	const allSections = Array.isArray(record.sections) ? record.sections : [];
	let scoped = null;
	if (scope === 'section') {
		scoped = allSections.find((section) => section && section.key === sectionKey) || null;
		const rows = scoped && Array.isArray(scoped.paragraphs) ? scoped.paragraphs.filter((row) => String(row || '').trim()) : [];
		if (!scoped || rows.length === 0) {
			send(res, 200, { ok: false, error: 'NO_SECTION_TEXT' });
			return;
		}
	}
	let passages = selectPassages(scoped ? { ...record, sections: [scoped] } : record, question, scope === 'section' ? 4 : 3);
	if (passages.length === 0 && scoped) {
		passages = scoped.paragraphs
			.map((row, index) => ({ heading: scoped.heading, para: index + 1, text: String(row || '') }))
			.filter((row) => row.text.trim())
			.slice(0, 3);
	}
	const history = Array.isArray(payload.history) ? payload.history.slice(-ASK_HISTORY_MAX * 2) : [];
	const lines = ['论文标题：' + String(record.title || record.id).slice(0, 300)];
	lines.push('检索范围：' + (scoped ? '仅当前小节「' + String(scoped.heading || '').slice(0, 120) + '」' : '全文'));
	lines.push('');
	lines.push('相关片段：');
	for (const passage of passages) {
		const where = '§' + String(passage.heading || '').slice(0, 120) + (passage.para ? ' ¶' + passage.para : '');
		lines.push('【' + where + '】' + passage.text.slice(0, 2400));
		lines.push('');
	}
	if (history.length > 0) {
		lines.push('此前对话（仅作语气参考，不作为事实来源）：');
		for (const turn of history) {
			const role = turn && turn.role === 'assistant' ? '助教' : '学生';
			lines.push(role + '：' + String((turn && turn.text) || '').slice(0, 600));
		}
		lines.push('');
	}
	lines.push('问题：' + question);
	lines.push('');
	lines.push(
		'请只依据上面的片段回答：能答就分点答清楚；片段不足时明确说「论文提供的片段中未提及」，' +
			'并说明应该去看哪一节。凡是引用片段里的内容，句末必须标注来源，格式为【§小节标题 ¶段号】，' +
			'段号用片段标签里给出的那个数字，不得自己编造。中文，不超过 350 字。'
	);
	beginSse(res);
	await streamToSse(res, resolved.llm, resolved.selection, {
		system: paperSystemPrompt(payload && payload.glossary),
		user: lines.join('\n'),
		maxTokens: 900,
		temperature: 0.3,
		timeoutMs: EXPLAIN_TIMEOUT_MS,
	});
}

/**
 * Report whether the workbench can reach a model, plus the cache size.
 * @param ctx - host context.
 * @param req - node HTTP request.
 * @param res - node HTTP response.
 */
async function handlePaperStatus(ctx, req, res) {
	if (req.method !== 'GET') {
		send(res, 405, { ok: false, error: 'HTTP_METHOD' });
		return;
	}
	const resolved = resolveModel(ctx);
	const papers = await countCachedPapers();
	if (!resolved.ok) {
		send(res, 200, { ok: true, llm: { available: false, reason: resolved.error }, papers });
		return;
	}
	send(res, 200, {
		ok: true,
		llm: {
			available: true,
			provider: resolved.selection.provider,
			model: resolved.selection.model,
		},
		papers,
	});
}

/**
 * Read the Atom feed arXiv returns into the list the page renders.
 * Rule-level quality gates (summary length, title/abstract duplicates, the
 * hard item cap) are applied here so the browser only consumes accepted rows.
 * @param xml - Atom document text.
 * @param maxItems - requested item cap; clamped to PAPER_LIMIT.
 * @returns compact paper records, newest first as delivered.
 */
function parseAtom(xml, maxItems) {
	const items = [];
	const seenTitles = new Set();
	const seenAbstracts = new Set();
	const cap = Math.min(PAPER_LIMIT, Math.max(1, Math.trunc(Number(maxItems)) || PAPER_LIMIT));
	const chunks = String(xml || '').split('<entry>').slice(1);
	for (const chunk of chunks) {
		if (items.length >= cap) break;
		const body = chunk.split('</entry>')[0];
		const rawId = cleanText(extractTag(body, 'id'));
		const id = rawId.replace(/v\d+$/, '');
		if (!id) continue;
		const authors = [];
		const authorPattern = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
		let match = authorPattern.exec(body);
		while (match && authors.length < 6) {
			authors.push(cleanText(match[1]));
			match = authorPattern.exec(body);
		}
		const primary = /<arxiv:primary_category[^>]*term="([^"]+)"/.exec(body);
		const linkTags = body.match(/<link\b[^>]*>/g) || [];
		const linkHref = (attribute, value) => {
			const pattern = new RegExp('(?:^|\\s)' + attribute + '="' + value + '"');
			for (const tag of linkTags) {
				const href = /href="([^"]+)"/.exec(tag);
				if (href && pattern.test(tag)) return href[1];
			}
			return '';
		};
		const pdf = linkHref('title', 'pdf') || linkHref('type', 'application/pdf');
		const alternate = linkHref('rel', 'alternate');
		const title = cleanText(extractTag(body, 'title'));
		const summary = cleanText(extractTag(body, 'summary'));
		if (summary.length < MIN_SUMMARY_LEN) continue;
		const titleKey = normalizeForDedup(title);
		const abstractKey = normalizeForDedup(summary).slice(0, DEDUP_ABSTRACT_PREFIX);
		if (titleKey && seenTitles.has(titleKey)) continue;
		if (abstractKey && seenAbstracts.has(abstractKey)) continue;
		if (titleKey) seenTitles.add(titleKey);
		if (abstractKey) seenAbstracts.add(abstractKey);
		const category = primary ? primary[1] : '';
		const doi = cleanText(extractPrefixedTag(body, 'arxiv:doi')) || linkHref('title', 'doi');
		const absAt = rawId.indexOf('/abs/');
		const tail = absAt >= 0 ? rawId.slice(absAt + '/abs/'.length) : '';
		items.push({
			id,
			arxivId: tail || id,
			arxivIdBase: id,
			title,
			authors: authors.filter(Boolean),
			published: cleanText(extractTag(body, 'published')).slice(0, 10),
			summary,
			url: alternate || (id.indexOf('http') === 0 ? id : 'https://arxiv.org/abs/' + id),
			pdf,
			category,
			venue: cleanText(extractPrefixedTag(body, 'arxiv:journal_ref')),
			doi,
			doiUrl: doi ? 'https://doi.org/' + doi : '',
			primaryCategory: category,
			comment: cleanText(extractPrefixedTag(body, 'arxiv:comment')),
		});
	}
	return items.slice(0, cap);
}

/**
 * Normalize a string for duplicate detection: lower-case, strip punctuation,
 * collapse whitespace.
 * @param value - any display text.
 * @returns comparison key.
 */
function normalizeForDedup(value) {
	return String(value || '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Read a namespace-prefixed XML element's inner text (`arxiv:` elements).
 * @param xml - element source.
 * @param tag - element name including the prefix.
 * @returns inner text, or an empty string.
 */
function extractPrefixedTag(xml, tag) {
	const match = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>').exec(xml);
	return match ? match[1] : '';
}

/**
 * Read one XML element's inner text.
 * @param xml - element source.
 * @param tag - element name.
 * @returns inner text, or an empty string.
 */
function extractTag(xml, tag) {
	const match = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>').exec(xml);
	return match ? match[1] : '';
}

/**
 * Strip markup, decode the handful of entities arXiv emits, and collapse runs.
 * @param value - raw element text.
 * @returns display text.
 */
function cleanText(value) {
	const decoded = String(value || '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;|&apos;|&#x27;/g, "'")
		.replace(/&nbsp;/g, ' ');
	return decoded.replace(/\s+/g, ' ').trim();
}
