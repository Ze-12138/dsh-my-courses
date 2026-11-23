# 批次② 规格输入摘录

> 本文件由队长从当前代码**逐行摘取**（sha256 b323431c…），未做任何改写。架构师**只需读本文件**，不要去通读 client.js（3726 行会撑爆上下文）。需要更多细节时用 `sed -n "A,Bp" my-courses/client.js` 精确取行。

## 1. 竞赛枚举常量 — client.js:722-723

```js
		const COMPETITION_LEVELS = ['校级', '省级', '国家级', '国际'];
		const COMPETITION_STATUS = ['准备中', '已报名', '已结束'];
```

## 2. 竞赛数据模型 — client.js:791-803

```js
		function normalizeCompetition(item) {
			const source = item && typeof item === 'object' ? item : {};
			const deadline = String(source.deadline || '').trim();
			return {
				id: typeof source.id === 'string' && source.id ? source.id : uid(),
				name: String(source.name || '未命名竞赛'),
				level: COMPETITION_LEVELS.indexOf(source.level) >= 0 ? source.level : COMPETITION_LEVELS[0],
				status: COMPETITION_STATUS.indexOf(source.status) >= 0 ? source.status : COMPETITION_STATUS[0],
				deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : '',
				link: String(source.link || ''),
				note: String(source.note || ''),
			};
		}
```

## 3. 顶层归一化与 version — client.js:875-895

```js
			});
			const ui = raw.ui && typeof raw.ui === 'object' ? raw.ui : {};
			const uiWeek = Math.trunc(Number(ui.weekOverride));
			return {
				version: 6,
				periods,
				terms,
				research: normalizeResearch(raw.research),
				competitions: (Array.isArray(raw.competitions) ? raw.competitions : []).map(normalizeCompetition),
				activeTermId,
				tags,
				filesRoot: typeof raw.filesRoot === 'string' && raw.filesRoot ? raw.filesRoot : null,
				image: raw.image && typeof raw.image.dataUrl === 'string' && raw.image.dataUrl
					? {
						dataUrl: raw.image.dataUrl,
						name: String(raw.image.name || '课表图片'),
						addedAt: Number(raw.image.addedAt) || Date.now(),
						width: Number(raw.image.width) || 0,
						height: Number(raw.image.height) || 0,
					}
					: null,
```

## 4. 倒计时可复用实现 — client.js:1782-1800

```js
		function taskCountdown(task, now) {
			if (!task || !task.due) return null;
			const due = new Date(task.due);
			if (Number.isNaN(due.getTime())) return null;
			const kind = taskState(task, now);
			if (kind === 'overdue') {
				const days = Math.max(1, Math.ceil((startOfDay(now).getTime() - startOfDay(due).getTime()) / 86400000));
				return { key: 'task.daysOverdue', params: { days } };
			}
			if (kind === 'today') return { key: 'task.dueToday', params: {} };
			if (kind === 'tomorrow') return { key: 'task.dueTomorrow', params: {} };
			const days = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / 86400000);
			if (days <= 7) return { key: 'task.daysLeft', params: { days } };
			return { key: 'task.dueDate', params: { date: isoDate(due) } };
		}

		function byDue(left, right) {
			const a = left.due ? new Date(left.due).getTime() : Number.MAX_SAFE_INTEGER;
			const b = right.due ? new Date(right.due).getTime() : Number.MAX_SAFE_INTEGER;
```

## 5. R3 缺陷现场（已完成任务仍显示逾期） — client.js:1805-1845

