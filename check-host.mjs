/** Scratch checks for the shipped "My Courses" bundle. Not part of the plugin. */
import { rmSync } from 'node:fs';
import { apply, inject, setPaperCacheDir } from './my-courses/index.js';

function fakeRequest(method, body, url) {
	const chunks = body === undefined ? [] : [Buffer.from(body, 'utf8')];
	return {
		method,
		url,
		async *[Symbol.asyncIterator]() {
			for (const chunk of chunks) yield chunk;
		},
	};
}

function fakeResponse() {
	return {
		headersSent: false,
		status: 0,
		headers: {},
		payload: null,
		body: '',
		writableEnded: false,
		writeHead(status, headers) {
			this.status = status;
			this.headersSent = true;
			if (headers) this.headers = { ...headers };
		},
		flushHeaders() {},
		write(chunk) {
			this.body += String(chunk);
			return true;
		},
		end(body) {
			if (body !== undefined) this.body += String(body);
			this.writableEnded = true;
			const type = String(this.headers['content-type'] || '');
			if (type.indexOf('application/json') === 0) {
				try {
					this.payload = JSON.parse(this.body);
				} catch (error) {
					this.payload = null;
				}
			}
		},
		on() {},
	};
}

function makeContext(options) {
	const routes = [];
	const ctx = {
		get(name) {
			if (name === 'webServer') return { register: (route) => { routes.push(route); return () => {}; } };
			if (name === 'llm' && options.llm) return options.llm;
			if (name === 'attachments' && options.attachments) return options.attachments;
			if (name === 'agentDefaultModel' && options.defaults) return options.defaults;
			return undefined;
		},
		effect(callback) {
			callback();
			return () => {};
		},
		logger: { warn() {} },
	};
	return { ctx, routes };
}

async function invoke(route, method, body, url) {
	const res = fakeResponse();
	await route.handler(fakeRequest(method, body, url), res);
	return res;
}

const DATA_URL = 'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01]).toString('base64');

let failures = 0;
function check(label, condition, extra) {
	if (condition) console.log('ok   ' + label);
	else {
		failures += 1;
		console.log('FAIL ' + label + (extra === undefined ? '' : ' — ' + JSON.stringify(extra)));
	}
}

/* 1. Route registration. */
{
	check('inject is the array form Cordis accepts', Array.isArray(inject) && inject.length === 1 && inject[0] === 'webServer', inject);
	const { ctx, routes } = makeContext({});
	apply(ctx);
	check('registers nine routes', routes.length === 9, routes.map((route) => route.path));
	check('extraction route is exact', routes[0] && routes[0].kind === 'exact' && routes[0].path === '/my-courses/extract', routes[0] && routes[0].path);
	check('paper route is exact', routes[1] && routes[1].kind === 'exact' && routes[1].path === '/my-courses/papers', routes[1] && routes[1].path);
	check('news route is exact', routes[2] && routes[2].kind === 'exact' && routes[2].path === '/my-courses/news', routes[2] && routes[2].path);
	check('repo route is exact', routes[3] && routes[3].kind === 'exact' && routes[3].path === '/my-courses/repos', routes[3] && routes[3].path);
	check('paper text route is exact', routes[4] && routes[4].kind === 'exact' && routes[4].path === '/my-courses/paper/text', routes[4] && routes[4].path);
	check('paper explain route is exact', routes[5] && routes[5].kind === 'exact' && routes[5].path === '/my-courses/paper/explain', routes[5] && routes[5].path);
	check('paper ask route is exact', routes[6] && routes[6].kind === 'exact' && routes[6].path === '/my-courses/paper/ask', routes[6] && routes[6].path);
	check('paper status route is exact', routes[7] && routes[7].kind === 'exact' && routes[7].path === '/my-courses/paper/status', routes[7] && routes[7].path);
	check('paper pdf route is exact', routes[8] && routes[8].kind === 'exact' && routes[8].path === '/my-courses/paper/pdf', routes[8] && routes[8].path);
	const extractRoute = routes.find((route) => route.path === '/my-courses/extract');

	/* 2. Wrong method, bad body, missing image. */
	check('GET is refused', (await invoke(extractRoute, 'GET')).status === 405);
	check('bad JSON is refused', (await invoke(extractRoute, 'POST', 'not json')).status === 400);
	check('missing image is refused', (await invoke(extractRoute, 'POST', '{}')).status === 400);

	/* 3. No services. */
	const noServices = await invoke(extractRoute, 'POST', JSON.stringify({ image: DATA_URL }));
	check('missing services answer 503', noServices.status === 503, noServices.payload);

	/* 4. Text-only model. */
	const textOnly = makeContext({
		llm: {
			resolveModelInfo: async () => ({ inputModalities: ['text'] }),
			stream: async function* stream() { throw new Error('must not be called'); },
		},
		attachments: { saveImage: async () => ({ attachmentId: 'a', mediaType: 'image/jpeg', bytes: 1, width: 1, height: 1 }) },
		defaults: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
	});
	apply(textOnly.ctx);
	const noVision = await invoke(textOnly.routes[0], 'POST', JSON.stringify({ image: DATA_URL }));
	check('text-only model reports MODEL_NO_VISION', noVision.payload && noVision.payload.error === 'MODEL_NO_VISION', noVision.payload);

	/* 5. Happy path. */
	const seen = {};
	const happy = makeContext({
		llm: {
			resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }),
			stream: async function* stream(options) {
				seen.options = options;
				yield { type: 'text-delta', index: 0, text: '{"courses":[{"name":"高等数学","room":"A302","day":0,' };
				yield { type: 'text-delta', index: 0, text: '"periods":[1,2]}]}' };
				yield { type: 'finish', reason: { kind: 'stop' } };
			},
		},
		attachments: {
			saveImage: async (input) => {
				seen.image = input;
				return { attachmentId: 'att-1', mediaType: input.mediaType, bytes: input.data.length, width: 2, height: 2 };
			},
		},
		defaults: { currentSelection: () => ({ provider: 'deepseek', model: 'vision-model' }) },
	});
	apply(happy.ctx);
	const happyResult = await invoke(happy.routes[0], 'POST', JSON.stringify({ image: DATA_URL }));
	check('happy path returns ok', happyResult.status === 200 && happyResult.payload && happyResult.payload.ok === true, happyResult.payload);
	check('happy path returns model text', happyResult.payload && happyResult.payload.text.indexOf('courses') >= 0, happyResult.payload && happyResult.payload.text);
	check('image saved with media type', seen.image && seen.image.mediaType === 'image/jpeg' && seen.image.data.length > 0);
	check('image block then text block', seen.options && seen.options.messages[0].content[0].type === 'image' && seen.options.messages[0].content[1].type === 'text', seen.options && seen.options.messages[0].content.map((part) => part.type));
	check('call carries provider/model and signal', seen.options.provider === 'deepseek' && seen.options.model === 'vision-model' && seen.options.signal !== undefined);
	check('call is deterministic', seen.options.temperature === 0);

	/* 6. Provider failure is reported, not thrown. */
	const broken = makeContext({
		llm: {
			resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }),
			stream: async function* stream() {
				yield { type: 'finish', reason: { kind: 'error', failure: { message: 'quota exceeded', code: 'RATE' } } };
			},
		},
		attachments: { saveImage: async () => ({ attachmentId: 'a', mediaType: 'image/jpeg', bytes: 1, width: 1, height: 1 }) },
		defaults: { currentSelection: () => ({ provider: 'p', model: 'm' }) },
	});
	apply(broken.ctx);
	const brokenResult = await invoke(broken.routes[0], 'POST', JSON.stringify({ image: DATA_URL }));
	check('provider failure reports message', brokenResult.status === 200 && brokenResult.payload.ok === false && brokenResult.payload.error === 'quota exceeded', brokenResult.payload);
}

