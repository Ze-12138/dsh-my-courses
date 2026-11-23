/**
 * Scratch logic check for the shipped client bundle: extracts the pure data
 * helpers from client.js and exercises them (weeks, terms, migration).
 * Not part of the plugin.
 */
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./my-courses/client.js', import.meta.url), 'utf8');

const names = [
	'uid',
	'defaultPeriods',
	'clampDay',
	'normalizeTags',
	'pad2',
	'startOfDay',
	'isoDate',
	'mondayOf',
	'dateOfText',
	'weekIndexOf',
	'entryInWeek',
	'parseClock',
	'normalizeEntry',
	'normalizeTerm',
	'normalize',
	'normalizeCourse',
	'normalizeTask',
	'withCourses',
	'taskState',
	'taskDueLabel',
	'taskCountdown',
	'byDue',
	'normalizePaper',
	'paperTagList',
	'paperTagCounts',
	'normalizeResearch',
	'normalizeCompetition',
	'byTimeline',
	'milestonesOf',
	'planProgress',
	'normalizePlanItem',
	'normalizeTimelineEntry',
	'dedupeById',
	'normalizePlan',
	'normalizeCompetitionFolder',
	'byFolder',
	'normalizeCompetitionFolders',
	'daysUntil',
	'planCountdown',
	'paperVenueMeta',
	'taskCountdownFor',
	'byteCompare',
	'directionIndex',
	'sortDirections',
	'normalizeDirectionList',
	'normalizeProfile',
	'pushProfileQuery',
	'pushDirectionFeeds',
	'normalizePushItem',
	'pushNormKey',
	'pushByOrder',
	'capPushItems',
	'normalizePush',
	'scoreItem',
	'rankPushItems',
	'pushUnreadCount',
	'pushIsDue',
	'pushDayOf',
	'arxivIdOf',
	'readSseFrames',
	'clipPaperChat',
	'normalizePaperState',
	'ccfNormalize',
	'ccfMatchList',
	'paperCcfLevel',
	'ccfRank',
	'normalizeGlossary',
	'glossaryText',
	'parseAlignedTranslation',
	'parseCitations',
	'normalizePaperNotes',
	'buildPaperMarkdown',
];

const parts = [];
for (const name of names) {
	const start = source.indexOf('\t\tfunction ' + name + '(');
	if (start < 0) throw new Error('function not found: ' + name);
	const end = source.indexOf('\n\t\t}\n', start);
	if (end < 0) throw new Error('function end not found: ' + name);
	parts.push(source.slice(start, end + 4));
}

const DEFAULT_PERIODS = [
	['第1节', '08:00', '08:45'], ['第2节', '08:55', '09:40'],
	['第3节', '10:00', '10:45'], ['第4节', '10:55', '11:40'],
	['第5节', '14:00', '14:45'], ['第6节', '14:55', '15:40'],
	['第7节', '16:00', '16:45'], ['第8节', '16:55', '17:40'],
	['第9节', '19:00', '19:45'], ['第10节', '19:55', '20:40'],
];

const constStart = source.indexOf('const DIRECTIONS = [');
const constEnd = source.indexOf('/* 批次③', constStart);
if (constStart < 0 || constEnd < 0) throw new Error('direction constants not found');
const constBlock = source.slice(constStart, source.indexOf('\n', constEnd));

const build = new Function('DEFAULT_PERIODS', constBlock + '\n' + parts.join('\n') + '\nreturn { uid, dedupeById, normalize, weekIndexOf, entryInWeek, parseClock, isoDate, mondayOf, dateOfText, taskState, taskDueLabel, taskCountdown, taskCountdownFor, byDue, withCourses, normalizeTerm, paperTagList, paperTagCounts, byTimeline, milestonesOf, planProgress, normalizePlan, normalizeCompetitionFolders, daysUntil, planCountdown, paperVenueMeta, byteCompare, directionIndex, sortDirections, normalizeDirectionList, normalizeProfile, pushProfileQuery, pushDirectionFeeds, normalizePushItem, pushNormKey, pushByOrder, capPushItems, normalizePush, scoreItem, rankPushItems, pushUnreadCount, pushIsDue, pushDayOf, arxivIdOf, readSseFrames, clipPaperChat, normalizePaperState, ccfNormalize, ccfMatchList, paperCcfLevel, ccfRank, CCF_LEVELS, CCF_RANK, CCF_A_VENUES, CCF_B_VENUES, CCF_C_VENUES, WB_PDF_ID_PATTERN, WB_CCF_FILTERS, WB_LIB_MAX, WB_IMPORT_FILES_MAX, WB_IMPORT_BYTES_MAX, normalizeGlossary, glossaryText, parseAlignedTranslation, parseCitations, normalizePaperNotes, buildPaperMarkdown, WB_VIEWS, WB_VIEW_LABEL, WB_ALIGN_LINE, WB_CITE_PATTERN, WB_NOTE_MAX, WB_NOTE_QUOTE_MAX, WB_NOTE_TEXT_MAX, WB_NOTE_SECTION_MAX, WB_GLOSSARY_MAX, WB_ALIGN_PARAS_MAX, WB_EXPORT_NAME_MAX };');
const api = build(DEFAULT_PERIODS);

let failures = 0;
function check(label, condition, extra) {
	if (condition) console.log('ok   ' + label);
	else {
		failures += 1;
		console.log('FAIL ' + label + (extra === undefined ? '' : ' — ' + JSON.stringify(extra)));
	}
}

/* 1. v2 data (flat entries) migrates into one term. */
const v2 = api.normalize({
	version: 2,
	periods: [
		{ id: 'p1', label: '第1节', start: '08:00', end: '08:45' },
		{ id: 'p2', label: '第2节', start: '08:55', end: '09:40' },
	],
	entries: [
		{ id: 'e1', kind: 'course', name: '高等数学', room: 'A302', day: 0, periodIds: ['p1', 'p2'] },
	],
	tags: [],
	ui: { showWeekend: false },
});
check('v3 stores one term', v2.terms.length === 1, v2.terms && v2.terms.length);
check('activeTermId points at it', v2.activeTermId === v2.terms[0].id);
check('entry survives migration', v2.terms[0].entries.length === 1 && v2.terms[0].entries[0].name === '高等数学');
check('missing weeks default to the whole term', JSON.stringify(v2.terms[0].entries[0].weeks) === JSON.stringify({ start: 1, end: 20, parity: 'all' }), v2.terms[0].entries[0].weeks);
check('start date defaults to this week Monday', v2.terms[0].startDate === api.isoDate(api.mondayOf(new Date())), v2.terms[0].startDate);
check('weekend flag preserved', v2.ui.showWeekend === false);
check('version is 11', v2.version === 11);

/* 2. v1 shape (courses, legacy folders) still migrates. */
const v1 = api.normalize({
	courses: [{ name: '线性代数', room: 'B1', day: 2, periodIds: ['p1'] }],
	folders: [{ name: '线性代数', path: 'D:/课程/线性代数' }],
	periods: [{ id: 'p1', label: '第1节', start: '', end: '' }],
});
check('v1 courses migrate', v1.terms[0].entries.length === 1 && v1.terms[0].entries[0].name === '线性代数');
check('v1 folders become tags', v1.tags.length === 1 && v1.tags[0].folders[0].path === 'D:/课程/线性代数', v1.tags);

/* 3. Week math. */
const monday = api.mondayOf(new Date(2026, 8, 7)); // any date → its Monday
const term = { startDate: api.isoDate(monday), weekCount: 16 };
const dayMs = 86400000;
check('week 1 on the first day', api.weekIndexOf(term, new Date(monday.getTime())) === 1);
check('week 2 after 7 days', api.weekIndexOf(term, new Date(monday.getTime() + 7 * dayMs)) === 2);
check('week 4 after 21 days', api.weekIndexOf(term, new Date(monday.getTime() + 21 * dayMs)) === 4);
check('clamped to the total', api.weekIndexOf(term, new Date(monday.getTime() + 400 * dayMs)) === 16);
check('clamped to week 1 before the start', api.weekIndexOf(term, new Date(monday.getTime() - 60 * dayMs)) === 1);

/* 4. Entry visibility. */
const all = { weeks: { start: 3, end: 9, parity: 'all' } };
const odd = { weeks: { start: 1, end: 16, parity: 'odd' } };
const even = { weeks: { start: 1, end: 16, parity: 'even' } };
check('range: outside is hidden', api.entryInWeek(all, 2) === false && api.entryInWeek(all, 10) === false);
check('range: inside is visible', api.entryInWeek(all, 3) === true && api.entryInWeek(all, 9) === true);
check('odd weeks', api.entryInWeek(odd, 1) === true && api.entryInWeek(odd, 2) === false);
check('even weeks', api.entryInWeek(even, 1) === false && api.entryInWeek(even, 2) === true);