```js
		function TaskRow(props) {
			const { t, task, now, onToggle, onEdit, onDelete, showCourse } = props;
			const kind = taskState(task, now);
			const tier = task.done ? 'normal' : kind === 'overdue' ? 'overdue' : kind === 'today' || kind === 'tomorrow' ? 'due' : 'normal';
			const countdown = taskCountdown(task, now);
			const tone = !task.done && kind === 'overdue' ? ' mc-task-late' : !task.done && (kind === 'today' || kind === 'tomorrow') ? ' mc-task-today' : '';
			const open = onEdit
				? {
					role: 'button',
					tabIndex: 0,
					onClick: () => onEdit(task),
					onKeyDown: (event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							onEdit(task);
						}
					},
				}
				: {};
			return h('article', { className: 'mc-task mc-note', 'data-state': kind, 'data-done': task.done ? 'true' : 'false', 'data-tier': tier },
				h('button', {
					type: 'button',
					className: 'mc-check',
					'aria-pressed': task.done,
					title: t('task.toggle'),
					onClick: () => onToggle(task),
				}, task.done ? ICON_CHECK : null),
				h('div', { className: 'mc-task-body', ...open },
					h('span', { className: 'mc-task-title' }, task.title),
					h('span', { className: 'mc-task-meta' },
						showCourse !== false && task.courseName ? h('span', { className: 'mc-task-course' }, task.courseName) : null,
						countdown ? h('span', { className: 'mc-task-due' + tone }, format(t(countdown.key), countdown.params)) : null)),
				h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-btn-danger', onClick: () => onDelete(task) }, t('delete')));
		}

		function CourseCard(props) {
			const { t, course, entries, tasks, periods, week, folders, now, onEdit, onAddTask, onToggleTask, onEditTask, onDeleteTask, onOpenFiles, notify } = props;
			const [dragging, setDragging] = useState(false);
			const pieces = entries
				.filter((entry) => entry.kind === 'course' && entry.name === course.name && entryInWeek(entry, week))
				.map((entry) => {
```

## 6. daysUntil — client.js:2038-2042

```js
		function daysUntil(deadline, now) {
			const date = dateOfText(deadline);
			if (!date) return null;
			return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86400000);
		}
```

## 7. R2 缺陷现场（预印本判定过宽） — client.js:2044-2070

```js
		function PapersPane(props) {
			const { t, research, busy, onRefresh, onToggleDirection, onKeywords, onToggleSave } = props;
			const [keywordDraft, setKeywordDraft] = useState(research.keywords || '');
			const [savedOnly, setSavedOnly] = useState(false);
			const [openId, setOpenId] = useState(null);
			const [activeTag, setActiveTag] = useState('');
			const saved = research.saved || [];
			const savedIds = new Set(saved.map((item) => item.id));
			const items = savedOnly ? saved : research.items || [];
			const tags = paperTagCounts(items);
			const visible = activeTag ? items.filter((item) => paperTagList(item).indexOf(activeTag) >= 0) : items;
			const fetched = research.fetchedAt ? new Date(research.fetchedAt).toLocaleString() : '';
			const renderMeta = (item) => {
				const authors = Array.isArray(item.authors) ? item.authors : [];
				const shown = authors.slice(0, 3);
				const category = item.primaryCategory || item.category;
				const doiHref = item.doiUrl || (item.doi ? 'https://doi.org/' + item.doi : '');
				const venue = item.venue || (item.arxivId ? t('paper.preprint') : '');
				return h('div', { className: 'mc-paper-meta' },
					item.published ? h('span', { className: 'mc-paper-date' }, item.published) : null,
					venue ? h('span', { className: 'mc-paper-venue', title: t('paper.venue') }, venue) : null,
					category ? h('span', { className: 'mc-badge' }, category) : null,
					item.arxivId ? h('a', { className: 'mc-paper-id', href: item.url, target: '_blank', rel: 'noreferrer' }, item.arxivId) : null,
					doiHref ? h('a', { className: 'mc-paper-doi', href: doiHref, target: '_blank', rel: 'noreferrer' }, t('paper.doi')) : null,
					shown.length > 0
						? h('span', { className: 'mc-paper-authors' }, shown.join(', ') + (authors.length > 3 ? ' ' + format(t('paper.authorsMore'), { count: authors.length - 3 }) : ''))
						: null);
```