/* 9. Paper feed: arXiv is proxied, parsed, and bounded. */
{
	const { ctx, routes } = makeContext({});
	apply(ctx);
	const papers = routes.find((route) => route.path === '/my-courses/papers');
	const fixture = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<feed xmlns="http://www.w3.org/2005/Atom">',
		'<entry>',
		'<id>http://arxiv.org/abs/2601.00001v2</id>',
		'<title>Large &amp; Small: LLM Agents</title>',
		'<summary>A  study of  agents &lt;tested&gt;. A long enough abstract keeps the quality gate happy: it describes the method, the data, the evaluation protocol, and the measured outcome in enough detail for a reader to decide whether the paper matters.</summary>',
		'<published>2026-10-30T18:00:00Z</published>',
		'<author><name>Ada Lovelace</name></author>',
		'<author><name>Li Hua</name></author>',
		'<arxiv:primary_category term="cs.CL"/>',
		'<arxiv:journal_ref>Journal of Testing 12 (2026) 1-10</arxiv:journal_ref>',
		'<arxiv:doi>10.1234/example</arxiv:doi>',
		'<arxiv:comment>12 pages, 3 figures</arxiv:comment>',
		'<link title="pdf" href="http://arxiv.org/pdf/2601.00001v2"/>',
		'<link rel="alternate" href="http://arxiv.org/abs/2601.00001v2"/>',
		'</entry>',
		'<entry>',
		'<id>http://arxiv.org/abs/2601.00002v1</id>',
		'<title>Second Paper</title>',
		'<summary>Another summary that is long enough to pass the minimum length gate and still be shortened to a two line clamp in the card layout without losing the meaning of the contribution.</summary>',
		'<published>2026-10-29T09:30:00Z</published>',
		'<author><name>Grace Hopper</name></author>',
		'<arxiv:primary_category term="cs.LG"/>',
		'<link href="http://arxiv.org/pdf/2601.00002v1" title="pdf"/>',
		'</entry>',
		'<entry>',
		'<id>http://arxiv.org/abs/2601.00003v1</id>',
		'<title>Too Short To Keep</title>',
		'<summary>Placeholder abstract.</summary>',
		'<published>2026-10-28T09:30:00Z</published>',
		'<author><name>Nobody</name></author>',
		'<arxiv:primary_category term="cs.AI"/>',
		'</entry>',
		'<entry>',
		'<id>http://arxiv.org/abs/2601.00009v1</id>',
		'<title>Large &amp; Small: LLM Agents</title>',
		'<summary>A long enough but duplicated abstract for a second copy of the same title so the duplicate gate drops it before the page ever sees it, keeping the list clean.</summary>',
		'<published>2026-10-27T09:30:00Z</published>',
		'<author><name>Ada Lovelace</name></author>',
		'<arxiv:primary_category term="cs.CL"/>',
		'</entry>',
		'</feed>',
	].join('\n');
	const originalFetch = globalThis.fetch;
	let requested = '';
	globalThis.fetch = async (target) => {
		requested = String(target);
		return { ok: true, status: 200, text: async () => fixture };
	};
	try {
		const result = await invoke(papers, 'GET', undefined, '/my-courses/papers?cats=cs.CL,cs.LG&q=llm%20agent&max=5');
		check('papers answer ok', result.status === 200 && result.payload && result.payload.ok === true, result.payload);
		check('papers parse every entry', result.payload && result.payload.items.length === 2, result.payload && result.payload.items.length);
		check('entities decode and whitespace collapses', result.payload.items[0].title === 'Large & Small: LLM Agents', result.payload.items[0].title);
		check('summary keeps angle brackets', result.payload.items[0].summary.indexOf('A study of agents <tested>.') === 0, result.payload.items[0].summary);
		check('authors captured', result.payload.items[0].authors.length === 2 && result.payload.items[0].authors[1] === 'Li Hua', result.payload.items[0].authors);
		check('id version stripped', result.payload.items[0].id === 'http://arxiv.org/abs/2601.00001', result.payload.items[0].id);
		check('published date sliced', result.payload.items[0].published === '2026-10-30', result.payload.items[0].published);
		check('archive id keeps the version suffix', result.payload.items[0].arxivId === '2601.00001v2', result.payload.items[0].arxivId);
		check('archive id base matches the stripped id', result.payload.items[0].arxivIdBase === 'http://arxiv.org/abs/2601.00001', result.payload.items[0].arxivIdBase);
		check('journal reference becomes the venue', result.payload.items[0].venue === 'Journal of Testing 12 (2026) 1-10', result.payload.items[0].venue);
		check('doi parsed', result.payload.items[0].doi === '10.1234/example', result.payload.items[0].doi);
		check('doi url built', result.payload.items[0].doiUrl === 'https://doi.org/10.1234/example', result.payload.items[0].doiUrl);
		check('primary category kept', result.payload.items[0].primaryCategory === 'cs.CL', result.payload.items[0].primaryCategory);
		check('arxiv comment parsed', result.payload.items[0].comment === '12 pages, 3 figures', result.payload.items[0].comment);
		check('missing venue/doi stay empty strings', result.payload.items[1].venue === '' && result.payload.items[1].doi === '' && result.payload.items[1].comment === '', [result.payload.items[1].venue, result.payload.items[1].doi, result.payload.items[1].comment]);
		check('short abstract is dropped', result.payload.items.every((item) => item.summary.length >= 120));
		check('duplicate title is dropped', result.payload.items.filter((item) => item.title === 'Large & Small: LLM Agents').length === 1);
		check('pdf link kept', result.payload.items[0].pdf === 'http://arxiv.org/pdf/2601.00001v2', result.payload.items[0].pdf);
		check('pdf found whatever the attribute order', result.payload.items[1].pdf === 'http://arxiv.org/pdf/2601.00002v1', result.payload.items[1].pdf);
		check('absent alternate falls back to the entry id', result.payload.items[1].url === 'http://arxiv.org/abs/2601.00002', result.payload.items[1].url);
		check('both filters reach arXiv', requested.includes('cat%3Acs.CL') && requested.includes('all%3A%22llm%22'), requested);
		check('query sorts by submission date', requested.includes('sortBy=submittedDate'));
		check('query respects the cap', requested.includes('max_results=5'));
		const unfiltered = await invoke(papers, 'GET', undefined, '/my-courses/papers');
		const bogus = await invoke(papers, 'GET', undefined, '/my-courses/papers?cats=bogus.XX');
	check('bogus category is refused', bogus.status === 400 && bogus.payload.error === 'BAD_CATEGORY', bogus.payload);
	const mixed = await invoke(papers, 'GET', undefined, '/my-courses/papers?cats=cs.CL,bogus.XX');
	check('one bogus category poisons the batch', mixed.status === 400 && mixed.payload.error === 'BAD_CATEGORY', mixed.payload);
	check('missing filter is refused', unfiltered.status === 400 && unfiltered.payload.error === 'NO_FILTER', unfiltered.payload);
		const post = await invoke(papers, 'POST', '{}', '/my-courses/papers');
		check('POST is refused', post.status === 405);
		const capped = await invoke(papers, 'GET', undefined, '/my-courses/papers?cats=cs.CL&max=1');
		check('result count honours the requested cap', capped.payload.items.length === 1, capped.payload.items.length);
	} finally {
		globalThis.fetch = originalFetch;
	}
}