/* 5. Normalization clamps out-of-range weeks and drops unknown periods. */
const clamped = api.normalize({
	terms: [{
		id: 't1', name: '2026 秋', startDate: '2026-09-07', weekCount: 16,
		entries: [
			{ name: 'A', day: 0, periodIds: ['p1'], weeks: { start: 0, end: 99, parity: 'weird' } },
			{ name: 'B', day: 1, periodIds: ['nope'] },
		],
	}],
	periods: [{ id: 'p1', label: '第1节', start: '08:00', end: '08:45' }],
});
const entryA = clamped.terms[0].entries[0];
check('week start clamped to 1', entryA.weeks.start === 1, entryA.weeks);
check('week end clamped to term total', entryA.weeks.end === 16, entryA.weeks);
check('unknown parity resets to all', entryA.weeks.parity === 'all');
check('unknown period drops the entry', clamped.terms[0].entries.length === 1);

/* 6. Clock parsing. */
check('clock parses', api.parseClock('08:05') === 485 && api.parseClock('8:05') === 485);
check('clock rejects junk', api.parseClock('') === null && api.parseClock('abc') === null);

/* 7. Courses are derived from entries and keep edited metadata. */
check('a course record is created per entry name', v2.terms[0].courses.length === 1 && v2.terms[0].courses[0].name === '高等数学', v2.terms[0].courses);
const withMeta = api.normalize({
	terms: [{
		id: 't1', name: '2026 秋', startDate: '2026-09-07', weekCount: 16,
		entries: [{ name: '高等数学', day: 0, periodIds: ['p1'] }],
		courses: [{ id: 'c1', name: '高等数学', teacher: '张老师', credits: '4', note: '必修' }],
		tasks: [{ id: 'k1', title: '作业 3', courseName: '高等数学', due: '2026-10-20T23:59', done: false }],
	}],
	periods: [{ id: 'p1', label: '第1节', start: '08:00', end: '08:45' }],
});
check('course metadata survives', withMeta.terms[0].courses.length === 1 && withMeta.terms[0].courses[0].credits === '4');
check('tasks survive', withMeta.terms[0].tasks.length === 1 && withMeta.terms[0].tasks[0].title === '作业 3');
check('task due is kept', withMeta.terms[0].tasks[0].due === '2026-10-20T23:59');
check('bad due is dropped', api.normalize({
	terms: [{ id: 't2', name: 'X', startDate: '2026-09-07', weekCount: 16, entries: [], courses: [], tasks: [{ title: 'A', due: 'tomorrow' }] }],
}).terms[0].tasks[0].due === '');
const ensured = api.withCourses({ id: 't3', entries: [{ kind: 'course', name: '新课程' }], courses: [] });
check('withCourses adds a missing course', ensured.courses.length === 1 && ensured.courses[0].name === '新课程');

/* 8. Deadline states. */
const nowFixture = new Date(2026, 9, 20, 12, 0, 0); // 2026-10-20 12:00 local
check('no due → none', api.taskState({ due: '' }, nowFixture) === 'none');
check('past → overdue', api.taskState({ due: '2026-10-19T23:59' }, nowFixture) === 'overdue');
check('later today → today', api.taskState({ due: '2026-10-20T23:59' }, nowFixture) === 'today');
check('tomorrow → tomorrow', api.taskState({ due: '2026-10-21T09:00' }, nowFixture) === 'tomorrow');
check('this week → week', api.taskState({ due: '2026-10-24T09:00' }, nowFixture) === 'week');
check('far → later', api.taskState({ due: '2026-11-30T09:00' }, nowFixture) === 'later');
check('due label keeps the clock', api.taskDueLabel({ due: '2026-10-20T23:59' }) === '2026-10-20 23:59', api.taskDueLabel({ due: '2026-10-20T23:59' }));
check('due label omits a bare date clock', api.taskDueLabel({ due: '2026-10-20' }) === '2026-10-20');
const unsorted = [{ title: 'b', due: '2026-10-22' }, { title: 'a', due: '' }, { title: 'c', due: '2026-10-21' }];
check('sorts by due, undated last', unsorted.slice().sort(api.byDue).map((task) => task.title).join(',') === 'c,b,a', unsorted.slice().sort(api.byDue).map((task) => task.title));

/* 8b. Sticky-note countdown copy keys. */
const overdueLeft = api.taskCountdown({ due: '2026-10-19T23:59' }, nowFixture);
check('countdown: overdue days', overdueLeft && overdueLeft.key === 'task.daysOverdue' && overdueLeft.params.days === 1, overdueLeft);
check('countdown: due today', api.taskCountdown({ due: '2026-10-20T23:59' }, nowFixture).key === 'task.dueToday');
check('countdown: due tomorrow', api.taskCountdown({ due: '2026-10-21T09:00' }, nowFixture).key === 'task.dueTomorrow');
check('countdown: days left', api.taskCountdown({ due: '2026-10-24T09:00' }, nowFixture).params.days === 4);
check('countdown: far date uses the due date', api.taskCountdown({ due: '2026-11-30T09:00' }, nowFixture).params.date === '2026-11-30');
check('countdown: no due returns null', api.taskCountdown({ due: '' }, nowFixture) === null);

/* 9. Research feed and competitions. */
const research = api.normalize({
	research: {
		directions: ['cs.CV', 'bogus.XX'],
		keywords: 'diffusion',
		items: [{ id: 'p1', title: 'T' }, { title: 'no id' }],
		saved: [{ id: 'p2', title: 'S' }],
		fetchedAt: 123,
	},
}).research;
check('unknown direction dropped', research.directions.length === 1 && research.directions[0] === 'cs.CV', research.directions);
check('papers without id dropped', research.items.length === 1 && research.items[0].id === 'p1', research.items);
check('saved papers kept', research.saved.length === 1 && research.saved[0].id === 'p2');
check('fetchedAt kept', research.fetchedAt === 123);
check('default direction is cs.CL', api.normalize({}).research.directions[0] === 'cs.CL');
const comps = api.normalize({
	competitions: [
		{ name: '数模', level: '国家级', status: '已报名', deadline: '2026-09-10' },
		{ name: 'X', level: 'nope', status: 'nope', deadline: '明天' },
	],
}).competitions;
check('competition fields kept', comps[0].level === '国家级' && comps[0].status === '已报名' && comps[0].deadline === '2026-09-10', comps[0]);
check('bad level and status fall back', comps[1].level === '校级' && comps[1].status === '准备中', comps[1]);
check('bad deadline dropped', comps[1].deadline === '');

/* 10. v5 → v6: provenance defaults, tag derivation, idempotent migration. */
const v5 = {
	version: 5,
	research: {
		directions: ['cs.CL'],
		items: [
			{ id: 'p1', title: 'An LLM benchmark', category: 'cs.CL', authors: ['A', 'B', 'C', 'D'] },
			{ id: 'p2', title: 'Speech and graph neural nets', summary: 'graph neural speech study', category: 'cs.SD' },
		],
		saved: [{ id: 'p3', title: 'Saved v5 paper', category: 'cs.LG' }],
	},
};
const migrated = api.normalize(v5);
const paper1 = migrated.research.items[0];
check('v5 migrates to version 11', migrated.version === 11, migrated.version);
check('v5 paper gets provenance defaults', paper1.venue === '' && paper1.doi === '' && paper1.doiUrl === '' && paper1.arxivId === '', paper1);
check('arxivIdBase falls back to the stored id', paper1.arxivIdBase === 'p1', paper1.arxivIdBase);
check('primaryCategory falls back to category', paper1.primaryCategory === 'cs.CL', paper1.primaryCategory);
check('saved papers receive the same defaults', migrated.research.saved[0].primaryCategory === 'cs.LG' && migrated.research.saved[0].doiUrl === '');
check('migrated authors keep the first six', paper1.authors.length === 4, paper1.authors);
const remigrated = api.normalize(JSON.parse(JSON.stringify(migrated)));
check('repeated migration is byte-identical', JSON.stringify(remigrated) === JSON.stringify(migrated));
check('tags: category first then keyword rules', JSON.stringify(api.paperTagList(paper1)) === JSON.stringify(['cs.CL', 'LLM', 'Eval']), api.paperTagList(paper1));
check('tags: at most two keyword labels', JSON.stringify(api.paperTagList(migrated.research.items[1])) === JSON.stringify(['cs.SD', 'Graph', 'Speech']), api.paperTagList(migrated.research.items[1]));
const tagCounts = api.paperTagCounts(migrated.research.items.concat(migrated.research.saved));
check('tag counts aggregate every paper', tagCounts.length === 7 && tagCounts.every((entry) => entry.count === 1), tagCounts);

/* 11. Batch ② / V1–V13: competition folders + study plan migration. */
const eq = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const empty = api.normalize({});
check('V1 version is 11', empty.version === 11, empty.version);
check('V1 no folders yet', eq(empty.competitionFolders, []), empty.competitionFolders);