## 8. 竞赛面板（要改造成文件夹+规划） — client.js:2129-2168

```js
		function CompetitionsPane(props) {
			const { t, competitions, now, onNew, onEdit, onDelete } = props;
			const list = competitions.slice().sort((left, right) => {
				const a = dateOfText(left.deadline);
				const b = dateOfText(right.deadline);
				if (a && b) return a - b;
				if (a) return -1;
				if (b) return 1;
				return left.name.localeCompare(right.name);
			});
			return h('div', { className: 'mc-competitions' },
				h('div', { className: 'mc-toolbar' },
					h('button', { type: 'button', className: 'mc-btn mc-btn-primary', onClick: () => onNew() }, ICON_PLUS, t('competition.new')),
					h('div', { className: 'mc-spacer' }),
					h('span', { className: 'mc-caption', style: { margin: 0 } }, format(t('competition.count'), { count: list.length }))),
				list.length === 0
					? h('div', { className: 'mc-card', style: { textAlign: 'center', padding: '34px 16px', color: 'var(--dsw-alias-label-tertiary)' } },
						h('p', { style: { margin: 0, fontSize: '13px' } }, t('competition.empty')))
					: h('div', { className: 'mc-competition-list' }, list.map((item) => {
						const left = daysUntil(item.deadline, now);
						const state = left === null ? 'none' : left < 0 ? 'over' : left <= 7 ? 'soon' : 'open';
						return h('div', { key: item.id, className: 'mc-card mc-competition', 'data-state': state },
							h('div', { className: 'mc-competition-head' },
								h('div', { className: 'mc-competition-title' },
									item.link
										? h('a', { href: item.link, target: '_blank', rel: 'noreferrer' }, item.name)
										: h('strong', null, item.name),
									h('span', { className: 'mc-badge' }, item.level),
									h('span', { className: 'mc-badge' }, item.status)),
								h('div', { className: 'mc-row' },
									h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => onEdit(item) }, t('course.edit')),
									h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-btn-danger', onClick: () => onDelete(item) }, t('delete')))),
							h('div', { className: 'mc-competition-meta' },
								item.deadline ? h('span', null, t('competition.deadline') + ' ' + item.deadline) : h('span', null, t('competition.noDeadline')),
								left !== null ? h('span', { className: state === 'over' ? 'mc-task-late' : state === 'soon' ? 'mc-task-today' : '' },
									left < 0 ? format(t('competition.overdue'), { days: Math.abs(left) }) : left === 0 ? t('task.dueToday') : format(t('competition.left'), { days: left })) : null),
							item.note ? h('p', { className: 'mc-competition-note' }, item.note) : null);
					})),
				h('div', { className: 'mc-hint' }, t('competition.hint')));
		}
```

## 9. 现有竞赛 CSS — client.js:1301-1308

```js
			'.mc-competition-list{display:flex;flex-direction:column;gap:10px}',
			'.mc-competition{display:flex;flex-direction:column;gap:6px}',
			'.mc-competition-head{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}',
			'.mc-competition-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;flex:1}',
			'.mc-competition-title strong,.mc-competition-title a{font-size:14px;font-weight:500;line-height:22px;color:var(--dsw-alias-label-primary);text-decoration:none}',
			'.mc-competition-title a:hover{text-decoration:underline}',
			'.mc-competition-meta{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
			'.mc-competition-note{margin:0;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary)}',
```

## 10. 现有竞赛 i18n key（zh 在 270-283，en 在 514-527）

新增 key 必须同前缀 `competition.*` / `folder.*` / `plan.*`，且 zh/en 集合完全相同。

## 11. 必须读取的批次①格式参照

`t1-spec/batch1-spec.md` —— 只读其**章节结构**（§0 锚点 / 字段表 / 判定表 / 验收清单的写法），不要照抄内容。