/* 7. Batch 3 feeds: Hacker News stories and GitHub repositories. */
{
	const { ctx, routes } = makeContext({});
	apply(ctx);
	const news = routes.find((route) => route.path === '/my-courses/news');
	const repos = routes.find((route) => route.path === '/my-courses/repos');

	check('news refuses POST', (await invoke(news, 'POST')).status === 405);
	check('news refuses a missing query', (await invoke(news, 'GET', undefined, '/my-courses/news')).status === 400);
	const blank = await invoke(news, 'GET', undefined, '/my-courses/news?q=%20%20');
	check('news refuses a blank query', blank.status === 400 && blank.payload.error === 'NO_FILTER', blank.payload);

	const originalFetch = globalThis.fetch;
	let seenUrl = '';
	let seenOptions = null;
	try {
		globalThis.fetch = async (target, options) => {
			seenUrl = String(target);
			seenOptions = options || {};
			return {
				ok: true,
				status: 200,
				headers: { get: () => null },
				json: async () => ({
					hits: [
						{ objectID: '11', title: 'LLM agent &amp; tools', url: 'https://example.com/a', created_at_i: 1761800000, points: 250, story_text: '<p>raw <b>html</b></p>' },
						{ objectID: '12', story_title: 'Fallback title', created_at_i: 1761800100, points: 3 },
						{ objectID: '', title: '', url: '' },
						{ objectID: '13', title: 'Comment fallback', url: 'https://example.com/c', created_at: '2026-11-01T00:00:00.000Z', points: 7, comment_text: '<i>only a comment</i>' },
						{ objectID: '', title: 'Ghost id', url: 'https://example.com/ghost', created_at_i: 1761800200 },
					],
				}),
			};
		};
		const before = Math.floor(Date.now() / 1000);
		const newsResult = await invoke(news, 'GET', undefined, '/my-courses/news?q=LLM&max=5');
		const after = Math.floor(Date.now() / 1000);
		check('news answers ok', newsResult.status === 200 && newsResult.payload.ok === true, newsResult.payload);
		check('news keeps the three usable hits', newsResult.payload.items.length === 3, newsResult.payload.items.length);
		check('news decodes entities', newsResult.payload.items[0].title === 'LLM agent & tools', newsResult.payload.items[0].title);
		check('news strips html from the summary', newsResult.payload.items[0].summary === 'raw html', newsResult.payload.items[0].summary);
		check('news converts seconds to milliseconds', newsResult.payload.items[0].publishedAt === 1761800000000, newsResult.payload.items[0].publishedAt);
		check('news keeps the points as heat', newsResult.payload.items[0].hot === 250, newsResult.payload.items[0].hot);
		check('news prefixes the id', newsResult.payload.items[0].id === 'hn:11', newsResult.payload.items[0].id);
		check('news falls back to story_title', newsResult.payload.items[1].title === 'Fallback title', newsResult.payload.items[1].title);
		check('news falls back to the discussion link', newsResult.payload.items[1].url === 'https://news.ycombinator.com/item?id=12', newsResult.payload.items[1].url);
		check('news falls back to created_at when the epoch seconds are missing', newsResult.payload.items[2].publishedAt === Date.parse('2026-11-01T00:00:00.000Z'), newsResult.payload.items[2].publishedAt);
		check('news falls back to comment_text for the summary', newsResult.payload.items[2].summary === 'only a comment', newsResult.payload.items[2].summary);
		check('news drops a hit without an object id', newsResult.payload.items.every((item) => item.id !== 'hn:'), newsResult.payload.items.map((item) => item.id));

		const query = new URL(seenUrl);
		check('news asks for stories', query.searchParams.get('tags') === 'story', seenUrl);
		check('news sends the query text', query.searchParams.get('query') === 'LLM', seenUrl);
		check('news respects the cap', query.searchParams.get('hitsPerPage') === '5', seenUrl);
		const filters = String(query.searchParams.get('numericFilters') || '');
		const since = Number(filters.replace('created_at_i>', ''));
		check('news asks for a 30 day window', filters.indexOf('created_at_i>') === 0 && since >= before - 30 * 86400 - 5 && since <= after - 30 * 86400 + 5, filters);
		check('news sends the shared user agent', String((seenOptions.headers || {})['user-agent'] || '').indexOf('dsh-my-courses/') === 0, seenOptions.headers);

		globalThis.fetch = async () => ({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({}) });
		const upstream = await invoke(news, 'GET', undefined, '/my-courses/news?q=LLM');
		check('news reports an upstream error as 200', upstream.status === 200 && upstream.payload.error === 'HN_503', upstream.payload);

		globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ nope: true }) });
		const shape = await invoke(news, 'GET', undefined, '/my-courses/news?q=LLM');
		check('news reports a bad shape', shape.payload.error === 'HN_SHAPE', shape.payload);

		check('repo feed refuses POST', (await invoke(repos, 'POST')).status === 405);
		const noQuery = await invoke(repos, 'GET', undefined, '/my-courses/repos');
		check('repo feed refuses a missing query', noQuery.status === 400 && noQuery.payload.error === 'NO_FILTER', noQuery.payload);

		globalThis.fetch = async (target, options) => {
			seenUrl = String(target);
			seenOptions = options || {};
			return {
				ok: true,
				status: 200,
				headers: { get: (name) => (name === 'x-ratelimit-remaining' ? '42' : null) },
				json: async () => ({
					items: [
						{ id: 7, full_name: 'acme/agent', html_url: 'https://github.com/acme/agent', description: 'A <b>fast</b> agent', pushed_at: new Date().toISOString(), stargazers_count: 1200, topics: ['llm', 'agents', 'tools', 'extra', 'more'], language: 'Python' },
						{ id: 8, full_name: 'old/repo', html_url: 'https://github.com/old/repo', description: 'old', pushed_at: '2020-01-01T00:00:00Z', stargazers_count: 300, topics: [], language: '' },
						{ id: 9, full_name: '', html_url: '' },
					],
				}),
			};
		};
		const repoResult = await invoke(repos, 'GET', undefined, '/my-courses/repos?q=llm%20agent&max=5');
		check('repo feed answers ok', repoResult.status === 200 && repoResult.payload.ok === true, repoResult.payload);
		check('repo feed keeps only fresh repos', repoResult.payload.items.length === 1, repoResult.payload.items.map((item) => item.title));
		check('repo feed strips html from the description', repoResult.payload.items[0].summary === 'A fast agent', repoResult.payload.items[0].summary);
		check('repo feed caps tags at four with the language first', JSON.stringify(repoResult.payload.items[0].tags) === JSON.stringify(['Python', 'llm', 'agents', 'tools']), repoResult.payload.items[0].tags);
		check('repo feed keeps the stars as heat', repoResult.payload.items[0].hot === 1200, repoResult.payload.items[0].hot);
		check('repo feed prefixes the id', repoResult.payload.items[0].id === 'gh:7', repoResult.payload.items[0].id);

		const repoQuery = new URL(seenUrl);
		check('repo feed filters by stars', repoQuery.searchParams.get('q') === 'llm agent stars:>100', seenUrl);
		check('repo feed sorts by stars', repoQuery.searchParams.get('sort') === 'stars' && repoQuery.searchParams.get('order') === 'desc', seenUrl);
		check('repo feed respects the cap', repoQuery.searchParams.get('per_page') === '5', seenUrl);
		check('repo feed asks for the pinned api version', (seenOptions.headers || {})['x-github-api-version'] === '2022-11-28', seenOptions.headers);
		check('repo feed accepts the json media type', (seenOptions.headers || {}).accept === 'application/vnd.github+json', seenOptions.headers);

		globalThis.fetch = async () => ({ ok: false, status: 403, headers: { get: () => '0' }, json: async () => ({}) });
		const limited = await invoke(repos, 'GET', undefined, '/my-courses/repos?q=llm');
		check('repo feed maps 403 to GITHUB_RATE', limited.status === 200 && limited.payload.error === 'GITHUB_RATE', limited.payload);

		globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: (name) => (name === 'x-ratelimit-remaining' ? '0' : null) }, json: async () => ({ items: [] }) });
		const exhausted = await invoke(repos, 'GET', undefined, '/my-courses/repos?q=llm');
		check('repo feed maps an empty quota to GITHUB_RATE', exhausted.payload.error === 'GITHUB_RATE', exhausted.payload);

		globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => '7' }, json: async () => ({ message: 'nope' }) });
		const repoShape = await invoke(repos, 'GET', undefined, '/my-courses/repos?q=llm');
		check('repo feed reports a bad shape', repoShape.payload.error === 'GITHUB_SHAPE', repoShape.payload);
	} finally {
		globalThis.fetch = originalFetch;
	}
}