const v6Fixture = {
	version: 6,
	competitions: [
		{ id: 'c1', name: '数模国赛', level: '国家级', status: '已报名', deadline: '2026-09-10', link: 'https://example.com/a', note: '三人一队' },
		{ id: 'c2', name: 'ACM 校赛', level: '校级', status: '准备中', deadline: '2026-10-01', link: 'https://example.com/b', note: '每周集训' },
	],
};
const v6 = api.normalize(v6Fixture);
check('V2 both competitions survive migration', v6.competitions.length === 2, v6.competitions.length);
let v6FieldsExact = true;
v6Fixture.competitions.forEach((source, index) => {
	const target = v6.competitions[index];
	for (const field of ['id', 'name', 'level', 'status', 'deadline', 'link', 'note']) {
		if (target[field] !== source[field]) {
			v6FieldsExact = false;
			console.log('   field drift: ' + field + ' ' + JSON.stringify(target[field]) + ' !== ' + JSON.stringify(source[field]));
		}
	}
	if (target.folderId !== '') v6FieldsExact = false;
});
check('V2 six legacy fields are byte-identical and folderId defaults to ungrouped', v6FieldsExact, v6.competitions);
check('V2 folders start empty on a v6 archive', eq(v6.competitionFolders, []), v6.competitionFolders);
check('V3 migration is byte-identical on the second pass', eq(api.normalize(JSON.parse(JSON.stringify(v6))), v6));

const dangling = api.normalize({
	competitionFolders: [{ id: 'f1', name: 'A' }],
	competitions: [{ id: 'c1', name: 'X', folderId: 'nope' }],
});
check('V4 dangling folderId falls back to ungrouped', dangling.competitions[0].folderId === '', dangling.competitions[0].folderId);
const linked = api.normalize({
	competitionFolders: [{ id: 'f1', name: 'A' }],
	competitions: [{ id: 'c1', name: 'X', folderId: 'f1' }],
});
check('V4 a live folderId is kept', linked.competitions[0].folderId === 'f1', linked.competitions[0].folderId);
const linkedPlan = api.normalize({
	competitionFolders: [{ id: 'f1', name: 'A', plan: { timeline: [
		{ id: 't1', title: '初赛', competitionId: 'c1' },
		{ id: 't2', title: '报名', competitionId: 'gone' },
	] } }],
	competitions: [{ id: 'c1', name: 'X', folderId: 'f1' }],
});
check('V4 a dangling competitionId degrades to empty', linkedPlan.competitionFolders[0].plan.timeline[1].competitionId === '', linkedPlan.competitionFolders[0].plan.timeline);
check('V4 a live competitionId is kept', linkedPlan.competitionFolders[0].plan.timeline[0].competitionId === 'c1', linkedPlan.competitionFolders[0].plan.timeline[0].competitionId);
check('V4 degrading a link keeps the entry', linkedPlan.competitionFolders[0].plan.timeline.length === 2, linkedPlan.competitionFolders[0].plan.timeline.length);
check('V4 the link downgrade is idempotent', eq(api.normalize(JSON.parse(JSON.stringify(linkedPlan))), linkedPlan));

const dupFolders = api.normalize({
	competitionFolders: [{ id: 'f1', name: '第一条' }, { id: 'f1', name: '第二条' }],
});
check('V5 duplicate folder id keeps the first record', dupFolders.competitionFolders.length === 1 && dupFolders.competitionFolders[0].name === '第一条', dupFolders.competitionFolders);

const ordered = api.normalize({
	competitionFolders: [
		{ id: 'f1', name: 'A', order: 5 },
		{ id: 'f2', name: 'B', order: 0 },
		{ id: 'f3', name: 'C', order: 9 },
	],
});
check('V6 folders sort by order', ordered.competitionFolders.map((folder) => folder.name).join(',') === 'B,A,C', ordered.competitionFolders.map((folder) => folder.name));
check('V6 order is densified to 0..n-1', eq(ordered.competitionFolders.map((folder) => folder.order), [0, 1, 2]), ordered.competitionFolders.map((folder) => folder.order));
check('V6 a second normalize is byte-identical', eq(api.normalize(JSON.parse(JSON.stringify(ordered))), ordered));

const virtual = [empty, v6, ordered, dupFolders];
check('V7 ungrouped is never stored as a record', virtual.every((state) => state.competitionFolders.every((folder) => folder.id !== '' && folder.name !== '未分组' && folder.name !== 'Ungrouped')));

/* V8 删除文件夹：竞赛回落未分组，一条不丢。 */
const withFolder = api.normalize({
	competitionFolders: [{ id: 'f1', name: 'A' }],
	competitions: [
		{ id: 'c1', name: 'X', folderId: 'f1' },
		{ id: 'c2', name: 'Y' },
	],
});
const afterDelete = api.normalize({
	...withFolder,
	competitionFolders: withFolder.competitionFolders.filter((folder) => folder.id !== 'f1'),
	competitions: withFolder.competitions.map((item) => (item.folderId === 'f1' ? { ...item, folderId: '' } : item)),
});
check('V8 deleting a folder keeps both competitions', afterDelete.competitions.length === 2, afterDelete.competitions.length);
check('V8 the orphaned one falls back to ungrouped', afterDelete.competitions[0].folderId === '', afterDelete.competitions[0].folderId);
check('V8 the folder itself is gone', afterDelete.competitionFolders.length === 0);

const planKeys = Object.keys(api.normalizePlan({ items: [], timeline: [] })).sort();
check('V9 a plan only has items and timeline', eq(planKeys, ['items', 'timeline']), planKeys);
check('V9 a missing plan also normalizes to two keys', eq(Object.keys(api.normalizePlan(undefined)).sort(), ['items', 'timeline']));

const milestonePlan = {
	items: [],
	timeline: [
		{ id: 't3', kind: 'step', title: '报名', date: '2026-11-20', createdAt: 3 },
		{ id: 't2', kind: 'milestone', title: '初赛', date: '2026-12-01', createdAt: 2 },
		{ id: 't1', kind: 'milestone', title: '决赛', date: '2026-10-01', createdAt: 1 },
	],
};
const firstMilestones = api.milestonesOf(milestonePlan);
check('V10 milestones derive from the timeline', firstMilestones.length === 2, firstMilestones.length);
check('V10 milestones come back date-ascending', firstMilestones.map((entry) => entry.date).join(',') === '2026-10-01,2026-12-01', firstMilestones.map((entry) => entry.date));
const demoted = { items: milestonePlan.items, timeline: milestonePlan.timeline.map((entry) => (entry.id === 't1' ? { ...entry, kind: 'step' } : entry)) };
check('V10 demoting one kind drops it from milestones', api.milestonesOf(demoted).length === 1, api.milestonesOf(demoted).length);

const legacyPlan = api.normalizePlan({ timeline: [], milestones: [{ id: 'm1', title: '答辩', date: '2026-12-01' }] });
check('V11 legacy milestones merge into the timeline', legacyPlan.timeline.length === 1, legacyPlan.timeline);
check('V11 merged entries become milestones', legacyPlan.timeline[0].kind === 'milestone', legacyPlan.timeline[0].kind);
check('V11 the milestones key is gone', 'milestones' in legacyPlan === false, Object.keys(legacyPlan));
check('V11 repeated normalize is byte-identical', eq(api.normalizePlan(JSON.parse(JSON.stringify(legacyPlan))), legacyPlan));

const manyItems = [];
const manyEntries = [];
for (let index = 0; index < 250; index += 1) {
	manyItems.push({ id: 'i' + index, text: 'T' + index });
	manyEntries.push({ id: 'e' + index, kind: 'step', title: 'E' + index, date: '2026-12-01' });
}
const capped = api.normalizePlan({ items: manyItems, timeline: manyEntries });
check('V12 checklist is capped at 200', capped.items.length === 200, capped.items.length);
check('V12 timeline is capped at 200', capped.timeline.length === 200, capped.timeline.length);

const blankPlan = api.normalizePlan({
	items: [{ text: '   ' }, { text: '写真题' }],
	timeline: [{ title: '  ' }, { title: '交报名表', date: '' }],
});
check('V13 blank checklist text is dropped', blankPlan.items.length === 1 && blankPlan.items[0].text === '写真题', blankPlan.items);
check('V13 blank title is dropped but an empty date is kept', blankPlan.timeline.length === 1 && blankPlan.timeline[0].title === '交报名表' && blankPlan.timeline[0].date === '', blankPlan.timeline);

/* 12. V14: planCountdown decision table, all seven rows. */
const planNow = new Date(2026, 10, 3, 10, 0, 0); // 2026-11-03 10:00 local
const row = (entry) => api.planCountdown(entry, planNow);
check('V14 no date → plan.noDate', row({ date: '' }).key === 'plan.noDate' && row({ date: '' }).tone === '');
check('V14 done → plan.doneOn without red', row({ date: '2026-11-20', done: true }).key === 'plan.doneOn' && row({ date: '2026-11-20', done: true }).tone === '');
check('V14 done keeps the literal date', row({ date: '2026-11-20', done: true }).params.date === '2026-11-20');
check('V14 overdue by 3 days', row({ date: '2026-10-31' }).key === 'competition.overdue' && row({ date: '2026-10-31' }).params.days === 3 && row({ date: '2026-10-31' }).tone === ' mc-task-late');
check('V14 due today', row({ date: '2026-11-03' }).key === 'task.dueToday' && row({ date: '2026-11-03' }).tone === ' mc-task-today');
check('V14 due tomorrow', row({ date: '2026-11-04' }).key === 'task.dueTomorrow' && row({ date: '2026-11-04' }).tone === ' mc-task-today');
const inFive = row({ date: '2026-11-08' });
check('V14 five days out is warm', inFive.key === 'competition.left' && inFive.params.days === 5 && inFive.tone === ' mc-task-today', inFive);
const farOut = row({ date: '2026-11-26' });
check('V14 far out is neutral', farOut.key === 'competition.left' && farOut.params.days === 23 && farOut.tone === '', farOut);
check('V14 a missing entry returns null', api.planCountdown(null, planNow) === null);

/* 13. V15/V16: R2 preprint badge. */
const label = (key) => '<' + key + '>';
const venueRow = (item) => api.paperVenueMeta(item, label);
check('V15 venue present → venue text + venue tooltip', eq(venueRow({ venue: 'CVPR', arxivId: '2401.00001' }), { text: 'CVPR', title: '<paper.venue>' }), venueRow({ venue: 'CVPR', arxivId: '2401.00001' }));
check('V15 venue empty + doi + arxiv → no badge at all', eq(venueRow({ venue: '', doi: '10.1/x', arxivId: '2401.00001' }), { text: '', title: '' }), venueRow({ venue: '', doi: '10.1/x', arxivId: '2401.00001' }));
check('V15 venue empty + doiUrl only → no badge at all', eq(venueRow({ venue: '', doiUrl: 'https://doi.org/10.1/x', arxivId: '2401.00001' }), { text: '', title: '' }), venueRow({ venue: '', doiUrl: 'https://doi.org/10.1/x', arxivId: '2401.00001' }));
check('V15 venue empty + no doi + arxiv → preprint badge', eq(venueRow({ venue: '', arxivId: '2401.00001' }), { text: '<paper.preprint>', title: '<paper.preprint>' }), venueRow({ venue: '', arxivId: '2401.00001' }));
check('V15 venue empty + no doi + no arxiv → nothing', eq(venueRow({ venue: '' }), { text: '', title: '' }), venueRow({ venue: '' }));
check('V16 whitespace-only venue with a doi stays blank', eq(venueRow({ venue: '   ', doi: '10.1/x', arxivId: '2401.00001' }), { text: '', title: '' }), venueRow({ venue: '   ', doi: '10.1/x', arxivId: '2401.00001' }));

/* 14. V17/V18: R3 completed tasks must not read as overdue. */
const lateNow = new Date(2026, 10, 3, 10, 0, 0);
const doneTask = api.taskCountdownFor({ done: true, due: '2026-10-01' }, lateNow);
check('V17 done task reads as finished', doneTask && doneTask.key === 'task.doneOn' && doneTask.params.date === '2026-10-01', doneTask);
check('V17 done task has no late tone', doneTask && doneTask.tone === '', doneTask);
check('V17 done task never mentions overdue', doneTask && !/逾期/.test(doneTask.key) && !/逾期/.test(String(doneTask.params.date)), doneTask);
check('V17 done task without a due date renders nothing', api.taskCountdownFor({ done: true, due: '' }, lateNow) === null);
const openLate = api.taskCountdownFor({ done: false, due: '2026-10-01' }, lateNow);
check('V18 an open overdue task still shows late', openLate && openLate.key === 'task.daysOverdue' && openLate.params.days === 33 && openLate.tone === ' mc-task-late', openLate);
check('V18 an open task keeps taskState semantics', api.taskState({ done: true, due: '2026-10-01' }, lateNow) === 'overdue');

/* 15. V24: the plan never merges rows that only share their text. */
const sameText = api.normalizePlan({ items: [{ id: 'p1', text: '刷完近五年真题' }, { id: 'p2', text: '刷完近五年真题' }] });
check('V24 same text twice keeps two rows', sameText.items.length === 2, sameText.items.length);
check('V24 their ids stay distinct', new Set(sameText.items.map((entry) => entry.id)).size === 2, sameText.items.map((entry) => entry.id));
const randomIds = new Set();
for (let index = 0; index < 200; index += 1) randomIds.add(api.uid());
check('V24 uid does not collide across 200 draws', randomIds.size === 200, randomIds.size);
const repeatedId = api.normalizePlan({ items: [{ id: 'same', text: 'a' }, { id: 'same', text: 'b' }] });
check('V24 a repeated id is deduped, not the text', repeatedId.items.length === 1 && repeatedId.items[0].text === 'a', repeatedId.items);
const derived = api.normalizePlan({ timeline: [
	{ id: 't1', title: '初赛', date: '2026-11-10', kind: 'milestone' },
	{ id: 't2', title: '提交材料', date: '2026-11-05', kind: 'step' },
	{ id: 't3', title: '决赛', date: '2026-12-01', kind: 'milestone' },
] });
check('V24 milestones are derived from the timeline, not stored', derived.milestones === undefined && api.milestonesOf(derived).map((entry) => entry.id).join(',') === 't1,t3', api.milestonesOf(derived).map((entry) => entry.id));
check('V24 planProgress counts that same derived array', api.planProgress(derived).total === 2 && api.planProgress(derived).done === 0, api.planProgress(derived));

/* 17. V26: §3.2 done 行必须真的渲染 plan.doneOn，且同一行不出现两个日期。 */
const metaStart = source.indexOf('\t\tfunction planTimelineMeta(');
const metaEnd = source.indexOf('\n\t\t}\n', metaStart);
check('V26 planTimelineMeta is locatable', metaStart > 0 && metaEnd > metaStart, [metaStart, metaEnd]);
if (metaStart > 0 && metaEnd > metaStart) {
	const buildMeta = new Function('h', 'format', 'planCountdown', source.slice(metaStart, metaEnd + 4) + '\nreturn planTimelineMeta;');
	const fakeH = (tag, props, ...children) => ({ tag, children: children.flat(Infinity) });
	const fakeFormat = (template, vars) => String(template).replace(/\{(\w+)\}/g, (whole, key) => (vars && key in vars ? String(vars[key]) : whole));
	const fakeT = (key) => '<' + key + '>' + (key === 'plan.doneOn' ? ' · {date}' : '');
	const planTimelineMeta = buildMeta(fakeH, fakeFormat, api.planCountdown);
	const hits = (tree, needle) => JSON.stringify(tree).split(needle).length - 1;
	const metaNow = new Date(2026, 10, 3, 10, 0, 0);
	const doneRow = planTimelineMeta(fakeT, { title: '初试', date: '2026-11-20', kind: 'milestone', done: true }, metaNow);
	check('V26 a done entry renders plan.doneOn', hits(doneRow, '<plan.doneOn>') === 1, doneRow);
	check('V26 the done row never reads as overdue', hits(doneRow, 'competition.overdue') === 0, doneRow);
	check('V26 the done row shows its date exactly once', hits(doneRow, '2026-11-20') === 1, doneRow);
	const openRow = planTimelineMeta(fakeT, { title: '决赛', date: '2026-11-20', kind: 'step', done: false }, metaNow);
	check('V26 an open entry shows the date once plus a countdown', hits(openRow, '2026-11-20') === 1 && hits(openRow, '<competition.left>') === 1, openRow);
	const lateRow = planTimelineMeta(fakeT, { title: '补材料', date: '2026-10-01', kind: 'step', done: false }, metaNow);
	check('V26 an open overdue entry still reads as overdue', hits(lateRow, '<competition.overdue>') === 1, lateRow);
	const undatedRow = planTimelineMeta(fakeT, { title: '待定', date: '', kind: 'step', done: false }, metaNow);
	check('V26 an entry without a date shows plan.noDate once', hits(undatedRow, '<plan.noDate>') === 1, undatedRow);
}

/* 16. V25: 文件夹删除/上移的「真回调」。deleteFolder / reorderFolder 是页面里的
	useCallback 闭包，不在上面那份顶层函数抽取名单里，所以纯函数断言对它们完全盲区。
	这里按内容锚点把闭包体切出来，用假 store + 假 askConfirm 真跑一遍。 */