/* 7. Paper workbench — full text, parsing, cache, fallback. */
const CACHE_A = '_patch/tmp/b4-cache-a';
const CACHE_B = '_patch/tmp/b4-cache-b';

const PAPER_HTML = [
	'<html><head><title>[2501.00001] A Tiny Paper on Widgets</title></head><body>',
	'<h1 class="ltx_title ltx_title_document">A Tiny Paper on Widgets</h1>',
	'<div id="abstract1" class="ltx_abstract"><h6 class="ltx_title ltx_title_abstract">Abstract</h6>',
	'<p id="abstract1.1" class="ltx_p">We study widgets and show that small widgets beat large widgets in every tested setting.</p></div>',
	'<figure id="S0.F1" class="ltx_figure"><figcaption class="ltx_caption">Figure 1: A widget.</figcaption></figure>',
	'<section id="S1" class="ltx_section"><h2 class="ltx_title ltx_title_section">1 Introduction</h2>',
	'<p id="S1.p1" class="ltx_p">Widgets are everywhere in modern systems, and prior work assumed that bigger widgets always win.</p>',
	'<p id="S1.p2" class="ltx_p">We revisit that assumption with a controlled study of widget sizes.</p></section>',
	'<section id="S2" class="ltx_section"><h2 class="ltx_title ltx_title_section">2 Method</h2>',
	'<p id="S2.p1" class="ltx_p">We train a widget ranker on <math><annotation encoding="application/x-tex">\\alpha=0.5</annotation>0.5</math> tuned data.</p>',
	'<p id="S2.p2" class="ltx_p">' + 'Long paragraph about the ranking objective. '.repeat(140) + '</p></section>',
	'<section id="S3" class="ltx_section"><h2 class="ltx_title ltx_title_section">3 Results</h2>',
	'<p id="S3.p1" class="ltx_p">Small widgets win: accuracy improves by 12 points, a result that depends on the ranking objective.</p></section>',
	'</body></html>',
].join('\n');

function textOf(payload) {
	return (payload && Array.isArray(payload.sections) ? payload.sections : [])
		.flatMap((section) => section.paragraphs)
		.join(' ');
}