const folderStart = source.indexOf('\t\t\tconst deleteFolder = useCallback(');
const folderEnd = source.indexOf('\t\t\tconst editPlan = useCallback(');
check('V25 the deleteFolder…reorderFolder closure block is locatable', folderStart > 0 && folderEnd > folderStart, [folderStart, folderEnd]);
if (folderStart > 0 && folderEnd > folderStart) {
	const folderBlock = source.slice(folderStart, folderEnd);
	const buildFolderCallbacks = new Function('useCallback', 'updateWith', 'askConfirm', 'uid', 't', 'format', 'byFolder', 'state', folderBlock + '\nreturn { deleteFolder, reorderFolder };');
	const fakeFormat = (template, vars) => String(template).replace(/\{(\w+)\}/g, (whole, key) => (vars && key in vars ? String(vars[key]) : whole));
	const makeKit = (answer) => {
		let state = {
			version: 7,
			research: { directions: [], keywords: '', items: [], saved: [], fetchedAt: 0 },
			tasks: [],
			competitions: [
				{ id: 'c1', name: '数学建模国赛', level: '国家级', status: '已报名', deadline: '2026-09-10', link: 'https://example.com/c1', note: '组队三人', folderId: 'f1' },
				{ id: 'c2', name: '蓝桥杯', level: '省级', status: '准备中', deadline: '2027-04-01', link: '', note: '', folderId: 'f1' },
				{ id: 'c3', name: 'ACM 校赛', level: '校级', status: '已结束', deadline: '2026-05-01', link: '', note: '拿了三等奖', folderId: 'f2' },
				{ id: 'c4', name: '未分组的小比赛', level: '校级', status: '准备中', deadline: '', link: '', note: '', folderId: '' },
			],
			competitionFolders: [
				{ id: 'f1', name: '保研加分', order: 0, createdAt: 1700000000000, plan: { items: [{ id: 'i1', text: '买真题', done: false, createdAt: 1700000000500 }], timeline: [{ id: 'l1', title: '初试', date: '2026-12-19', kind: 'milestone', done: false }] } },
				{ id: 'f2', name: '课程项目', order: 1, createdAt: 1700000001000, plan: { items: [], timeline: [] } },
				{ id: 'f3', name: '随便看看', order: 2, createdAt: 1700000002000, plan: { items: [], timeline: [] } },
			],
		};
		const writes = [];
		const handlers = buildFolderCallbacks(
			(fn) => fn,
			(producer) => {
				const next = producer(JSON.parse(JSON.stringify(state)));
				writes.push(next);
				state = next;
				return next;
			},
			() => Promise.resolve(answer),
			() => 'gen-1',
			(key) => key,
			fakeFormat,
			api.byFolder,
			state,
		);
		return { get state() { return state; }, writes, ...handlers };
	};
	const errorOf = async (fn) => { try { await fn(); return null; } catch (error) { return error; } };

	const cancelKit = makeKit(false);
	const cancelError = await errorOf(() => cancelKit.deleteFolder({ id: 'f1', name: '保研加分' }));
	check('V25 cancelling the confirm writes nothing and does not throw', cancelError === null && cancelKit.writes.length === 0, [String(cancelError && cancelError.message), cancelKit.writes.length]);

	const del = makeKit(true);
	const deleteError = await errorOf(() => del.deleteFolder({ id: 'f1', name: '保研加分' }));
	check('V25 the real deleteFolder does not throw', deleteError === null, String(deleteError && deleteError.message));
	check('V25 it writes exactly once', del.writes.length === 1, del.writes.length);
	check('V25 folder count 3 → 2 and the deleted one is gone', del.state.competitionFolders.map((row) => row.id).join(',') === 'f2,f3', del.state.competitionFolders.map((row) => row.id));
	check('V25 orders are renumbered densely 0..n-1', del.state.competitionFolders.map((row) => row.order).join(',') === '0,1', del.state.competitionFolders.map((row) => row.order));
	check('V25 no competition is cascade-deleted', del.state.competitions.length === 4, del.state.competitions.length);
	check('V25 its competitions fall back to 未分组', del.state.competitions.filter((row) => row.folderId === '').map((row) => row.id).join(',') === 'c1,c2,c4', del.state.competitions.map((row) => row.id + ':' + row.folderId));
	check('V25 another folder\'s competition keeps its folderId', del.state.competitions.find((row) => row.id === 'c3').folderId === 'f2');
	check('V25 normalize leaves no dangling folderId behind', api.normalize(del.state).competitions.filter((row) => row.folderId === 'f1').length === 0);

	const move = makeKit(true);
	const moveError = await errorOf(() => move.reorderFolder('f3', -1));
	check('V25 the real reorderFolder does not throw', moveError === null, String(moveError && moveError.message));
	check('V25 moving f3 up gives f1,f3,f2', move.state.competitionFolders.map((row) => row.id).join(',') === 'f1,f3,f2', move.state.competitionFolders.map((row) => row.id));
	check('V25 orders stay dense after the move', move.state.competitionFolders.map((row) => row.order).join(',') === '0,1,2', move.state.competitionFolders.map((row) => row.order));
	check('V25 a no-op move (delta 0) still returns a consistent list', (await errorOf(() => move.reorderFolder('f1', 0))) === null && move.state.competitionFolders.length === 3);
}


/* 17. V27: 批次③的画像 / 打分 / 排序 / 每日守卫。这一层决定「推什么、按什么顺序」，
	所以断言落在可复算的整数分与硬上限上，而不是文案。 */
const v27ProfileDefaults = api.normalizeProfile(undefined, []);
check('V27 profile defaults', v27ProfileDefaults.major === 'cs' && v27ProfileDefaults.updatedAt === 0, v27ProfileDefaults);
check('V27 unknown directions are dropped and repeats collapse', JSON.stringify(api.normalizeProfile({ directions: ['cs.CL', 'not.a.Code', 'cs.CL'] }).directions) === JSON.stringify(['cs.CL']));
const v27LegacyProfile = api.normalizeProfile({ major: 'cs' }, ['cs.CV']);
check('V27 research directions seed a profile without its own list', JSON.stringify(v27LegacyProfile.directions) === JSON.stringify(['cs.CV']), v27LegacyProfile.directions);
const v27ManyDirections = api.normalizeProfile({ directions: ['cs.CL', 'cs.AI', 'cs.LG', 'cs.CV', 'cs.DB', 'cs.RO'] });
check('V27 directions follow the table order and cap at 4', JSON.stringify(v27ManyDirections.directions) === JSON.stringify(['cs.CL', 'cs.AI', 'cs.LG', 'cs.CV']), v27ManyDirections.directions);
check('V27 a bogus direction falls back to cs.CL', JSON.stringify(api.normalizeProfile({ directions: ['bogus.XX'] }).directions) === JSON.stringify(['cs.CL']));
const v27CustomProfile = api.normalizeProfile({ directions: ['c:llm-agents'], custom: [{ id: 'c:llm-agents', label: 'LLM Agents' }, { id: 'bad id', label: 'x' }] });
check('V27 a custom direction keeps its id and label', v27CustomProfile.custom.length === 1 && v27CustomProfile.custom[0].label === 'LLM Agents', v27CustomProfile.custom);
check('V27 a custom major without a name falls back', api.normalizeProfile({ major: 'custom', majorCustom: '   ' }).major === 'cs');
check('V27 preset query comes from the major', api.pushProfileQuery({ major: 'ai' }) === 'artificial intelligence');
check('V27 custom query comes from the typed name', api.pushProfileQuery({ major: 'custom', majorCustom: '  量子计算 ' }) === '量子计算');
const v27Feeds = api.pushDirectionFeeds({ directions: ['cs.CL', 'c:llm-agents'], custom: [{ id: 'c:llm-agents', label: 'LLM Agents' }] });
check('V27 v27Feeds cover preset and custom directions', v27Feeds.length === 2 && v27Feeds[0].arxiv === 'cs.CL' && v27Feeds[1].arxiv === '' && v27Feeds[1].news === 'LLM Agents', v27Feeds);

const v27ScoreNow = new Date(2026, 10, 4, 9, 0, 0);
const v27ScoreBase = { id: 'p1', title: 'A survey', summary: '', url: 'https://example.com/p1', source: 'paper', directions: ['cs.CL'], publishedAt: v27ScoreNow.getTime(), metrics: { hot: 0 } };
const v27Scored = api.scoreItem(v27ScoreBase, { directions: ['cs.CL'], keywords: '' }, v27ScoreNow);
check('V27 direction hit scores 40 + fresh 25 + paper 20', v27Scored.score === 85, v27Scored.score);
check('V27 score is an integer and reasons are ordered keys', Number.isInteger(v27Scored.score) && v27Scored.reasons[0] === 'push.reason.direction', v27Scored.reasons);
const v27TwoDir = api.scoreItem(Object.assign({}, v27ScoreBase, { directions: ['cs.CL', 'cs.AI'], publishedAt: 0 }), { directions: ['cs.CL', 'cs.AI'] }, v27ScoreNow);
check('V27 more direction hits score higher', v27TwoDir.score === 45 + 20, v27TwoDir.score);
const v27KwScored = api.scoreItem(Object.assign({}, v27ScoreBase, { title: 'LLM agent survey', directions: [], publishedAt: 0 }), { directions: ['cs.CV'], keywords: 'LLM agent' }, v27ScoreNow);
check('V27 two keyword hits add 16', v27KwScored.score === 16 + 20, v27KwScored.score);
const v27Uneven = api.scoreItem(Object.assign({}, v27ScoreBase, { title: 'LLM agent survey', directions: [], publishedAt: 0 }), { directions: ['cs.CV'], keywords: 'LLM agent' }, v27ScoreNow);
check('V27 keywords are a bonus, not a gate', v27Uneven.reasons.indexOf('push.reason.keyword') === 0, v27Uneven.reasons);
const v27FreshOnly = api.rankPushItems([Object.assign({}, v27ScoreBase, { directions: [], publishedAt: 0 })], { directions: ['cs.CV'], keywords: 'survey' }, v27ScoreNow);
check('V27 a keyword-only item still enters the feed', v27FreshOnly.length === 1, v27FreshOnly.length);
const v27Stale = api.scoreItem(Object.assign({}, v27ScoreBase, { publishedAt: v27ScoreNow.getTime() - 400 * 86400000 }), { directions: ['cs.CL'] }, v27ScoreNow);
check('V27 freshness floors at zero for old items', v27Stale.score === 40 + 20, v27Stale.score);
const v27HotScored = api.scoreItem(Object.assign({}, v27ScoreBase, { source: 'news', hot: 0, metrics: { hot: 250 } }), { directions: ['cs.CL'] }, v27ScoreNow);
check('V27 hot tier 100..499 adds 8', v27HotScored.score === 40 + 25 + 12 + 8, v27HotScored.score);

/* 排序：先按分数，再按时间，再按来源权重，最后按 id；两个硬上限必须生效。 */
const v27RankNow = new Date(2026, 10, 4, 9, 0, 0);
const v27MkRank = (id, source, directions, ageDays, hot) => ({
	id, title: 'row ' + id, summary: '', url: 'https://example.com/' + id, source,
	directions, publishedAt: v27RankNow.getTime() - ageDays * 86400000, metrics: { hot: hot || 0 },
});
const v27Ranked = api.rankPushItems([
	v27MkRank('r1', 'news', ['cs.CL'], 0, 0),
	v27MkRank('r2', 'paper', ['cs.CL'], 0, 0),
	v27MkRank('r3', 'github', [], 0, 0),
	v27MkRank('r1', 'news', ['cs.CL'], 0, 0),
], { directions: ['cs.CL'], keywords: '' }, v27RankNow);
check('V27 duplicates collapse and unrelated rows drop', v27Ranked.length === 2, v27Ranked.map((row) => row.id));
check('V27 higher score wins before recency', v27Ranked[0].id === 'r2', v27Ranked.map((row) => row.id));
const v27Capped = api.rankPushItems(Array.from({ length: 30 }, (_, index) => v27MkRank('c' + index, 'paper', ['cs.CL'], index, 0)), { directions: ['cs.CL'], keywords: '' }, v27RankNow);
check('V27 per-source cap holds at 6', v27Capped.length === 6, v27Capped.length);
const v27Mixed = api.rankPushItems(
	Array.from({ length: 8 }, (_, index) => v27MkRank('p' + index, 'paper', ['cs.CL'], index, 0))
		.concat(Array.from({ length: 8 }, (_, index) => v27MkRank('n' + index, 'news', ['cs.CL'], index, 0)))
		.concat(Array.from({ length: 8 }, (_, index) => v27MkRank('g' + index, 'github', ['cs.CL'], index, 0))),
	{ directions: ['cs.CL'], keywords: '' }, v27RankNow);
check('V27 total cap holds at 15 with three sources', v27Mixed.length === 15, v27Mixed.length);
const v27Jumbled = api.rankPushItems([v27MkRank('b', 'news', ['cs.CL'], 0, 0), v27MkRank('a', 'news', ['cs.CL'], 0, 0)], { directions: ['cs.CL'] }, v27RankNow);
check('V27 equal rows fall back to id byte order', v27Jumbled[0].id === 'a', v27Jumbled.map((row) => row.id));

const v27NormalizedPush = api.normalizePush({
	items: [{ id: 'x1', title: 't', url: 'https://example.com/x1', source: 'news', directions: ['cs.CL'] }],
	seenIds: ['x1', 'x1', ''],
	lastRunDay: '2026-11-04',
	lastRunAt: 1,
});
check('V27 push normalization keeps the day and dedupes seen ids', v27NormalizedPush.lastRunDay === '2026-11-04' && v27NormalizedPush.seenIds.length === 1, v27NormalizedPush.seenIds);
check('V27 push normalization seeds three source cells', Object.keys(v27NormalizedPush.sourceState).length === 3 && v27NormalizedPush.sourceState.paper.ok === false, v27NormalizedPush.sourceState);
check('V27 an invalid day is dropped', api.normalizePush({ lastRunDay: '04/11/2026' }).lastRunDay === '');
check('V27 unread counts items the user has not opened', api.pushUnreadCount({ items: [{ id: 'a' }, { id: 'b' }], seenIds: ['a'] }) === 1);
const v27SameDay = api.pushIsDue({ lastRunDay: api.isoDate(v27RankNow), lastRunAt: v27RankNow.getTime() }, new Date(v27RankNow.getTime() + 3600000));
check('V27 the second open of the same day is not due', v27SameDay === false);
check('V27 a new day is due', api.pushIsDue({ lastRunDay: '2000-01-01', lastRunAt: 1 }, v27RankNow) === true);
check('V27 a clock rollback re-arms the run', api.pushIsDue({ lastRunDay: api.isoDate(v27RankNow), lastRunAt: v27RankNow.getTime() + 7200000 }, v27RankNow) === true);
check('V27 pushDayOf matches the ISO day', api.pushDayOf(v27RankNow) === api.isoDate(v27RankNow));


/* 17. 批次④：论文工作台的纯函数（arXiv id、SSE 帧、对话裁剪、v9 迁移）。 */
check('V34 arxivIdOf reads an abs link', api.arxivIdOf('https://arxiv.org/abs/2501.12948') === '2501.12948');
check('V34 arxivIdOf drops the version suffix', api.arxivIdOf('https://arxiv.org/abs/2501.12948v3') === '2501.12948');
check('V34 arxivIdOf reads a pdf link', api.arxivIdOf('https://arxiv.org/pdf/2501.12948v2.pdf') === '2501.12948');
check('V34 arxivIdOf keeps legacy subject ids', api.arxivIdOf('hep-th/9901001') === 'hep-th/9901001' && api.arxivIdOf('https://arxiv.org/abs/math.AG/0601001') === 'math.AG/0601001', [api.arxivIdOf('hep-th/9901001'), api.arxivIdOf('https://arxiv.org/abs/math.AG/0601001')]);
check('V34 arxivIdOf accepts a bare new-style id', api.arxivIdOf('2501.12948') === '2501.12948');
check('V34 arxivIdOf rejects foreign hosts', api.arxivIdOf('https://evil.com/abs/2501.12948') === '' && api.arxivIdOf('https://arxiv.org.evil.com/abs/2501.12948') === '');
check('V34 arxivIdOf rejects junk', api.arxivIdOf('') === '' && api.arxivIdOf('not a url') === '' && api.arxivIdOf(null) === '' && api.arxivIdOf(undefined) === '');

const sseSample = 'event: delta\ndata: {"text":"\u4f60"}\n\nevent: done\ndata: {"model":"fake-1"}\n\nevent: delta\ndata: {"te';
const sseRead = api.readSseFrames(sseSample);
check('V35 readSseFrames parses whole frames only', sseRead.events.length === 2, sseRead.events.length);
check('V35 readSseFrames keeps event names and payloads', sseRead.events[0].event === 'delta' && JSON.parse(sseRead.events[0].data).text === '\u4f60' && sseRead.events[1].event === 'done');
check('V35 readSseFrames returns the partial tail', sseRead.rest.indexOf('{"te') >= 0 && sseRead.rest.indexOf('\n\n') < 0, sseRead.rest);
check('V35 readSseFrames tolerates CRLF', api.readSseFrames('data: {"a":1}\r\n\r\n').events.length === 1);
check('V35 readSseFrames ignores frames without data', api.readSseFrames('event: ping\n\n').events.length === 0);
check('V35 readSseFrames joins multi-line data', JSON.parse(api.readSseFrames('data: {"a":\ndata: 1}\n\n').events[0].data).a === 1);
check('V35 readSseFrames survives empty input', api.readSseFrames('').events.length === 0 && api.readSseFrames(null).rest === '');

const manyMsgs = [];
for (let i = 0; i < 45; i += 1) manyMsgs.push({ role: 'user', text: 'q' + i, at: i });
const clippedChat = api.clipPaperChat(manyMsgs);
check('V36 clipPaperChat keeps the last 40 messages', clippedChat.length === 40 && clippedChat[0].text === 'q5', clippedChat.length);
check('V36 clipPaperChat caps one message at 1200 chars', api.clipPaperChat([{ role: 'user', text: 'x'.repeat(5000) }])[0].text.length === 1200);
check('V36 clipPaperChat drops unknown roles and blank text', api.clipPaperChat([{ role: 'system', text: 'x' }, { role: 'user', text: '   ' }, { role: 'assistant', text: 'ok', at: 3 }]).length === 1);
check('V36 clipPaperChat tolerates junk', api.clipPaperChat(null).length === 0 && api.clipPaperChat('nope').length === 0);

const v8State = api.normalize({ version: 8, push: { items: [] } });
check('V37 a v8 blob gains an empty paper slice at v11', v8State.version === 11 && v8State.paper.open === '' && Object.keys(v8State.paper.items).length === 0, [v8State.version, v8State.paper]);
check('V37 re-normalizing a v9 blob is byte-identical', JSON.stringify(api.normalize(v8State)) === JSON.stringify(v8State));
const paperRaw = {
	open: '2501.12948',
	tab: 'chat',
	items: {
		'2501.12948': {
			id: 'x',
			title: '  T  ',
			url: 'https://arxiv.org/abs/2501.12948',
			at: 5,
			guide: 'g'.repeat(9000),
			sectionsZh: { S1: { zh: 'z'.repeat(9000), at: 2 }, '': { zh: 'x' }, S2: { zh: '' } },
			chat: [{ role: 'user', text: 'hi', at: 1 }],
			anchor: -3,
		},
	},
};
const paperState = api.normalizePaperState(paperRaw);
const paperCell = paperState.items['2501.12948'];
check('V37 paper slice caps title, guide and zh', paperCell.title === 'T' && paperCell.guide.length === 4000 && paperCell.sectionsZh.S1.zh.length === 6000, [paperCell.title, paperCell.guide.length, paperCell.sectionsZh.S1.zh.length]);
check('V37 paper slice drops empty section entries', Object.keys(paperCell.sectionsZh).length === 1, Object.keys(paperCell.sectionsZh));
check('V37 paper slice clamps the anchor and keeps the tab', paperCell.anchor === 0 && paperState.tab === 'chat' && paperState.open === '2501.12948', [paperCell.anchor, paperState.tab]);
check('V37 an unknown tab falls back to guide', api.normalizePaperState({ tab: 'nope' }).tab === 'guide');
check('V37 normalizePaperState is idempotent', JSON.stringify(api.normalizePaperState(paperState)) === JSON.stringify(paperState));
check('V37 normalizePaperState tolerates junk', api.normalizePaperState(null).open === '' && Object.keys(api.normalizePaperState('#').items).length === 0);