{
	rmSync(CACHE_A, { recursive: true, force: true });
	rmSync(CACHE_B, { recursive: true, force: true });
	setPaperCacheDir(CACHE_A);
	const { ctx, routes } = makeContext({});
	apply(ctx);
	const textRoute = routes.find((route) => route.path === '/my-courses/paper/text');
	let fetchLog = [];
	let fetchPlan = () => ({ ok: true, status: 200, text: async () => PAPER_HTML });
	const realFetch = globalThis.fetch;
	globalThis.fetch = async (target) => {
		fetchLog.push(String(target));
		return fetchPlan(String(target));
	};
	try {
		check('paper text refuses GET', (await invoke(textRoute, 'GET')).status === 405);
		const evil = await invoke(textRoute, 'POST', JSON.stringify({ url: 'https://evil.example.com/abs/2501.00001' }));
		check('paper text refuses a foreign host', evil.status === 400 && evil.payload.error === 'BAD_URL', evil.payload);
		const garbage = await invoke(textRoute, 'POST', JSON.stringify({ url: 'not-an-id' }));
		check('paper text refuses a malformed id', garbage.status === 400 && garbage.payload.error === 'BAD_URL', garbage.payload);
		const broken = await invoke(textRoute, 'POST', '{');
		check('paper text refuses broken JSON', broken.status === 400 && broken.payload.error === 'BAD_REQUEST', broken.payload);

		const first = await invoke(textRoute, 'POST', JSON.stringify({ url: 'https://arxiv.org/abs/2501.00001v2' }));
		check('paper text answers ok', first.status === 200 && first.payload.ok === true, first.payload);
		check('paper text fetches the versioned html', fetchLog[0] === 'https://arxiv.org/html/2501.00001v2', fetchLog);
		check('paper text normalizes the id', first.payload.id === '2501.00001', first.payload.id);
		check('paper text keeps the title', first.payload.title === 'A Tiny Paper on Widgets', first.payload.title);
		check('paper text reports the source and abs url',
			first.payload.source === 'arxiv-html' && first.payload.url === 'https://arxiv.org/abs/2501.00001', first.payload.source);
		check('paper text starts with the abstract',
			first.payload.sections[0] && first.payload.sections[0].key === 'abstract' && first.payload.sections[0].heading === 'Abstract',
			first.payload.sections[0] && first.payload.sections[0].key);
		check('paper text keeps section headings in order',
			first.payload.sections.map((section) => section.heading).join('|') === 'Abstract|1 Introduction|2 Method|3 Results',
			first.payload.sections.map((section) => section.heading));
		check('paper text drops figure captions', textOf(first.payload).indexOf('Figure 1') < 0);
		check('paper text drops the latex annotation', textOf(first.payload).indexOf('\\alpha') < 0, textOf(first.payload).slice(0, 120));
		const longest = Math.max(...(first.payload.sections[1].paragraphs.concat(first.payload.sections[2].paragraphs)).map((p) => p.length));
		check('paper text caps one paragraph at 4000 chars', longest === 4000, longest);
		check('paper text is not truncated for a short paper', first.payload.truncated === false, first.payload.truncated);

		const second = await invoke(textRoute, 'POST', JSON.stringify({ url: 'https://arxiv.org/abs/2501.00001v2' }));
		check('paper text reuses the disk cache', second.payload.cached === true && fetchLog.length === 1, fetchLog);

		setPaperCacheDir(CACHE_B);
		fetchPlan = (target) => target.indexOf('ar5iv') >= 0
			? { ok: true, status: 200, text: async () => PAPER_HTML }
			: { ok: false, status: 404, text: async () => '' };
		const fallback = await invoke(textRoute, 'POST', JSON.stringify({ url: '2501.00001' }));
		check('paper text falls back to ar5iv', fallback.payload.ok === true && fallback.payload.source === 'ar5iv-html', fallback.payload.source || fallback.payload.error);
		check('paper text tried arxiv html first', fetchLog[1] === 'https://arxiv.org/html/2501.00001', fetchLog.slice(1));

		setPaperCacheDir(CACHE_B + '-none');
		fetchPlan = () => ({ ok: true, status: 200, text: async () => '<html><body><p>no paper here</p></body></html>' });
		const noHtml = await invoke(textRoute, 'POST', JSON.stringify({ url: '2509.99999' }));
		check('paper text reports missing html as 200', noHtml.status === 200 && noHtml.payload.ok === false && noHtml.payload.error === 'PAPER_NO_HTML', noHtml.payload);

		setPaperCacheDir(CACHE_B + '-down');
		fetchPlan = () => ({ ok: false, status: 503, text: async () => '' });
		const down = await invoke(textRoute, 'POST', JSON.stringify({ url: '2509.99998' }));
		check('paper text maps upstream failure', down.status === 200 && down.payload.error === 'UPSTREAM_503', down.payload);
	} finally {
		globalThis.fetch = realFetch;
	}
}

/* 8. Paper workbench — streamed explanation. */
function parseSse(body) {
	const frames = [];
	for (const block of String(body || '').split('\n\n')) {
		if (!block.trim()) continue;
		let event = '';
		let data = '';
		for (const line of block.split('\n')) {
			if (line.indexOf('event:') === 0) event = line.slice(6).trim();
			else if (line.indexOf('data:') === 0) data += line.slice(5).trim();
		}
		let parsed = data;
		try {
			parsed = JSON.parse(data);
		} catch (error) {
			parsed = data;
		}
		frames.push({ event, data: parsed });
	}
	return frames;
}

function fakeLlm(chunks, calls) {
	return {
		stream(input) {
			calls.push(input);
			return (async function* () {
				for (const chunk of chunks) yield chunk;
			})();
		},
		async resolveModelInfo() {
			return { inputModalities: ['text'] };
		},
	};
}

const DEFAULT_SELECTION = { currentSelection: () => ({ provider: 'test', model: 'fake-1' }) };