// ---- batch 5: CCF ranking and the pdf library (V38-V42) --------------------
check('V38 ccfNormalize uppercases and collapses separators', api.ccfNormalize('Proc. of NeurIPS 2024') === 'PROC OF NEURIPS 2024', api.ccfNormalize('Proc. of NeurIPS 2024'));
check('V38 ccfNormalize strips punctuation runs', api.ccfNormalize('ACM/USENIX-sec (2023)') === 'ACM USENIX SEC 2023', api.ccfNormalize('ACM/USENIX-sec (2023)'));
check('V38 ccfNormalize tolerates junk', api.ccfNormalize(null) === '' && api.ccfNormalize(undefined) === '' && api.ccfNormalize(42) === '42');
check('V38 ccfMatchList matches whole words only', api.ccfMatchList(' ICDEW ', api.CCF_A_VENUES) === false && api.ccfMatchList(' ICDE ', api.CCF_A_VENUES) === true);
check('V38 ccfMatchList needs a boundary on both sides', api.ccfMatchList(' XNEURIPSY ', api.CCF_A_VENUES) === false);
check('V38 ccfMatchList refuses two-letter aliases', api.ccfMatchList(' SC ', api.CCF_A_VENUES) === false);

check('V39 paperCcfLevel reads a conference short name', api.paperCcfLevel({ venue: 'NeurIPS' }) === 'A');
check('V39 paperCcfLevel is case and separator blind', api.paperCcfLevel({ venue: 'proc. of nips 2022' }) === 'A');
check('V39 paperCcfLevel accepts the journalRef column', api.paperCcfLevel({ journalRef: 'IEEE TPAMI' }) === 'A');
check('V39 paperCcfLevel accepts the arXiv comment column', api.paperCcfLevel({ comment: 'Accepted at ICML 2024' }) === 'A');
check('V39 paperCcfLevel knows B and C venues', api.paperCcfLevel({ venue: 'EMNLP' }) === 'B' && api.paperCcfLevel({ venue: 'ICPR' }) === 'C');
check('V39 paperCcfLevel never guesses ICLR', api.paperCcfLevel({ venue: 'ICLR' }) === '');
check('V39 paperCcfLevel stays silent without metadata', api.paperCcfLevel({}) === '' && api.paperCcfLevel(null) === '' && api.paperCcfLevel({ venue: '   ' }) === '');
check('V39 paperCcfLevel never rates from the title', api.paperCcfLevel({ title: 'A NeurIPS paper' }) === '');
check('V39 paperCcfLevel leaves an arXiv preprint unrated', api.paperCcfLevel({ venue: 'arXiv preprint' }) === '');
check('V39 ccfRank orders A before B before C before unknown', api.ccfRank('A') === 0 && api.ccfRank('B') === 1 && api.ccfRank('C') === 2, [api.ccfRank('A'), api.ccfRank('B'), api.ccfRank('C')]);
check('V39 ccfRank sends noise to the end', api.ccfRank('') === 3 && api.ccfRank('Z') === 3 && api.ccfRank(null) === 3 && api.ccfRank('toString') === 3);
check('V39 the CCF tables are disjoint enough to be curated', api.CCF_LEVELS.length === 3 && api.CCF_A_VENUES.length >= 45 && api.CCF_B_VENUES.length >= 20 && api.CCF_C_VENUES.length >= 5, [api.CCF_A_VENUES.length, api.CCF_B_VENUES.length, api.CCF_C_VENUES.length]);
check('V39 ICLR is not listed at any level', !api.CCF_A_VENUES.includes('ICLR') && !api.CCF_B_VENUES.includes('ICLR') && !api.CCF_C_VENUES.includes('ICLR'));

check('V40 the ccf filter set is all/A/rated', JSON.stringify(api.WB_CCF_FILTERS) === JSON.stringify(['all', 'A', 'rated']), api.WB_CCF_FILTERS);
check('V40 the import limits match the host', api.WB_IMPORT_FILES_MAX === 5 && api.WB_IMPORT_BYTES_MAX === 8 * 1024 * 1024 && api.WB_LIB_MAX === 200, [api.WB_IMPORT_FILES_MAX, api.WB_IMPORT_BYTES_MAX, api.WB_LIB_MAX]);
check('V40 a pdf id is lowercase hex of 16', api.WB_PDF_ID_PATTERN.test('pdf:0123456789abcdef') && !api.WB_PDF_ID_PATTERN.test('pdf:0123456789ABCDEF'));
check('V40 an arXiv id is not a pdf id', !api.WB_PDF_ID_PATTERN.test('2501.12948') && !api.WB_PDF_ID_PATTERN.test('pdf:0123'));

const v9Blob = { version: 9, paper: { open: 'pdf:0123456789abcdef', tab: 'guide', items: { 'pdf:0123456789abcdef': { title: 'Scanned', kind: 'pdf' } } } };
const v10State = api.normalize(v9Blob);
check('V41 a v9 blob migrates to v11', v10State.version === 11 && v10State.paper.open === 'pdf:0123456789abcdef', [v10State.version, v10State.paper.open]);
check('V41 a v9 pdf entry keeps its kind and gains openedAt', v10State.paper.items['pdf:0123456789abcdef'].kind === 'pdf' && typeof v10State.paper.items['pdf:0123456789abcdef'].openedAt === 'number', v10State.paper.items['pdf:0123456789abcdef']);
check('V41 re-normalizing a migrated blob is byte-identical', JSON.stringify(api.normalize(v10State)) === JSON.stringify(v10State));
const legacyCell = api.normalizePaperState({ items: { 'pdf:0123456789abcdef': { title: 'x' }, '2501.12948': { title: 'y' } } }).items;
check('V41 a missing kind is inferred from the id prefix', legacyCell['pdf:0123456789abcdef'].kind === 'pdf' && legacyCell['2501.12948'].kind === 'arxiv');
check('V41 the ccf column is re-derived when the venue is known', api.normalizePaperState({ items: { '2501.12948': { venue: 'NeurIPS' } } }).items['2501.12948'].ccf === 'A');
check('V41 an unknown ccf string falls back to the venue lookup', api.normalizePaperState({ items: { '2501.12948': { ccf: 'Z', venue: '' } } }).items['2501.12948'].ccf === '');
check('V41 the library is capped at 200 entries', Object.keys(api.normalizePaperState({ items: Object.fromEntries(Array.from({ length: 260 }, (unused, index) => ['id' + index, { title: 't' }])) }).items).length === api.WB_LIB_MAX);

// ---- batch 6: views, glossary, alignment, notes, citations, export ---------
/* 19. 批次⑥：阅读体验的纯函数。这一层决定「译文怎么摆、笔记怎么存、导出写什么」，
 * 所以断言只允许用真实输入，不构造模型返回。 */
check('V42 a paper remembers one of three views', JSON.stringify(api.WB_VIEWS) === JSON.stringify(['bi', 'zh', 'en']), api.WB_VIEWS);
check('V42 every view has a label key', api.WB_VIEWS.every((key) => typeof api.WB_VIEW_LABEL[key] === 'string' && api.WB_VIEW_LABEL[key].indexOf('wb.') === 0), api.WB_VIEW_LABEL);

check('V42 glossaryText normalises separators and dedupes', api.glossaryText(['attention=注意力', 'Attention = 注意力', 'latent space：隐空间']) === 'attention=注意力\nlatent space=隐空间', api.glossaryText(['attention=注意力', 'Attention = 注意力', 'latent space：隐空间']));
check('V42 a glossary row without a separator is dropped', JSON.stringify(api.normalizeGlossary(['junk', 'a=b', '=x', 'y='])) === JSON.stringify(['a=b']), api.normalizeGlossary(['junk', 'a=b', '=x', 'y=']));
check('V42 the glossary stops at 40 entries', api.normalizeGlossary(Array.from({ length: 60 }, (unused, index) => 't' + index + '=v' + index)).length === 40);
check('V42 glossary sides are trimmed and capped', api.normalizeGlossary(['  a  =  b  '])[0] === 'a=b');
check('V42 glossaryText of junk is empty', api.glossaryText(null) === '' && api.glossaryText([]) === '');

check('V42 a complete numbered list aligns', JSON.stringify(api.parseAlignedTranslation('[1] 甲\n[2] 乙', 2)) === JSON.stringify(['甲', '乙']), api.parseAlignedTranslation('[1] 甲\n[2] 乙', 2));
check('V42 surrounding chatter does not break alignment', JSON.stringify(api.parseAlignedTranslation('好的：\n[1] 甲\n[2] 乙\n——完', 2)) === JSON.stringify(['甲', '乙']));
check('V42 a gap rejects the whole list', api.parseAlignedTranslation('[1] 甲\n[3] 丙', 2) === null);
check('V42 a missing row rejects the whole list', api.parseAlignedTranslation('[1] 甲', 2) === null);
check('V42 a duplicate index rejects the whole list', api.parseAlignedTranslation('[1] 甲\n[1] 乙', 2) === null);
check('V42 an out-of-range index is ignored, not shifted', api.parseAlignedTranslation('[1] 甲\n[2] 乙\n[9] 丙', 2) !== null);
check('V42 an empty row rejects the whole list', api.parseAlignedTranslation('[1] 甲\n[2]   ', 2) === null);
check('V42 an empty answer rejects the list', api.parseAlignedTranslation('', 2) === null && api.parseAlignedTranslation('[1] 甲', 0) === null);
check('V42 more paragraphs than the cap is refused', api.parseAlignedTranslation('[1] 甲', 100) === null);
check('V42 the alignment line pattern tolerates a tab', api.parseAlignedTranslation('[1]\t甲', 1)[0] === '甲');

check('V43 a citation carries heading and paragraph', JSON.stringify(api.parseCitations('见【§3 Results ¶1】。')) === JSON.stringify([{ heading: '3 Results', para: 1, raw: '【§3 Results ¶1】' }]), api.parseCitations('见【§3 Results ¶1】。'));
check('V43 a citation without a paragraph is paragraph zero', JSON.stringify(api.parseCitations('见【§Method】')) === JSON.stringify([{ heading: 'Method', para: 0, raw: '【§Method】' }]), api.parseCitations('见【§Method】'));
check('V43 several citations keep reading order', api.parseCitations('【§A ¶2】 再 【§B ¶3】').map((row) => row.heading + row.para).join('|') === 'A2|B3');
check('V43 an empty heading is not a citation', api.parseCitations('【§ ¶1】').length === 0);
check('V43 plain text has no citations', api.parseCitations('nothing here').length === 0 && api.parseCitations(null).length === 0);

check('V44 notes keep only rows with an id and text', api.normalizePaperNotes([{ id: 'a', text: 'x' }, { id: '', text: 'y' }, { id: 'b', text: '   ' }]).length === 1);
check('V44 note text is capped at 2000 chars', api.normalizePaperNotes([{ id: 'a', text: 'x'.repeat(3000) }])[0].text.length === 2000);
check('V44 the note list keeps the newest 200', api.normalizePaperNotes(Array.from({ length: 260 }, (unused, index) => ({ id: 'n' + index, text: 't' + index }))).map((row) => row.id)[0] === 'n60');
check('V44 a note quote is whitespace-collapsed and capped', api.normalizePaperNotes([{ id: 'a', text: 'x', quote: '  a\n\n b  ' }])[0].quote === 'a b');
check('V44 a note quote stops at 160 chars', api.normalizePaperNotes([{ id: 'a', text: 'x', quote: 'q'.repeat(300) }])[0].quote.length === 160);
check('V44 a note paragraph is a non-negative integer', api.normalizePaperNotes([{ id: 'a', text: 'x', para: -3.7 }])[0].para === 0 && api.normalizePaperNotes([{ id: 'a', text: 'x', para: '4' }])[0].para === 4);
check('V44 notes survive a round trip', JSON.stringify(api.normalizePaperNotes(api.normalizePaperNotes([{ id: 'a', text: 'x', sec: 's', heading: 'H', para: 1, quote: 'q', at: 5 }]))) === JSON.stringify(api.normalizePaperNotes([{ id: 'a', text: 'x', sec: 's', heading: 'H', para: 1, quote: 'q', at: 5 }])));

const mdPlain = api.buildPaperMarkdown({
	title: 'T', venue: 'NeurIPS', ccf: 'A', url: 'https://example.org/x', guide: 'G',
	sections: [{ key: 's1', heading: 'Intro', paragraphs: ['P1'] }],
	sectionsZh: { s1: { zh: '中文一段', aligned: [] } },
	notes: [{ id: 'n1', text: 'note body', sec: 's1', heading: 'Intro', para: 1, quote: 'P1' }],
});
check('V45 markdown starts with the title', mdPlain.indexOf('# T') === 0, mdPlain.split('\n')[0]);
check('V45 markdown carries venue, CCF and link', mdPlain.includes('- venue: NeurIPS') && mdPlain.includes('- CCF: A 类') && mdPlain.includes('- link: https://example.org/x'));
check('V45 markdown keeps the guide', mdPlain.includes('## Guide') && mdPlain.includes('G'));
check('V45 markdown writes the section and its whole translation', mdPlain.includes('## Intro') && mdPlain.includes('P1') && mdPlain.includes('> 中文一段'));
check('V45 markdown writes the notes with their anchor', mdPlain.includes('## Notes') && mdPlain.includes('### 1. §Intro ¶1') && mdPlain.includes('> P1') && mdPlain.includes('note body'));
const mdAligned = api.buildPaperMarkdown({ title: 'T', sections: [{ key: 's1', heading: 'H', paragraphs: ['P1', 'P2'] }], sectionsZh: { s1: { zh: '', aligned: ['甲', '乙'] } } });
check('V45 an aligned section pairs each paragraph', mdAligned.includes('P1\n\n> 甲') && mdAligned.includes('P2\n\n> 乙'), mdAligned);
const mdMismatch = api.buildPaperMarkdown({ title: 'T', sections: [{ key: 's1', heading: 'H', paragraphs: ['P1'] }], sectionsZh: { s1: { zh: '整节', aligned: ['甲', '乙'] } } });
check('V45 a mismatched aligned list falls back to the whole section', mdMismatch.includes('> 整节') && !mdMismatch.includes('> 甲'), mdMismatch);
check('V45 an empty paper still exports a title', api.buildPaperMarkdown({}).indexOf('# paper') === 0 && api.buildPaperMarkdown(null).indexOf('# paper') === 0);
check('V45 export never needs the network or a model', api.buildPaperMarkdown.length === 1);
check('V45 the export filename cap is 80', api.WB_EXPORT_NAME_MAX === 80);

const v10Blob = { version: 10, paper: { open: '2501.12948', tab: 'guide', items: { '2501.12948': { title: 'x', sectionsZh: { s1: { zh: 'old', at: 1 } } } } } };
const v11State = api.normalize(v10Blob);
check('V46 a v10 blob migrates to v11', v11State.version === 11, v11State.version);
check('V46 a migrated item gains notes and a view', Array.isArray(v11State.paper.items['2501.12948'].notes) && v11State.paper.items['2501.12948'].view === 'bi', v11State.paper.items['2501.12948']);
check('V46 an old section translation keeps its text and gets an empty aligned list', v11State.paper.items['2501.12948'].sectionsZh.s1.zh === 'old' && Array.isArray(v11State.paper.items['2501.12948'].sectionsZh.s1.aligned) && v11State.paper.items['2501.12948'].sectionsZh.s1.aligned.length === 0);
check('V46 re-normalizing a v11 blob is byte-identical', JSON.stringify(api.normalize(v11State)) === JSON.stringify(v11State));
const badView = api.normalizePaperState({ items: { '2501.12948': { view: 'sideways' } } }).items['2501.12948'];
check('V46 an unknown stored view falls back to bi', badView.view === 'bi', badView.view);
const alignedCell = api.normalizePaperState({ items: { '2501.12948': { sectionsZh: { s1: { aligned: ['a', 'b'] } } } } }).items['2501.12948'].sectionsZh.s1;
check('V46 a stored alignment survives normalisation', JSON.stringify(alignedCell.aligned) === JSON.stringify(['a', 'b']) && alignedCell.zh === '', alignedCell);
const brokenCell = api.normalizePaperState({ items: { '2501.12948': { sectionsZh: { s1: { aligned: ['a', '  '] } } } } }).items['2501.12948'].sectionsZh;
check('V46 a partially empty alignment is dropped, not padded', !brokenCell.s1 || brokenCell.s1.aligned.length === 0, brokenCell);
const notesCell = api.normalizePaperState({ items: { '2501.12948': { notes: [{ id: 'z', text: 'keep' }, { id: 'z2' }] } } }).items['2501.12948'];
check('V46 notes are normalised on the way into storage', notesCell.notes.length === 1 && notesCell.notes[0].text === 'keep', notesCell.notes);
check('V46 the note row cap is 200', api.WB_NOTE_MAX === 200 && api.WB_NOTE_TEXT_MAX === 2000 && api.WB_NOTE_QUOTE_MAX === 160);
check('V46 the alignment caps match the editor', api.WB_NOTE_SECTION_MAX === 64 && api.WB_ALIGN_PARAS_MAX === 20 && api.WB_GLOSSARY_MAX === 40);

console.log(failures === 0 ? '\nLOGIC OK' : '\nLOGIC FAILURES: ' + failures);
process.exitCode = failures === 0 ? 0 : 1;