{
	const { ctx, routes } = makeContext({});
	apply(ctx);
	const explain = routes.find((route) => route.path === '/my-courses/paper/explain');
	check('paper explain refuses GET', (await invoke(explain, 'GET')).status === 405);
	const badMode = await invoke(explain, 'POST', JSON.stringify({ mode: 'shout', title: 't', abstract: 'a'.repeat(80) }));
	check('paper explain refuses an unknown mode', badMode.status === 400 && badMode.payload.error === 'BAD_MODE', badMode.payload);
	const noText = await invoke(explain, 'POST', JSON.stringify({ mode: 'guide', title: 't' }));
	check('paper explain needs text', noText.status === 400 && noText.payload.error === 'NO_TEXT', noText.payload);

	const bare = await invoke(explain, 'POST', JSON.stringify({ mode: 'guide', title: 't', abstract: 'a'.repeat(80) }));
	check('paper explain reports missing services', bare.status === 503 && bare.payload.error === 'NO_SERVICES', bare.payload);

	const calls = [];
	const okChunks = [
		{ type: 'text-delta', text: '这篇论文' },
		{ type: 'text-delta', text: '研究小部件。' },
		{ type: 'finish', reason: { kind: 'stop' } },
	];
	const wired = makeContext({ llm: fakeLlm(okChunks, calls), defaults: DEFAULT_SELECTION });
	apply(wired.ctx);
	const wiredExplain = wired.routes.find((route) => route.path === '/my-courses/paper/explain');
	const streamed = await invoke(wiredExplain, 'POST', JSON.stringify({ mode: 'guide', title: 'A Tiny Paper', abstract: 'We study widgets.'.repeat(8) }));
	const frames = parseSse(streamed.body);
	check('paper explain answers with sse', streamed.status === 200 && String(streamed.headers['content-type']).indexOf('text/event-stream') === 0, streamed.headers);
	check('paper explain streams two deltas', frames.filter((frame) => frame.event === 'delta').length === 2, frames.map((frame) => frame.event));
	check('paper explain joins the deltas', frames.filter((frame) => frame.event === 'delta').map((frame) => frame.data.text).join('') === '这篇论文研究小部件。');
	check('paper explain ends with done', frames[frames.length - 1].event === 'done' && frames[frames.length - 1].data.model === 'test/fake-1', frames[frames.length - 1]);
	check('paper explain uses the default model', calls[0].provider === 'test' && calls[0].model === 'fake-1', calls[0] && calls[0].model);
	check('paper explain caps guide tokens', calls[0].maxTokens === 700 && calls[0].temperature === 0.3, [calls[0].maxTokens, calls[0].temperature]);
	check('paper explain sends a chinese system voice', /中文/.test(calls[0].system) && calls[0].system.indexOf('LaTeX') >= 0, calls[0].system.slice(0, 40));
	check('paper explain carries the abstract into the prompt', calls[0].messages[0].content[0].text.indexOf('We study widgets.') >= 0);

	const brokenCalls = [];
	const brokenChunks = [
		{ type: 'text-delta', text: '半' },
		{ type: 'finish', reason: { kind: 'error', failure: { message: 'quota gone' } } },
	];
	const broken = makeContext({ llm: fakeLlm(brokenChunks, brokenCalls), defaults: DEFAULT_SELECTION });
	apply(broken.ctx);
	const brokenExplain = broken.routes.find((route) => route.path === '/my-courses/paper/explain');
	const brokenRes = await invoke(brokenExplain, 'POST', JSON.stringify({ mode: 'guide', title: 't', abstract: 'a'.repeat(80) }));
	const brokenFrames = parseSse(brokenRes.body);
	check('paper explain reports a mid-stream failure',
		brokenFrames[brokenFrames.length - 1].event === 'error' && brokenFrames[brokenFrames.length - 1].data.error === 'quota gone',
		brokenFrames[brokenFrames.length - 1]);
	check('paper explain marks the failure as partial', brokenFrames[brokenFrames.length - 1].data.partial === true, brokenFrames[brokenFrames.length - 1].data);
	check('paper explain never ends done after a failure', brokenFrames.every((frame) => frame.event !== 'done'));
}

/* 9. Paper workbench — grounded question and status. */
{
	const calls = [];
	const chunks = [
		{ type: 'text-delta', text: '小部件更小反而更准。' },
		{ type: 'finish', reason: { kind: 'stop' } },
	];
	const wired = makeContext({ llm: fakeLlm(chunks, calls), defaults: DEFAULT_SELECTION });
	apply(wired.ctx);
	const ask = wired.routes.find((route) => route.path === '/my-courses/paper/ask');
	const status = wired.routes.find((route) => route.path === '/my-courses/paper/status');
	setPaperCacheDir(CACHE_B + '-empty');
	const cold = await invoke(ask, 'POST', JSON.stringify({ id: '2501.00001', question: '为什么小部件更好？' }));
	check('paper ask reports a cold cache as 200', cold.status === 200 && cold.payload.ok === false && cold.payload.error === 'NO_PAPER_TEXT', cold.payload);
	const empty = await invoke(ask, 'POST', JSON.stringify({ id: '2501.00001', question: '' }));
	check('paper ask refuses an empty question', empty.status === 400 && empty.payload.error === 'BAD_QUESTION', empty.payload);

	setPaperCacheDir(CACHE_A);
	const answered = await invoke(ask, 'POST', JSON.stringify({ id: '2501.00001', question: 'How does the ranking objective improve accuracy?' }));
	const frames = parseSse(answered.body);
	check('paper ask answers with sse', answered.status === 200 && frames[0].event === 'delta', frames[0] && frames[0].event);
	check('paper ask ends with done', frames[frames.length - 1].event === 'done', frames[frames.length - 1]);
	const prompt = calls[0].messages[0].content[0].text;
	check('paper ask retrieves the matching section', prompt.indexOf('【§3 Results ¶1】') >= 0, prompt.slice(0, 200));
	check('paper ask quotes the retrieved paragraph', prompt.indexOf('accuracy improves by 12 points') >= 0);
	check('paper ask keeps the question in the prompt', prompt.indexOf('ranking objective improve accuracy') >= 0);
	check('paper ask caps the answer tokens', calls[0].maxTokens === 900 && calls[0].temperature === 0.3, [calls[0].maxTokens, calls[0].temperature]);

	const healthy = await invoke(status, 'GET');
	check('paper status reports the model', healthy.status === 200 && healthy.payload.llm.available === true && healthy.payload.llm.model === 'fake-1', healthy.payload);
	check('paper status counts the cached papers', healthy.payload.papers >= 1, healthy.payload.papers);

	const bare = makeContext({});
	apply(bare.ctx);
	const bareStatus = bare.routes.find((route) => route.path === '/my-courses/paper/status');
	const offline = await invoke(bareStatus, 'GET');
	check('paper status reports no model', offline.status === 200 && offline.payload.ok === true && offline.payload.llm.available === false, offline.payload);
	check('paper status refuses POST', (await invoke(bareStatus, 'POST')).status === 405);
}


/* 10. Batch 5 — PDF import (text layer only, no model, no network). */
function makePdf(lines) {
	const esc = (text) => String(text).replace(/[\\()]/g, (char) => '\\' + char);
	const ops = [];
	let y = 720;
	for (const line of lines) {
		if (line === '') {
			y -= 30;
			continue;
		}
		const heading = /^(?:\d (?:Introduction|Method|Results)|References)$/.test(line);
		const title = line === lines[0];
		const size = title ? 17 : heading ? 12.5 : 11;
		const font = title || heading ? '/F2' : '/F1';
		ops.push('BT ' + font + ' ' + size + ' Tf 72 ' + y + ' Td (' + esc(line) + ') Tj ET');
		y -= title ? 26 : heading ? 20 : 15;
	}
	const body = ops.join('\n');
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
		'<< /Length ' + Buffer.byteLength(body, 'latin1') + ' >>\nstream\n' + body + '\nendstream',
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
	];
	let out = '%PDF-1.4\n';
	const offsets = [];
	objects.forEach((entry, index) => {
		offsets.push(Buffer.byteLength(out, 'latin1'));
		out += index + 1 + ' 0 obj\n' + entry + '\nendobj\n';
	});
	const xref = Buffer.byteLength(out, 'latin1');
	out += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
	for (const offset of offsets) out += String(offset).padStart(10, '0') + ' 00000 n \n';
	out += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
	return Buffer.from(out, 'latin1');
}

{
	const CACHE_PDF = '_patch/tmp/b5-pdf-cache';
	rmSync(CACHE_PDF, { recursive: true, force: true });
	setPaperCacheDir(CACHE_PDF);
	// No llm and no attachments in this context: the route must work without either.
	const host = makeContext({});
	apply(host.ctx);
	const route = host.routes.find((entry) => entry.path === '/my-courses/paper/pdf');
	check('pdf route is registered', Boolean(route), host.routes.map((entry) => entry.path));

	const paragraphs = [
		'Reading the Ranking Objective',
		'',
		'1 Introduction',
		'',
		'Learning to rank matters because search results are consumed in order, and a',
		'tiny change near the top of a list changes what a user actually reads. This',
		'short paper re-derives the pairwise ranking objective and explains why the',
		'gradient of a logistic surrogate already encodes the metric we care about.',
		'',
		'Our goal is not a new algorithm but a clear reading path through the classic',
		'derivation, so that a newcomer can follow the algebra without a tutor. Every',
		'step below is checkable with a pencil, and the notation matches the widely',
		'used pairwise framework so the reader can move on to real systems quickly.',
		'',
		'2 Method',
		'',
		'For a query we sample a positive document and a negative document, score both',
		'with the same function, and push their score difference through a logistic',
		'loss. The derivative with respect to the score of the positive document is a',
		'negative constant times the model probability that the pair is ordered',
		'correctly, so misordered pairs receive the larger correction and already',
		'correct pairs fade out as training proceeds.',
		'',
		'3 Results',
		'',
		'On the small benchmark the ranking objective improves accuracy by twelve',
		'points over a pointwise baseline, and the gain survives when we restrict the',
		'comparison to the top ten results, which is the region users actually see.',
		'',
		'References',
		'',
		'[1] A. Author. A classic paper on learning to rank. In Proceedings, 2005.',
		'[2] B. Author. Another classic paper. In Proceedings, 2007.',
	];
	const pdf = makePdf(paragraphs);
	const upload = await invoke(route, 'POST', JSON.stringify({ name: 'reading.pdf', data: pdf.toString('base64'), size: pdf.length }));
	const record = upload.payload || {};
	check('pdf import succeeds without any model', upload.status === 200 && record.ok === true, record.error);
	check('pdf import returns a hashed id', /^pdf:[a-f0-9]{16}$/.test(String(record.id || '')), record.id);
	check('pdf import keeps the first heading as the title', record.title === 'Reading the Ranking Objective', record.title);
	check('pdf import rebuilds sections', Array.isArray(record.sections) && record.sections.length === 3, record.sections && record.sections.map((section) => section.heading));
	check('pdf import rebuilds paragraphs', (record.sections || []).some((section) => (section.paragraphs || []).length >= 2), (record.sections || []).map((section) => (section.paragraphs || []).length));
	check('pdf import drops the empty title section', (record.sections || []).every((section) => String(section.heading).indexOf('Reading the Ranking Objective') !== 0), record.sections && record.sections.map((section) => section.heading));
	const headingText = (record.sections || []).map((section) => String(section.heading)).join('|');
	check('pdf import drops the reference list', headingText.indexOf('References') < 0, headingText);
	check('pdf import reports the page and char counts', record.pages === 1 && Number(record.chars) >= 500, [record.pages, record.chars]);
	check('pdf import is not cached on first sight', record.cached === false, record.cached);

	const again = await invoke(route, 'POST', JSON.stringify({ name: 'copy.pdf', data: pdf.toString('base64'), size: pdf.length }));
	check('pdf import dedupes identical bytes', again.payload && again.payload.id === record.id && again.payload.cached === true, again.payload && [again.payload.id, again.payload.cached]);

	const reopen = await invoke(route, 'POST', JSON.stringify({ id: record.id }));
	check('pdf reopen serves the cached record', reopen.status === 200 && reopen.payload && reopen.payload.ok === true && reopen.payload.cached === true && reopen.payload.sections.length === record.sections.length, reopen.payload && reopen.payload.cached);

	const cold = await invoke(route, 'POST', JSON.stringify({ id: 'pdf:00000000000000ff' }));
	check('pdf reopen reports a cold cache as 200', cold.status === 200 && cold.payload && cold.payload.ok === false && cold.payload.error === 'PDF_NOT_CACHED', cold.payload);

	const badId = await invoke(route, 'POST', JSON.stringify({ id: '2501.00001' }));
	check('pdf reopen rejects a non-pdf id', badId.status === 400 && badId.payload.error === 'PDF_BAD_INPUT', badId.payload);

	const notPdf = await invoke(route, 'POST', JSON.stringify({ name: 'x.pdf', data: Buffer.from('hello world').toString('base64'), size: 11 }));
	check('pdf import rejects bytes without the magic header', notPdf.status === 400 && notPdf.payload.error === 'PDF_BAD_INPUT', notPdf.payload);

	const tooBig = await invoke(route, 'POST', JSON.stringify({ name: 'big.pdf', data: pdf.toString('base64'), size: 9 * 1024 * 1024 }));
	check('pdf import rejects an oversized file', tooBig.status === 413 && tooBig.payload.error === 'PDF_TOO_LARGE', tooBig.payload);

	const scan = makePdf(['Scanned Scan', '', '1 Introduction', '', 'short']);
	const noText = await invoke(route, 'POST', JSON.stringify({ name: 'scan.pdf', data: scan.toString('base64'), size: scan.length }));
	check('pdf import refuses a text-free scan', noText.status === 200 && noText.payload.ok === false && noText.payload.error === 'PDF_NO_TEXT', noText.payload);

	check('pdf route refuses GET', (await invoke(route, 'GET')).status === 405);
}

/* 11. Batch 6 — glossary in the system prompt, per-paragraph alignment,
 * section-scoped ask, and pdf ids accepted without a url. */
{
	setPaperCacheDir(CACHE_A);
	const calls = [];
	const chunks = [
		{ type: 'text-delta', text: '[1] 小部件更小。\n[2] 准确率更高。' },
		{ type: 'finish', reason: { kind: 'stop' } },
	];
	const wired = makeContext({ llm: fakeLlm(chunks, calls), defaults: DEFAULT_SELECTION });
	apply(wired.ctx);
	const explain = wired.routes.find((route) => route.path === '/my-courses/paper/explain');
	const ask = wired.routes.find((route) => route.path === '/my-courses/paper/ask');
	const textRoute = wired.routes.find((route) => route.path === '/my-courses/paper/text');

	const aligned = await invoke(explain, 'POST', JSON.stringify({
		mode: 'section',
		title: 'A Tiny Paper on Widgets',
		heading: '3 Results',
		paragraphs: ['Small widgets win.', 'Accuracy improves by 12 points.'],
		glossary: ['attention=注意力', 'Attention = 注意力', 'widget=小部件'],
	}));
	check('align answers with sse', aligned.status === 200 && String(aligned.headers['content-type']).indexOf('text/event-stream') === 0, aligned.status);
	check('align caps the section budget at 1500', calls[0].maxTokens === 1500 && calls[0].temperature === 0.3, [calls[0].maxTokens, calls[0].temperature]);
	const alignPrompt = calls[0].messages[0].content[0].text;
	check('align numbers every paragraph', alignPrompt.indexOf('[1] Small widgets win.') >= 0 && alignPrompt.indexOf('[2] Accuracy improves by 12 points.') >= 0, alignPrompt.slice(0, 240));
	check('align states the paragraph count', alignPrompt.indexOf('共 2 段') >= 0, alignPrompt.slice(0, 240));
	check('align forbids extra prose', alignPrompt.indexOf('不要输出任何解释') >= 0);
	const alignSystem = calls[0].system;
	check('glossary reaches the system prompt', alignSystem.indexOf('- attention=注意力') >= 0 && alignSystem.indexOf('- widget=小部件') >= 0, alignSystem.slice(-200));
	check('glossary is deduped case-insensitively', (alignSystem.match(/attention=/gi) || []).length === 1, alignSystem.slice(-200));
	check('glossary ordering is preserved', alignSystem.indexOf('- attention=注意力') < alignSystem.indexOf('- widget=小部件'));

	calls.length = 0;
	const noGloss = await invoke(explain, 'POST', JSON.stringify({ mode: 'guide', title: 'T', abstract: 'We study widgets.'.repeat(8) }));
	check('a paper without a glossary still explains', noGloss.status === 200);
	check('an empty glossary leaves the base prompt', calls[0].system.indexOf('术语表') < 0, calls[0].system.slice(-80));

	calls.length = 0;
	const many = await invoke(explain, 'POST', JSON.stringify({
		mode: 'guide',
		title: 'T',
		abstract: 'We study widgets.'.repeat(8),
		glossary: Array.from({ length: 45 }, (unused, index) => 'term' + index + '=译名' + index),
	}));
	check('a huge glossary is capped at 40 entries', many.status === 200 && (calls[0].system.match(/^- /gm) || []).length === 40, (calls[0].system.match(/^- /gm) || []).length);
	check('the glossary never rewrites the user prompt', calls[0].messages[0].content[0].text.indexOf('译名0') < 0);

	const recordRes = await invoke(textRoute, 'POST', JSON.stringify({ url: '2501.00001' }));
	const sections = recordRes.payload && Array.isArray(recordRes.payload.sections) ? recordRes.payload.sections : [];
	const results = sections.find((section) => /Results/.test(section.heading));
	check('the cached paper has a Results section to scope to', Boolean(results), sections.map((section) => section.heading));

	calls.length = 0;
	const scoped = await invoke(ask, 'POST', JSON.stringify({ id: '2501.00001', question: 'How much does accuracy improve?', scope: 'section', sectionKey: results.key }));
	const scopedFrames = parseSse(scoped.body);
	check('a section-scoped ask answers', scoped.status === 200 && scopedFrames[0].event === 'delta', scopedFrames[0] && scopedFrames[0].event);
	const scopedPrompt = calls[0].messages[0].content[0].text;
	check('the section scope is named in the prompt', scopedPrompt.indexOf('检索范围：仅当前小节「3 Results」') >= 0, scopedPrompt.slice(0, 160));
	check('a section scope never leaks another section', scopedPrompt.indexOf('【§1 Introduction') < 0 && scopedPrompt.indexOf('【§2 Method') < 0, scopedPrompt.slice(0, 400));
	check('a section scope labels the paragraph', scopedPrompt.indexOf('【§3 Results ¶1】') >= 0, scopedPrompt.slice(0, 400));

	const missing = await invoke(ask, 'POST', JSON.stringify({ id: '2501.00001', question: 'anything here?', scope: 'section', sectionKey: 'no-such-section' }));
	check('a missing section is an explicit error, not a silent widening', missing.status === 200 && missing.payload && missing.payload.ok === false && missing.payload.error === 'NO_SECTION_TEXT', missing.payload);

	const allScope = await invoke(ask, 'POST', JSON.stringify({ id: '2501.00001', question: 'How much does accuracy improve?', scope: 'all' }));
	check('the all scope still answers', allScope.status === 200 && parseSse(allScope.body)[0].event === 'delta');

	setPaperCacheDir(CACHE_B + '-empty');
	const pdfCold = await invoke(ask, 'POST', JSON.stringify({ id: 'pdf:0123456789abcdef', question: 'what is here?' }));
	check('a pdf id reaches the cache instead of failing validation', pdfCold.status === 200 && pdfCold.payload && pdfCold.payload.error === 'NO_PAPER_TEXT', pdfCold.payload);
	const pdfBad = await invoke(ask, 'POST', JSON.stringify({ id: 'pdf:0123456789ABCDEF', question: 'what is here?' }));
	check('a malformed pdf id is still rejected', pdfBad.status === 400 && pdfBad.payload.error === 'BAD_URL', pdfBad.payload);
	setPaperCacheDir(CACHE_A);
}

console.log(failures === 0 ? '\nHOST OK' : '\nHOST FAILURES: ' + failures);
process.exitCode = failures === 0 ? 0 : 1;
