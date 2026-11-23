/**
 * Browser half of the "My Courses" bundle.
 *
 * One global sidebar entry (`sidebar.panellist#my-courses`) and the page it
 * opens (`main#my-courses`), with two modules:
 *
 *  1. 我的课表 — always-on week grid: first column is the editable time slot,
 *     header row is Monday…Sunday, cells hold a course or an activity with its
 *     room. Empty cells are click targets; importing a picture asks the Host
 *     (`POST /my-courses/extract`) to transcribe it and applies the result
 *     directly, with a paste-JSON dialog as the fallback.
 *  2. 课程文件 — a tag workbench: a root folder is created automatically, tags
 *     come from the timetable or are added by hand, and each tag collects the
 *     folders that belong to it.
 *
 * All course data is page-local (`localStorage`); folder browsing goes through
 * `ctx.uiWorkspace`.
 */

window.__ModuleLoader__.load({
	id: '@local/my-courses',
	factory(require) {
		const React = require('react');
		const { useCallback, useEffect, useMemo, useRef, useState } = React;
		const h = React.createElement;
		const useSyncExternalStore = React.useSyncExternalStore || function fallbackExternalStore(subscribe, getSnapshot) {
			const [, force] = useState(0);
			useEffect(() => subscribe(() => force((value) => value + 1)), [subscribe]);
			return getSnapshot();
		};

		const NS = 'myCourses';
		const PANEL_ID = 'my-courses';
		const STORAGE_KEY = 'dsh.my-courses.v2';
		const LEGACY_KEY = 'dsh.my-courses.v1';
		const EXTRACT_ROUTE = '/my-courses/extract';
		const ROOT_FOLDER_NAME = '我的课程';
		const DAY_KEYS = ['day.0', 'day.1', 'day.2', 'day.3', 'day.4', 'day.5', 'day.6'];
		const DEFAULT_PERIODS = [
			['第1节', '08:00', '08:45'],
			['第2节', '08:55', '09:40'],
			['第3节', '10:00', '10:45'],
			['第4节', '10:55', '11:40'],
			['第5节', '14:00', '14:45'],
			['第6节', '14:55', '15:40'],
			['第7节', '16:00', '16:45'],
			['第8节', '16:55', '17:40'],
			['第9节', '19:00', '19:45'],
			['第10节', '19:55', '20:40'],
		];

		/* ------------------------------------------------------------------ */
		/* Copy                                                                */
		/* ------------------------------------------------------------------ */

		const ZH = {
			'panel': '我的课程',
			'title': '我的课程',
			'tab.timetable': '我的课表',
			'tab.files': '课程文件',
			'day.0': '周一',
			'day.1': '周二',
			'day.2': '周三',
			'day.3': '周四',
			'day.4': '周五',
			'day.5': '周六',
			'day.6': '周日',
			'corner': '时间段',
			'corner.edit': '点击编辑节次时间',
			'add.entry': '添加安排',
			'edit.entry': '编辑安排',
			'field.kind': '类型',
			'kind.course': '课程',
			'kind.activity': '活动',
			'field.name': '名称',
			'field.room': '教室 / 地点',
			'field.teacher': '老师（可选）',
			'field.note': '备注（可选）',
			'field.day': '星期',
			'field.periods': '节次',
			'save': '保存',
			'cancel': '取消',
			'delete': '删除',
			'confirm': '确定',
			'close': '关闭',
			'retry': '重试',
			'export': '导出 JSON',
			'clear': '清空课表',
			'periods': '节次时间',
			'periods.hint': '表格最左一栏显示这些节次与时间，保存后课表会按新的节次重排。',
			'periods.add': '新增一节',
			'periods.remove': '移除',
			'periods.label': '节次名称',
			'periods.start': '开始',
			'periods.end': '结束',
			'grid.hint': '点任意空格子添加课程或活动；点最左一列的时间可以改节次。',
			'grid.empty': '还没有安排，先加一门课或一个活动吧。',
			'weekend.show': '显示周末',
			'import.image': '导入课表图片',
			'image.title': '课表截图',
			'image.replace': '重新导入',
			'image.remove': '移除图片',
			'image.view': '查看大图',
			'image.imported': '图片已导入，正在识别…',
			'image.tooBig': '这张图片太大，无法保存，请换一张或先压缩。',
			'image.failed': '读取图片失败。',
			'extracting': '正在用当前模型识别课表…',
			'extract.retry': '重新识别',
			'extract.failed': '自动识别没有成功：{message}',
			'extract.noVision': '当前默认模型不支持图片输入。可在设置里换成支持图片的模型，或用粘贴 JSON 的方式。',
			'extract.noServices': '当前环境没有可用的模型或文件服务，已切换到粘贴方式。',
			'extract.unavailable': '自动识别还没生效：重启 DeepSeek Harness 后再试，也可以先用粘贴 JSON。',
			'extract.done': '已识别并导入 {count} 条安排。',
			'ai.open': '粘贴 JSON 导入',
			'ai.title': '粘贴 JSON 生成课表',
			'ai.step1': '导入图片后会自动调用当前默认模型识别，通常不用管这里。',
			'ai.step2': '如果自动识别不理想，可以在对话里把图片发给我，我按格式输出 JSON。',
			'ai.step3': '把 JSON 粘贴到下框，点「导入课表」即可。',
			'ai.copyPrompt': '复制提示词',
			'ai.copied': '提示词已复制',
			'ai.paste': '粘贴 JSON',
			'ai.replace': '替换现有课表（取消勾选则追加）',
			'ai.apply': '导入课表',
			'ai.empty': '请先粘贴 JSON。',
			'ai.invalid': '没有找到可解析的 JSON。',
			'ai.noCourses': 'JSON 里没有 courses 数组。',
			'ai.noUsable': '没有可用的安排，请检查 day 与 periods 字段。',
			'ai.done': '已导入 {count} 条安排。',
			'prompt.name': '名称',
			'entry.delete.confirm': '确定删除这条安排吗？',
			'clear.confirm': '确定清空全部安排吗？（节次时间与图片会保留）',
			'courses.total': '{count} 条安排',
			'folders.total': '{count} 个文件夹',
			'term.select': '学期',
			'term.new': '新建学期',
			'term.edit': '学期设置',
			'term.name': '学期名称',
			'term.start': '开学日期（第 1 周周一）',
			'term.weeks': '总周数',
			'term.hint': '周次由开学日期推算；改了日期或总周数，周次会重新计算。',
			'term.delete': '删除学期',
			'term.delete.confirm': '删除学期「{name}」及其全部安排？',
			'term.needOne': '至少保留一个学期。',
			'term.range': '开学 {start} · 共 {weeks} 周',
			'week.label': '第 {week} 周',
			'week.prev': '上一周',
			'week.next': '下一周',
			'week.now': '回到本周',
			'week.current': '本周',
			'week.hidden': '{count} 条安排不在本周（受周次/单双周限制）',
			'field.weeks': '周次',
			'field.weeks.from': '开始周',
			'field.weeks.to': '结束周',
			'parity.all': '每周',
			'parity.odd': '单周',
			'parity.even': '双周',
			'today.title': '今天',
			'course.credits': '{value} 学分',
			'course.creditsField': '学分',
			'course.edit': '编辑',
			'course.files': '文件夹',
			'course.noClassThisWeek': '本周没有这门课。',
			'course.taskCount': '{count} 个待办',
			'course.moreTasks': '还有 {count} 个未显示',
			'course.dropHere': '把文件拖到这里，直接存进这门课的文件夹',
			'course.needFolder': '先为这门课建一个文件夹（课程文件 → 一键为所有标签建文件夹）。',
			'course.noDrop': '当前浏览器不支持写入文件夹。',
			'course.dropped': '已存入 {count} 个文件。',
			'course.tab': '课程',
			'course.total': '{count} 门课程',
			'course.empty': '还没有课程。先在「我的课表」里加课，或导入一张课表图片。',
			'task.tab': '待办',
			'task.new': '新建 DDL',
			'task.edit': '编辑 DDL',
			'task.toggle': '标记完成',
			'task.title': '内容',
			'task.titlePlaceholder': '高数作业 3',
			'task.course': '所属课程',
			'task.noCourse': '不关联课程',
			'task.due': '截止时间',
			'task.overdue': '已逾期',
			'task.dueToday': '今天到期',
			'task.filterOpen': '未完成 {count}',
			'task.filterDone': '已完成 {count}',
			'task.filterAll': '全部',
			'task.summary': '逾期 {overdue} 项 · 今天到期 {today} 项',
			'task.empty': '还没有待办。点「新建 DDL」加一个。',
			'task.emptyDone': '还没有完成的待办。',
			'task.hint': 'DDL 只存在本机；页面开着时，逾期项会在「待办」和今天卡里标红。',
			'task.daysOverdue': '已逾期 {days} 天',
			'task.dueTomorrow': '明天到期',
			'task.daysLeft': '剩 {days} 天',
			'task.dueDate': '截止 {date}',
			'task.doneOn': '已完成 · {date}',
			'today.tasks': '逾期 {overdue} · 今天 {today}',
			'today.now': '正在上：{name}',
			'today.left': '还剩 {minutes} 分钟',
			'today.next': '下一节：{name}',
			'today.in': '还有 {minutes} 分钟',
			'today.done': '今天的安排都结束了。',
			'today.empty': '今天没有安排。',
			'files.root': '根目录',
			'files.root.none': '正在准备…',
			'files.root.choose': '选择目录',
			'files.root.change': '更换',
			'files.root.hint': '首次进入会自动创建，也可以换成任意目录。',
			'tags': '标签',
			'tags.new': '新建标签',
			'tags.sync': '从课表同步',
			'tags.empty': '还没有标签。可以从课表同步，或新建一个。',
			'tag.empty': '这个标签还没有文件夹。',
			'tag.rename': '重命名',
			'tag.remove': '删除标签',
			'tag.remove.confirm': '删除标签「{name}」？（只删除这里的记录，不会动磁盘上的文件）',
			'tag.newFolder': '新建文件夹',
			'tag.linkFolder': '导入已有文件夹',
			'tag.autoAll': '为所有标签建文件夹',
			'tag.folderName': '文件夹名称',
			'tag.pickFailed': '无法打开目录选择器：{message}',
			'tag.createFailed': '创建文件夹失败：{message}',
			'tag.added': '已创建 {count} 个文件夹。',
			'tag.allHave': '每个标签都已有文件夹了。',
			'tag.needRoot': '还没有可用的根目录。',
			'tags.rootTitle': '课程文件夹',
			'tags.rootCta': '选一个位置，我会在里面新建「我的课程」文件夹；之后每门课一个标签、一个文件夹。',
			'tags.createRoot': '选择位置并创建',
			'tags.useRoot': '直接使用已有文件夹',
			'tags.rootCreated': '根目录已就绪：{name}',
			'tags.linkOnly': '这个浏览器不支持创建/浏览文件夹，可以绑定已有文件夹（只能显示路径）。',
			'tag.noCreate': '当前环境无法创建文件夹，请用「导入已有文件夹」。',
			'folder.pathMode': '这个文件夹只能记录路径（当前浏览器不支持浏览其内容）。',
			'folder.notAllowed': '需要你授权访问这个文件夹。',
			'folder.grant': '授权并浏览',
			'folder.emptyList': '这个文件夹是空的。',
			'folder.newFile': '新建文件',
			'file.open': '打开',
			'file.loading': '读取中…',
			'file.save': '保存',
			'file.saved': '已保存',
			'file.unsaved': '有未保存的修改',
			'file.delete': '删除文件',
			'file.openTab': '新标签打开',
			'file.download': '下载副本',
			'file.meta': '{type} · {size}',
			'paper.tab': '论文',
			'paper.directions': '方向',
			'paper.keywords': '关键词（可留空，空格分隔）',
			'paper.refresh': '刷新推送',
			'paper.fetching': '获取中…',
			'paper.empty': '还没有推送。选几个方向，点「刷新推送」抓取 arXiv 最新论文。',
			'paper.emptySaved': '还没有收藏的论文。点论文上的「收藏」即可。',
			'paper.allCount': '最新 {count}',
			'paper.savedCount': '收藏 {count}',
			'paper.fetchedAt': '上次更新：{time}',
			'paper.save': '收藏',
			'paper.unsave': '取消收藏',
			'paper.pdf': 'PDF',
			'paper.more': '展开摘要',
			'paper.less': '收起',
			'paper.hint': '论文来自 arXiv 公开接口，需要联网；只按方向和关键词做最新推送，不做全文检索。',
			'paper.needFilter': '至少选一个方向，或填一个关键词。',
			'paper.done': '已更新 {count} 篇。',
			'paper.failed': '获取失败：{message}',
			'paper.venue': '发表',
			'paper.preprint': 'arXiv 预印本',
			'paper.doi': 'DOI',
			'paper.authorsMore': '等 {count} 人',
			'paper.tags': '标签',
			'paper.tagEmpty': '刷新后按分类与主题生成标签',
			'paper.emptyFiltered': '没有命中该标签的论文',
			'competition.tab': '竞赛',
			'competition.new': '新建竞赛',
			'competition.edit': '编辑竞赛',
			'competition.name': '竞赛名称',
			'competition.level': '级别',
			'competition.status': '状态',
			'competition.deadline': '截止',
			'competition.noDeadline': '未设截止',
			'competition.link': '链接',
			'competition.count': '共 {count} 项',
			'competition.empty': '还没有竞赛。点「新建竞赛」记录报名信息、截止时间和官网链接。',
			'competition.hint': '竞赛只存在本机；临近截止（7 天内）会标黄，过期标红。',
			'competition.left': '还有 {days} 天',
			'competition.overdue': '已过期 {days} 天',
			'competition.folder.new': '新建文件夹',
			'competition.folder.edit': '重命名文件夹',
			'competition.folder.name': '文件夹名称',
			'competition.folder.moveTo': '所属文件夹',
			'competition.folder.ungrouped': '未分组',
			'competition.folder.count': '共 {count} 个文件夹',
			'competition.folder.competitions': '{count} 项竞赛',
			'competition.folder.none': '还没有文件夹。新建一个，把竞赛归类后就能给每个文件夹挂学习规划。',
			'competition.folder.noCompetition': '这个文件夹还没有竞赛。点「新建竞赛」，它会自动归到当前文件夹。',
			'competition.folder.ungroupedPlanHint': '未分组不是文件夹。把竞赛归入某个文件夹后，就可以添加学习规划。',
			'competition.folder.deleteConfirm': '「{name}」里的 {count} 项竞赛会移入未分组，这个文件夹的学习规划会一并删除。',
			'competition.folder.up': '上移',
			'competition.folder.down': '下移',
			'competition.folder.nextMilestone': '下一里程碑',
			'plan.tab': '学习规划',
			'plan.view.items': '清单',
			'plan.view.milestones': '里程碑',
			'plan.view.timeline': '时间线',
			'plan.empty': '这个文件夹还没有学习规划。先写一条清单，或者定一个里程碑。',
			'plan.items.empty': '清单还是空的。把要做的事一条条写下来。',
			'plan.timeline.empty': '时间线还是空的。加一条带上日期的安排。',
			'plan.milestones.empty': '还没有里程碑。在时间线里把类型选成「里程碑」即可，不用另外维护一份。',
			'plan.newItem': '新建清单项',
			'plan.itemPlaceholder': '例如：整理近三年真题',
			'plan.newEntry': '新建时间轴条目',
			'plan.newMilestone': '新建里程碑',
			'plan.field.title': '标题',
			'plan.field.date': '日期',
			'plan.field.kind': '类型',
			'plan.kind.milestone': '里程碑',
			'plan.kind.step': '步骤',
			'plan.noDate': '未定日期',
			'plan.doneOn': '已完成 · {date}',
			'plan.progress': '里程碑 {done}/{total}',
			'plan.noUpcoming': '暂无待办里程碑',
			'plan.singleSource': '里程碑来自时间线，改时间线就够',
			'plan.linkedCompetition': '关联竞赛',
			'plan.none': '未关联',
			'folder.browse': '浏览',
			'folder.hide': '收起',
			'folder.remove': '移除',
			'folder.removed': '已移除。',
			'folder.newSub': '新建子文件夹',
			'folder.up': '上一级',
			'folder.loading': '读取中…',
			'folder.noSub': '这个文件夹下还没有子文件夹。',
			'folder.truncated': '条目过多，只显示了一部分。',
			'folder.count': '共 {count} 个子文件夹',
			'folder.noService': '当前环境没有可用的目录服务。',
			'folder.listFailed': '读取目录失败：{message}',
			'folder.createFailed': '创建子文件夹失败：{message}',
			'time': '时间',
			'push.tab': '推送',
			'push.title': '今日推送',
			'push.subtitle': '按你的专业与方向，每天挑一次',
			'push.refresh': '立即刷新',
			'push.running': '正在抓取…',
			'push.done': '已更新 {count} 条',
			'push.partial': '部分来源失败（{source}），已更新 {count} 条',
			'push.failed': '推送失败：{error}',
			'push.allFailed': '三个来源都没连上，稍后自动重试',
			'push.retry': '重试失败来源',
			'push.neverRun': '还没跑过',
			'push.lastRun': '上次：{day}',
			'push.empty': '今天没有够格的条目',
			'push.emptyHint': '可以再多选一个方向，或加一个关键词',
			'push.needProfile': '先设置专业和方向，才会开始每日推送',
			'push.gotoProfile': '去设置',
			'push.score': '匹配分',
			'push.source.paper': '论文',
			'push.source.news': '新闻',
			'push.source.github': '仓库',
			'push.sourceFailed': '{source} 来源失败：{error}',
			'push.rateLimited': 'GitHub 触发限流，稍后自动重试',
			'push.unread': '{count} 条未读',
			'push.markSeen': '全部标为已读',
			'push.reason.direction': '命中方向',
			'push.reason.keyword': '命中关键词',
			'push.reason.fresh': '近期发布',
			'push.reason.hot': '社区热度高',
			'push.reason.ccf': 'CCF 论文',
			'profile.title': '我的专业与方向',
			'profile.hint': '存放在本机，只用来筛选推荐',
			'profile.major': '专业',
			'profile.majorCustom': '自定义专业名',
			'profile.directions': '关注方向',
			'profile.directionsHint': '最多选 4 个',
			'profile.custom': '自定义方向',
			'profile.customAdd': '添加',
			'profile.customRemove': '删除',
			'profile.keywords': '追加关键词',
			'profile.keywordsHint': '空格分隔，最多生效 4 个',
			'profile.save': '保存',
			'profile.saved': '已保存',
			'profile.failed': '保存失败，本机存储不可写',
			'profile.reset': '恢复默认',
			'profile.limit': '最多 {count} 个',
			'major.cs': '计算机 / 软件',
			'major.ai': '人工智能',
			'major.ee': '电子 / 通信',
			'major.me': '机械 / 自动化',
			'major.bio': '生物 / 医学',
			'major.math': '数学 / 统计',
			'major.econ': '经管 / 金融',
			'major.custom': '自定义',
			'dir.cs.CL': '自然语言处理 / LLM',
			'dir.cs.AI': '人工智能',
			'dir.cs.LG': '机器学习',
			'dir.cs.CV': '计算机视觉',
			'dir.cs.CR': '安全与隐私',
			'dir.cs.RO': '机器人',
			'dir.cs.DB': '数据库',
			'dir.cs.DC': '分布式与系统',
			'dir.cs.SE': '软件工程',
			'dir.cs.HC': '人机交互',
			'dir.cs.CY': '计算与社会',
			'dir.stat.ML': '统计机器学习',
			/* 批次④ 论文工作台 */
			'wb.open': '工作台',
			'wb.openTitle': '打开论文工作台：左边英文全文，右边中文解读，可实时提问',
			'wb.title': '论文工作台',
			'wb.close': '关闭',
			'wb.original': '原文',
			'wb.copyRef': '复制引用',
			'wb.copied': '已复制',
			'wb.copyFailed': '复制失败，请手动选择文本',
			'wb.tabGuide': '中文解读',
			'wb.tabChat': '提问',
			'wb.loadFailed': '全文抓取失败：{code}',
			'wb.loadFailedHint': '这篇论文可能没有 arXiv HTML 版；点「原文」直接看 PDF。',
			'wb.emptyText': '没有解析到正文段落，点「原文」查看。',
			'wb.end': '全文结束',
			'wb.tooLong': '已截断',
			'wb.cached': '本地缓存',
			'wb.guideTitle': '导读',
			'wb.guideRunning': '正在生成导读…',
			'wb.guideEmpty': '还没有解读，点下面按钮生成。',
			'wb.guideNoAbstract': '这一篇没有可用的摘要或正文开头，暂时生成不了导读。',
			'wb.guideHint': '导读与讲解用你的默认模型生成，会消耗额度。',
			'wb.reguide': '重新生成导读',
			'wb.view': '阅读视图',
			'wb.viewBi': '对照',
			'wb.viewZh': '仅译文',
			'wb.viewEn': '仅原文',
			'wb.export': '导出 MD',
			'wb.exported': '已导出 Markdown 文件',
			'wb.exportFailed': '导出失败，浏览器拦住了下载',
			'wb.align': '逐段对照',
			'wb.realign': '重新对照',
			'wb.aligning': '正在逐段对照',
			'wb.alignFailed': '未能逐段对齐，已退回整节译文',
			'wb.alignHint': '只把本节的段落发给模型，按 [n] 校验段数后再逐段并排',
			'wb.noteAdd': '记笔记',
			'wb.notePlaceholder': '写点自己的理解、疑问或可复现的要点…',
			'wb.noteSave': '保存笔记',
			'wb.noteCancel': '取消',
			'wb.noteEmpty': '还没有笔记。点原文段落旁的「记笔记」就能钉在这里。',
			'wb.noteDelete': '删除',
			'wb.noteEditLabel': '编辑',
			'wb.noteHint': '笔记只存在本机这份课程数据里，导出 Markdown 时会一起带上。',
			'wb.tabNotes': '笔记',
			'wb.glossary': '术语表',
			'wb.glossaryTitle': '我的术语表',
			'wb.glossaryHint': '每行一条，用 = 或 ： 分开。原文出现左侧词时，模型会优先用右侧译名。',
			'wb.glossarySave': '保存术语表',
			'wb.glossarySaved': '术语表已保存（{count} 条）',
			'wb.glossaryEmpty': '暂无术语，上面输入框可以直接写',
			'wb.askScope': '提问范围',
			'wb.scopeAll': '全篇',
			'wb.scopeSection': '本节',
			'wb.scopeNoSection': '先选中一节',
			'wb.citeJump': '跳到原文这一段',
			'wb.streaming': '生成中…',
			'wb.failed': '生成失败（{code}）',
			'wb.noModel': '未配置可用模型：解读与提问暂不可用，全文仍可阅读。',
			'wb.noHtml': '这篇论文没有可解析的 HTML 全文。',
			'wb.timeout': '生成超时，请重试。',
			'wb.aborted': '已取消',
			'wb.truncated': '模型输出被长度上限截断，已保留生成的部分。',
			'wb.sectionExplain': '解读本节',
			'wb.sectionShort': '本节内容太短，改用段落的「读不懂这段」更合适。',
			'wb.paraExplain': '读不懂这段',
			'wb.toc': '目录',
			'wb.askPlaceholder': '问点什么：Enter 发送，Shift+Enter 换行',
			'wb.askSend': '发送',
			'wb.askHint': '回答只依据全文，会标【§小节】；不超过 350 字。',
			'wb.askEmpty': '还没有对话，先问一句吧。',
			'wb.askThinking': '正在读原文…',
			'wb.askTooLong': '问题太长了，精简一下。',
			'wb.busy': '还在生成上一段，稍等。',
			'wb.noTextBody': '还没拿到全文，先等左边加载完。',
			/* batch 5 workbench library + pdf import + ccf */
			'wb.tab': '工作台',
			'wb.libTitle': '论文资料库',
			'wb.libHint': '导入 PDF 或从「论文」里点「工作台」，全文和中文解读都会留在这里。',
			'wb.import': '导入 PDF',
			'wb.importing': '正在解析 PDF…',
			'wb.importHint': '需要文本层 PDF（扫描件不行），单个 ≤ 8 MB，一次最多 5 个。',
			'wb.importDone': '已导入 {n} 篇',
			'wb.importSkipped': '已跳过 {n} 个：{reason}',
			'wb.importFailed': '导入失败：{code}',
			'wb.pdfNoText': '这个 PDF 没有文本层，多半是扫描件；工作台只能读文字，所以先跳过了。',
			'wb.pdfEncrypted': '这个 PDF 有密码保护，读不出来。',
			'wb.pdfTooLarge': '文件超过 8 MB，没有导入。',
			'wb.pdfNotCached': '这篇 PDF 的解析结果已过期，重新导入一次即可。',
			'wb.pdfParseFailed': 'PDF 结构解析失败，文件可能已损坏。',
			'wb.libEmpty': '资料库还是空的。导入一个 PDF，或去「论文」点「工作台」。',
			'wb.libOpen': '继续阅读',
			'wb.libRemove': '移除',
			'wb.libRemoved': '已从资料库移除',
			'wb.lastOpened': '最近打开',
			'wb.kindPdf': 'PDF',
			'wb.kindArxiv': 'arXiv',
			'wb.untitled': '未命名论文',
			'wb.ccfTitle': 'CCF 分级',
			'wb.ccfA': '只看 CCF-A',
			'wb.ccfRated': '只看已分级',
			'wb.ccfAll': '不限',
			'wb.ccfNone': '未分级',
			'wb.ccfNote': '按会议/期刊名离线匹配 CCF 目录，认不出来就不标，不猜。',
			'wb.pageTitleHint': '左侧英文全文，右侧中文解读；随时提问。',
		};

		const EN = {
			'panel': 'My Courses',
			'title': 'My Courses',
			'tab.timetable': 'Timetable',
			'tab.files': 'Course files',
			'day.0': 'Mon',
			'day.1': 'Tue',
			'day.2': 'Wed',
			'day.3': 'Thu',
			'day.4': 'Fri',
			'day.5': 'Sat',
			'day.6': 'Sun',
			'corner': 'Time',
			'corner.edit': 'Click to edit period times',
			'add.entry': 'Add entry',
			'edit.entry': 'Edit entry',
			'field.kind': 'Kind',
			'kind.course': 'Course',
			'kind.activity': 'Activity',
			'field.name': 'Name',
			'field.room': 'Room',
			'field.teacher': 'Teacher (optional)',
			'field.note': 'Note (optional)',
			'field.day': 'Weekday',
			'field.periods': 'Periods',
			'save': 'Save',
			'cancel': 'Cancel',
			'delete': 'Delete',
			'confirm': 'OK',
			'close': 'Close',
			'retry': 'Retry',
			'export': 'Export JSON',
			'clear': 'Clear timetable',
			'periods': 'Period times',
			'periods.hint': 'The first column shows these periods; saving relayouts the grid.',
			'periods.add': 'Add period',
			'periods.remove': 'Remove',
			'periods.label': 'Label',
			'periods.start': 'Start',
			'periods.end': 'End',
			'grid.hint': 'Click an empty cell to add a course or activity; click the time column to edit periods.',
			'grid.empty': 'Nothing scheduled yet — add a course or an activity.',
			'weekend.show': 'Show weekend',
			'import.image': 'Import timetable picture',
			'image.title': 'Timetable picture',
			'image.replace': 'Import again',
			'image.remove': 'Remove',
			'image.view': 'View',
			'image.imported': 'Picture imported, reading it…',
			'image.tooBig': 'This picture is too large to store; try a smaller one.',
			'image.failed': 'Could not read that picture.',
			'extracting': 'Reading the timetable with the current model…',
			'extract.retry': 'Read again',
			'extract.failed': 'Automatic reading failed: {message}',
			'extract.noVision': 'The default model cannot take images. Pick a vision-capable model, or use the paste JSON dialog.',
			'extract.noServices': 'No model or attachment service here; using the paste dialog instead.',
			'extract.unavailable': 'Automatic reading is not active yet: restart DeepSeek Harness, or use the paste JSON dialog.',
			'extract.done': 'Read and imported {count} entries.',
			'ai.open': 'Paste JSON',
			'ai.title': 'Paste JSON to build the timetable',
			'ai.step1': 'Importing a picture already calls the current default model; this dialog is the fallback.',
			'ai.step2': 'If automatic reading misses entries, send the picture in chat and I answer with JSON.',
			'ai.step3': 'Paste that JSON below and press Import.',
			'ai.copyPrompt': 'Copy prompt',
			'ai.copied': 'Prompt copied',
			'ai.paste': 'Paste JSON',
			'ai.replace': 'Replace the current timetable',
			'ai.apply': 'Import',
			'ai.empty': 'Paste the JSON first.',
			'ai.invalid': 'No JSON object found in that text.',
			'ai.noCourses': 'The JSON has no courses array.',
			'ai.noUsable': 'No usable entry: check the day and periods fields.',
			'ai.done': 'Imported {count} entries.',
			'prompt.name': 'Name',
			'entry.delete.confirm': 'Delete this entry?',
			'clear.confirm': 'Clear every entry? (period times and the picture stay)',
			'courses.total': '{count} entries',
			'folders.total': '{count} folders',
			'term.select': 'Term',
			'term.new': 'New term',
			'term.edit': 'Term settings',
			'term.name': 'Term name',
			'term.start': 'First day (Monday of week 1)',
			'term.weeks': 'Total weeks',
			'term.hint': 'The week number follows the first day; changing it or the total renumbers weeks.',
			'term.delete': 'Delete term',
			'term.delete.confirm': 'Delete term "{name}" and all its entries?',
			'term.needOne': 'Keep at least one term.',
			'term.range': 'Starts {start} · {weeks} weeks',
			'week.label': 'Week {week}',
			'week.prev': 'Previous week',
			'week.next': 'Next week',
			'week.now': 'Back to this week',
			'week.current': 'This week',
			'week.hidden': '{count} entries are outside this week (week range or odd/even)',
			'field.weeks': 'Weeks',
			'field.weeks.from': 'From week',
			'field.weeks.to': 'To week',
			'parity.all': 'Every week',
			'parity.odd': 'Odd weeks',
			'parity.even': 'Even weeks',
			'today.title': 'Today',
			'course.credits': '{value} credits',
			'course.creditsField': 'Credits',
			'course.edit': 'Edit',
			'course.files': 'Folder',
			'course.noClassThisWeek': 'No class this week.',
			'course.taskCount': '{count} open',
			'course.moreTasks': '{count} more not shown',
			'course.dropHere': 'Drop files here to save them into this course folder',
			'course.needFolder': 'Create a folder for this course first (Course files → create folders for all tags).',
			'course.noDrop': 'This browser cannot write into folders.',
			'course.dropped': 'Saved {count} files.',
			'course.tab': 'Courses',
			'course.total': '{count} courses',
			'course.empty': 'No course yet. Add one in the Timetable tab or import a timetable picture.',
			'task.tab': 'To-dos',
			'task.new': 'New deadline',
			'task.edit': 'Edit deadline',
			'task.toggle': 'Toggle done',
			'task.title': 'What',
			'task.titlePlaceholder': 'Calculus assignment 3',
			'task.course': 'Course',
			'task.noCourse': 'No course',
			'task.due': 'Due',
			'task.overdue': 'Overdue',
			'task.dueToday': 'Due today',
			'task.filterOpen': 'Open {count}',
			'task.filterDone': 'Done {count}',
			'task.filterAll': 'All',
			'task.summary': '{overdue} overdue · {today} due today',
			'task.empty': 'No to-do yet. Press "New deadline".',
			'task.emptyDone': 'Nothing completed yet.',
			'task.hint': 'To-dos live on this machine; while the page is open, overdue items are marked in the To-dos tab and the Today card.',
			'task.daysOverdue': '{days}d overdue',
			'task.dueTomorrow': 'Due tomorrow',
			'task.daysLeft': '{days}d left',
			'task.dueDate': 'Due {date}',
			'task.doneOn': 'Done · {date}',
			'today.tasks': 'Overdue {overdue} · Today {today}',
			'today.now': 'In class: {name}',
			'today.left': '{minutes} min left',
			'today.next': 'Next: {name}',
			'today.in': 'in {minutes} min',
			'today.done': 'Everything for today has ended.',
			'today.empty': 'Nothing scheduled today.',
			'files.root': 'Root folder',
			'files.root.none': 'Preparing…',
			'files.root.choose': 'Choose folder',
			'files.root.change': 'Change',
			'files.root.hint': 'Created automatically on first use; any directory can replace it.',
			'tags': 'Tags',
			'tags.new': 'New tag',
			'tags.sync': 'Sync from timetable',
			'tags.empty': 'No tag yet. Sync from the timetable or create one.',
			'tag.empty': 'This tag has no folder yet.',
			'tag.rename': 'Rename',
			'tag.remove': 'Delete tag',
			'tag.remove.confirm': 'Delete tag "{name}"? (only this record; files on disk stay)',
			'tag.newFolder': 'New folder',
			'tag.linkFolder': 'Link existing folder',
			'tag.autoAll': 'Create folders for all tags',
			'tag.folderName': 'Folder name',
			'tag.pickFailed': 'Could not open the folder picker: {message}',
			'tag.createFailed': 'Could not create the folder: {message}',
			'tag.added': 'Created {count} folders.',
			'tag.allHave': 'Every tag already has a folder.',
			'tag.needRoot': 'No root folder yet.',
			'tags.rootTitle': 'Course folders',
			'tags.rootCta': 'Pick a location and I create a "我的课程" folder there; afterwards each course has one tag and one folder.',
			'tags.createRoot': 'Pick location and create',
			'tags.useRoot': 'Use an existing folder',
			'tags.rootCreated': 'Root folder ready: {name}',
			'tags.linkOnly': 'This browser cannot create or browse folders; you can link existing folders by path only.',
			'tag.noCreate': 'This environment cannot create folders; use "Link existing folder".',
			'folder.pathMode': 'Only the path is recorded (this browser cannot browse the folder).',
			'folder.notAllowed': 'Permission to open this folder is required.',
			'folder.grant': 'Grant and browse',
			'folder.emptyList': 'This folder is empty.',
			'folder.newFile': 'New file',
			'file.open': 'Open',
			'file.loading': 'Loading…',
			'file.save': 'Save',
			'file.saved': 'Saved',
			'file.unsaved': 'Unsaved changes',
			'file.delete': 'Delete file',
			'file.openTab': 'Open in a tab',
			'file.download': 'Download a copy',
			'file.meta': '{type} · {size}',
			'paper.tab': 'Papers',
			'paper.directions': 'Directions',
			'paper.keywords': 'Keywords (optional, space separated)',
			'paper.refresh': 'Refresh feed',
			'paper.fetching': 'Fetching…',
			'paper.empty': 'No feed yet. Pick directions and press "Refresh feed" to pull the newest arXiv papers.',
			'paper.emptySaved': 'No saved paper yet. Press "Save" on a paper.',
			'paper.allCount': 'Latest {count}',
			'paper.savedCount': 'Saved {count}',
			'paper.fetchedAt': 'Updated {time}',
			'paper.save': 'Save',
			'paper.unsave': 'Unsave',
			'paper.pdf': 'PDF',
			'paper.more': 'Show abstract',
			'paper.less': 'Hide',
			'paper.hint': 'Papers come from the public arXiv API and need network access; this is a newest-first feed, not full-text search.',
			'paper.needFilter': 'Pick at least one direction, or type a keyword.',
			'paper.done': 'Updated {count} papers.',
			'paper.failed': 'Fetch failed: {message}',
			'paper.venue': 'Published in',
			'paper.preprint': 'arXiv preprint',
			'paper.doi': 'DOI',
			'paper.authorsMore': '+{count} more',
			'paper.tags': 'Tags',
			'paper.tagEmpty': 'Tags appear after refresh',
			'paper.emptyFiltered': 'No papers match this tag',
			'competition.tab': 'Competitions',
			'competition.new': 'New competition',
			'competition.edit': 'Edit competition',
			'competition.name': 'Name',
			'competition.level': 'Level',
			'competition.status': 'Status',
			'competition.deadline': 'Due',
			'competition.noDeadline': 'No deadline',
			'competition.link': 'Link',
			'competition.count': '{count} in total',
			'competition.empty': 'No competition yet. Record the entry, the deadline, and the official link.',
			'competition.hint': 'Competitions live on this machine; a deadline within 7 days is marked amber and a passed one red.',
			'competition.left': '{days} days left',
			'competition.overdue': '{days} days overdue',
			'competition.folder.new': 'New folder',
			'competition.folder.edit': 'Rename folder',
			'competition.folder.name': 'Folder name',
			'competition.folder.moveTo': 'Folder',
			'competition.folder.ungrouped': 'Ungrouped',
			'competition.folder.count': '{count} folders',
			'competition.folder.competitions': '{count} competitions',
			'competition.folder.none': 'No folder yet. Create one to group competitions and attach a study plan to each.',
			'competition.folder.noCompetition': 'No competition in this folder yet. Create one and it lands here.',
			'competition.folder.ungroupedPlanHint': 'Ungrouped is not a folder. Move the competition into one to attach a study plan.',
			'competition.folder.deleteConfirm': 'The {count} competition(s) in "{name}" move to Ungrouped, and this folder\'s study plan is deleted.',
			'competition.folder.up': 'Move up',
			'competition.folder.down': 'Move down',
			'competition.folder.nextMilestone': 'Next milestone',
			'plan.tab': 'Study plan',
			'plan.view.items': 'Checklist',
			'plan.view.milestones': 'Milestones',
			'plan.view.timeline': 'Timeline',
			'plan.empty': 'No study plan yet. Add a checklist item or set a milestone.',
			'plan.items.empty': 'The checklist is empty. Write down what needs doing.',
			'plan.timeline.empty': 'The timeline is empty. Add an entry with a date.',
			'plan.milestones.empty': 'No milestone yet. Set an entry\'s type to milestone on the timeline — there is no second copy to maintain.',
			'plan.newItem': 'New checklist item',
			'plan.itemPlaceholder': 'e.g. collect past papers',
			'plan.newEntry': 'New timeline entry',
			'plan.newMilestone': 'New milestone',
			'plan.field.title': 'Title',
			'plan.field.date': 'Date',
			'plan.field.kind': 'Type',
			'plan.kind.milestone': 'Milestone',
			'plan.kind.step': 'Step',
			'plan.noDate': 'No date',
			'plan.doneOn': 'Done · {date}',
			'plan.progress': 'Milestones {done}/{total}',
			'plan.noUpcoming': 'No upcoming milestone',
			'plan.singleSource': 'Milestones come from the timeline — edit it there',
			'plan.linkedCompetition': 'Linked competition',
			'plan.none': 'Unlinked',
			'folder.browse': 'Browse',
			'folder.hide': 'Hide',
			'folder.remove': 'Remove',
			'folder.removed': 'Removed.',
			'folder.newSub': 'New sub-folder',
			'folder.up': 'Up',
			'folder.loading': 'Loading…',
			'folder.noSub': 'No sub-folder here.',
			'folder.truncated': 'Too many entries; only some are shown.',
			'folder.count': '{count} sub-folders',
			'folder.noService': 'No directory service is available here.',
			'folder.listFailed': 'Could not read the folder: {message}',
			'folder.createFailed': 'Could not create the sub-folder: {message}',
			'time': 'Time',
			'push.tab': 'Feed',
			'push.title': 'Today\'s picks',
			'push.subtitle': 'Picked once a day for your major & directions',
			'push.refresh': 'Refresh now',
			'push.running': 'Fetching…',
			'push.done': 'Updated {count} items',
			'push.partial': 'Some sources failed ({source}), {count} items updated',
			'push.failed': 'Feed failed: {error}',
			'push.allFailed': 'All three sources failed, retrying later',
			'push.retry': 'Retry failed sources',
			'push.neverRun': 'Not run yet',
			'push.lastRun': 'Last run: {day}',
			'push.empty': 'Nothing passed the bar today',
			'push.emptyHint': 'Try adding a direction or a keyword',
			'push.needProfile': 'Set your major and directions to start the daily feed',
			'push.gotoProfile': 'Set up',
			'push.score': 'Score',
			'push.source.paper': 'Paper',
			'push.source.news': 'News',
			'push.source.github': 'Repo',
			'push.sourceFailed': '{source} source failed: {error}',
			'push.rateLimited': 'GitHub rate limit hit, will retry later',
			'push.unread': '{count} unread',
			'push.markSeen': 'Mark all read',
			'push.reason.direction': 'Matches your directions',
			'push.reason.keyword': 'Contains your keywords',
			'push.reason.fresh': 'Published recently',
			'push.reason.hot': 'Popular',
			'push.reason.ccf': 'CCF venue',
			'profile.title': 'My major & directions',
			'profile.hint': 'Stored locally, only used to filter picks',
			'profile.major': 'Major',
			'profile.majorCustom': 'Custom major',
			'profile.directions': 'Directions',
			'profile.directionsHint': 'Up to 4',
			'profile.custom': 'Custom direction',
			'profile.customAdd': 'Add',
			'profile.customRemove': 'Remove',
			'profile.keywords': 'Extra keywords',
			'profile.keywordsHint': 'Space separated, first 4 count',
			'profile.save': 'Save',
			'profile.saved': 'Saved',
			'profile.failed': 'Save failed, local storage is not writable',
			'profile.reset': 'Reset',
			'profile.limit': 'Up to {count}',
			'major.cs': 'Computer science',
			'major.ai': 'Artificial intelligence',
			'major.ee': 'Electronics',
			'major.me': 'Mechanical engineering',
			'major.bio': 'Bio & medicine',
			'major.math': 'Math & statistics',
			'major.econ': 'Econ & finance',
			'major.custom': 'Custom',
			'dir.cs.CL': 'NLP / LLM',
			'dir.cs.AI': 'AI',
			'dir.cs.LG': 'Machine learning',
			'dir.cs.CV': 'Computer vision',
			'dir.cs.CR': 'Security & privacy',
			'dir.cs.RO': 'Robotics',
			'dir.cs.DB': 'Databases',
			'dir.cs.DC': 'Distributed systems',
			'dir.cs.SE': 'Software engineering',
			'dir.cs.HC': 'HCI',
			'dir.cs.CY': 'Computing & society',
			'dir.stat.ML': 'Statistical ML',
			/* batch 4 paper workbench */
			'wb.open': 'Workbench',
			'wb.openTitle': 'Open the paper workbench: English full text on the left, Chinese notes on the right, ask anytime',
			'wb.title': 'Paper workbench',
			'wb.close': 'Close',
			'wb.original': 'Original',
			'wb.copyRef': 'Copy citation',
			'wb.copied': 'Copied',
			'wb.copyFailed': 'Copy failed; select the text manually',
			'wb.tabGuide': 'Chinese notes',
			'wb.tabChat': 'Ask',
			'wb.loadFailed': 'Could not fetch the full text: {code}',
			'wb.loadFailedHint': 'This paper may have no arXiv HTML build; open the original PDF instead.',
			'wb.emptyText': 'No body paragraphs were parsed; open the original instead.',
			'wb.end': 'end of full text',
			'wb.tooLong': 'truncated',
			'wb.cached': 'cached',
			'wb.guideTitle': 'Guided reading',
			'wb.guideRunning': 'Writing the guide…',
			'wb.guideEmpty': 'No notes yet; generate them below.',
			'wb.guideNoAbstract': 'This paper has no abstract or opening text to summarise yet.',
			'wb.guideHint': 'Notes and explanations use your default model and consume quota.',
			'wb.reguide': 'Regenerate guide',
			'wb.view': 'Reading view',
			'wb.viewBi': 'Bilingual',
			'wb.viewZh': 'Translation only',
			'wb.viewEn': 'Original only',
			'wb.export': 'Export MD',
			'wb.exported': 'Markdown file exported',
			'wb.exportFailed': 'Export failed — the browser blocked the download',
			'wb.align': 'Align paragraphs',
			'wb.realign': 'Realign',
			'wb.aligning': 'Aligning paragraphs',
			'wb.alignFailed': 'Paragraph alignment failed, fell back to the whole section',
			'wb.alignHint': 'Sends only this section’s paragraphs and verifies each [n] line before pairing',
			'wb.noteAdd': 'Note',
			'wb.notePlaceholder': 'Your own takeaway, a question, or a reproduction detail…',
			'wb.noteSave': 'Save note',
			'wb.noteCancel': 'Cancel',
			'wb.noteEmpty': 'No notes yet. Use “Note” next to a paragraph to pin one here.',
			'wb.noteDelete': 'Delete',
			'wb.noteEditLabel': 'Edit',
			'wb.noteHint': 'Notes live in this local course file and are included when you export Markdown.',
			'wb.tabNotes': 'Notes',
			'wb.glossary': 'Glossary',
			'wb.glossaryTitle': 'My glossary',
			'wb.glossaryHint': 'One entry per line, split with = or ：. Your right-hand name wins when the source term appears.',
			'wb.glossarySave': 'Save glossary',
			'wb.glossarySaved': 'Glossary saved ({count} entries)',
			'wb.glossaryEmpty': 'No terms yet — type them in the box above',
			'wb.askScope': 'Scope',
			'wb.scopeAll': 'Whole paper',
			'wb.scopeSection': 'This section',
			'wb.scopeNoSection': 'Pick a section first',
			'wb.citeJump': 'Jump to that paragraph',
			'wb.streaming': 'Streaming…',
			'wb.failed': 'Generation failed ({code})',
			'wb.noModel': 'No model is configured: notes and questions are unavailable, reading still works.',
			'wb.noHtml': 'This paper has no parseable HTML full text.',
			'wb.timeout': 'Generation timed out; try again.',
			'wb.aborted': 'Cancelled',
			'wb.truncated': 'The model hit its length cap; the generated part is kept.',
			'wb.sectionExplain': 'Explain section',
			'wb.sectionShort': 'This section is too short; use “Explain this paragraph” instead.',
			'wb.paraExplain': 'Explain this paragraph',
			'wb.toc': 'Contents',
			'wb.askPlaceholder': 'Ask something — Enter sends, Shift+Enter adds a line',
			'wb.askSend': 'Send',
			'wb.askHint': 'Answers use only the full text, cite 【§section】, and stay under 350 characters.',
			'wb.askEmpty': 'No conversation yet; ask the first question.',
			'wb.askThinking': 'Reading the paper…',
			'wb.askTooLong': 'Question is too long; trim it down.',
			'wb.busy': 'Still generating the previous piece; one moment.',
			'wb.noTextBody': 'No full text yet; wait for the left pane to load.',
			/* batch 5 workbench library + pdf import + ccf */
			'wb.tab': 'Workbench',
			'wb.libTitle': 'Paper library',
			'wb.libHint': 'Import a PDF, or open any paper from the Papers tab; full text and Chinese notes stay here.',
			'wb.import': 'Import PDF',
			'wb.importing': 'Parsing PDF…',
			'wb.importHint': 'Text-layer PDFs only (no scans), 8 MB each, up to 5 at a time.',
			'wb.importDone': 'Imported {n}',
			'wb.importSkipped': 'Skipped {n}: {reason}',
			'wb.importFailed': 'Import failed: {code}',
			'wb.pdfNoText': 'This PDF has no text layer (probably a scan); the workbench only reads text, so it was skipped.',
			'wb.pdfEncrypted': 'This PDF is password-protected and cannot be read.',
			'wb.pdfTooLarge': 'The file is over 8 MB and was not imported.',
			'wb.pdfNotCached': 'The parsed result for this PDF expired; import it again.',
			'wb.pdfParseFailed': 'The PDF structure could not be parsed; the file may be damaged.',
			'wb.libEmpty': 'The library is empty. Import a PDF, or open one from the Papers tab.',
			'wb.libOpen': 'Continue reading',
			'wb.libRemove': 'Remove',
			'wb.libRemoved': 'Removed from the library',
			'wb.lastOpened': 'Last opened',
			'wb.kindPdf': 'PDF',
			'wb.kindArxiv': 'arXiv',
			'wb.untitled': 'Untitled paper',
			'wb.ccfTitle': 'CCF rank',
			'wb.ccfA': 'CCF-A only',
			'wb.ccfRated': 'Ranked only',
			'wb.ccfAll': 'All',
			'wb.ccfNone': 'Unranked',
			'wb.ccfNote': 'Matched offline against the CCF venue list; no match means no badge, never a guess.',
			'wb.pageTitleHint': 'English full text on the left, Chinese notes on the right; ask anytime.',
		};

		const AI_PROMPT = [
			'请把这张课表图片整理成 JSON，只输出 JSON，不要任何解释。格式：',
			'{"courses":[{"name":"课程名","room":"教室","teacher":"老师","day":0,"periods":[1,2]}]}',
			'说明：day 用 0-6 表示周一到周日；periods 表示课表里的第几节（从 1 开始），连续节次就按顺序列出。',
		].join('\n');

		/* ------------------------------------------------------------------ */
		/* Data                                                                */
		/* ------------------------------------------------------------------ */

		function uid() {
			return Math.random().toString(36).slice(2, 10);
		}

		function defaultPeriods() {
			return DEFAULT_PERIODS.map((row, index) => ({
				id: 'p' + (index + 1),
				label: row[0],
				start: row[1],
				end: row[2],
			}));
		}

		function clampDay(value) {
			const number = Math.trunc(Number(value));
			if (!Number.isFinite(number)) return 0;
			if (number < 0) return 0;
			if (number > 6) return 6;
			return number;
		}

		function normalizeTags(raw) {
			return (Array.isArray(raw) ? raw : [])
				.filter((tag) => tag && typeof tag === 'object')
				.map((tag) => ({
					id: typeof tag.id === 'string' && tag.id ? tag.id : uid(),
					name: String(tag.name || '标签'),
					source: tag.source === 'course' ? 'course' : 'manual',
					folders: (Array.isArray(tag.folders) ? tag.folders : [])
						.filter((folder) => folder && typeof folder.path === 'string' && folder.path)
						.map((folder) => ({
							id: typeof folder.id === 'string' && folder.id ? folder.id : uid(),
							name: String(folder.name || '文件夹'),
							path: String(folder.path),
							createdAt: Number(folder.createdAt) || Date.now(),
						})),
				}));
		}

		function pad2(value) {
			return value < 10 ? '0' + value : String(value);
		}

		function startOfDay(date) {
			const copy = new Date(date.getTime());
			copy.setHours(0, 0, 0, 0);
			return copy;
		}

		function isoDate(date) {
			return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
		}

		function mondayOf(date) {
			const copy = startOfDay(date);
			const day = copy.getDay();
			copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
			return copy;
		}

		function dateOfText(value) {
			const text = String(value || '').trim();
			if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
			const date = new Date(text + 'T00:00:00');
			return Number.isNaN(date.getTime()) ? null : date;
		}

		function weekIndexOf(term, now) {
			const start = dateOfText(term && term.startDate);
			if (!start) return 1;
			const total = Math.max(1, Math.trunc(Number(term.weekCount)) || 20);
			const today = startOfDay(now || new Date());
			const days = Math.round((today.getTime() - startOfDay(start).getTime()) / 86400000);
			return Math.min(Math.max(Math.floor(days / 7) + 1, 1), total);
		}

		function entryInWeek(entry, week) {
			const weeks = entry && entry.weeks ? entry.weeks : null;
			if (!weeks) return true;
			if (week < weeks.start || week > weeks.end) return false;
			if (weeks.parity === 'odd') return week % 2 === 1;
			if (weeks.parity === 'even') return week % 2 === 0;
			return true;
		}

		function parseClock(value) {
			const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
			if (!match) return null;
			return Number(match[1]) * 60 + Number(match[2]);
		}

		function activeTermOf(current) {
			const terms = Array.isArray(current.terms) ? current.terms : [];
			return terms.find((term) => term.id === current.activeTermId) || terms[0] || null;
		}

		function normalizeEntry(item, known, weekCount) {
			const entry = item && typeof item === 'object' ? item : {};
			const periodIds = (Array.isArray(entry.periodIds) ? entry.periodIds : []).filter((id) => known.has(id));
			if (periodIds.length === 0) return null;
			const weeks = entry.weeks && typeof entry.weeks === 'object' ? entry.weeks : {};
			const start = Math.min(Math.max(1, Math.trunc(Number(weeks.start)) || 1), weekCount);
			const end = Math.min(Math.max(start, Math.trunc(Number(weeks.end)) || weekCount), weekCount);
			return {
				id: typeof entry.id === 'string' && entry.id ? entry.id : uid(),
				kind: entry.kind === 'activity' ? 'activity' : 'course',
				name: String(entry.name || '未命名'),
				room: String(entry.room || ''),
				teacher: String(entry.teacher || ''),
				note: String(entry.note || ''),
				day: clampDay(entry.day),
				periodIds,
				weeks: {
					start,
					end,
					parity: weeks.parity === 'odd' || weeks.parity === 'even' ? weeks.parity : 'all',
				},
			};
		}

		function normalizeCourse(item) {
			const source = item && typeof item === 'object' ? item : {};
			return {
				id: typeof source.id === 'string' && source.id ? source.id : uid(),
				name: String(source.name || '未命名课程'),
				teacher: String(source.teacher || ''),
				credits: String(source.credits || ''),
				note: String(source.note || ''),
			};
		}

		function normalizeTask(item) {
			const source = item && typeof item === 'object' ? item : {};
			const due = String(source.due || '').trim();
			return {
				id: typeof source.id === 'string' && source.id ? source.id : uid(),
				title: String(source.title || '未命名'),
				courseName: String(source.courseName || ''),
				due: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(due) ? due : '',
				note: String(source.note || ''),
				done: source.done === true,
			};
		}

		const DIRECTIONS = [
			['cs.CL', '自然语言处理 / LLM', { news: 'LLM', repo: '"large language model" OR llm' }],
			['cs.AI', '人工智能', { news: 'AI', repo: '"artificial intelligence" OR agent' }],
			['cs.LG', '机器学习', { news: 'machine learning', repo: '"machine learning"' }],
			['cs.CV', '计算机视觉', { news: 'computer vision', repo: '"computer vision"' }],
			['cs.CR', '安全与隐私', { news: 'security', repo: 'security OR privacy' }],
			['cs.RO', '机器人', { news: 'robotics', repo: 'robotics' }],
			['cs.DB', '数据库', { news: 'database', repo: 'database' }],
			['cs.DC', '分布式与系统', { news: 'distributed system', repo: 'distributed-systems' }],
			['cs.SE', '软件工程', { news: 'software engineering', repo: '"software engineering"' }],
			['cs.HC', '人机交互', { news: 'HCI', repo: '"human computer interaction"' }],
			['cs.CY', '计算与社会', { news: 'technology ethics', repo: '"computational social science"' }],
			['stat.ML', '统计机器学习', { news: 'statistics', repo: 'statistics OR bayesian' }],
		];
		const DIRECTION_CODES = DIRECTIONS.map((entry) => entry[0]);
		const DIRECTION_FEEDS = DIRECTIONS.map((entry) => ({ code: entry[0], arxiv: entry[0], news: entry[2].news, repo: entry[2].repo }));
		const MAJORS = [
			{ id: 'cs', label: '计算机 / 软件', query: 'computer science' },
			{ id: 'ai', label: '人工智能', query: 'artificial intelligence' },
			{ id: 'ee', label: '电子 / 通信', query: 'electronics engineering' },
			{ id: 'me', label: '机械 / 自动化', query: 'mechanical engineering' },
			{ id: 'bio', label: '生物 / 医学', query: 'bioinformatics' },
			{ id: 'math', label: '数学 / 统计', query: 'mathematics' },
			{ id: 'econ', label: '经济 / 管理', query: 'economics' },
			{ id: 'custom', label: '其他（自定义）', query: '' },
		];
		const MAJOR_IDS = MAJORS.map((entry) => entry.id);
		const SOURCE_KEYS = ['paper', 'news', 'github'];
		const SOURCE_RANK = { paper: 0, news: 1, github: 2 };
		const SOURCE_SCORE = { paper: 20, news: 12, github: 10 };
		const PROFILE_DIRECTION_MAX = 4;
		const PROFILE_CUSTOM_MAX = 6;
		const PROFILE_KEYWORD_MAX = 200;
		const PROFILE_TEXT_MAX = 60;
		const PROFILE_LABEL_MAX = 40;
		const PUSH_ITEM_MAX = 15;
		const PUSH_PER_SOURCE_MAX = 6;
		const PUSH_SEEN_MAX = 500;
		const PUSH_RETRY_MS = 1800000;
		const PUSH_CLOCK_SLACK_MS = 3600000;
		const PUSH_FEED_TIMEOUT_MS = 20000;
		const PUSH_REPO_GAP_MS = 1200;
		const PUSH_TITLE_MAX = 200;
		const PUSH_URL_MAX = 500;
		const PUSH_SUMMARY_MAX = 240;
		const PUSH_TAG_MAX = 4;
		const PUSH_KEYWORD_COUNT = 4;
		const PUSH_REASON_KEYS = ['direction', 'keyword', 'fresh', 'hot'];
		const SCORE_DIRECTION_BASE = 40;
		const SCORE_DIRECTION_STEP = 5;
		const SCORE_DIRECTION_MAX = 50;
		const SCORE_KEYWORD_STEP = 8;
		const SCORE_KEYWORD_MAX = 24;
		const FRESH_TIERS = [[2, 25], [7, 18], [14, 10], [30, 4]];
		const HOT_TIERS = [[1, 0], [5, 2], [20, 4], [100, 6], [500, 8], [2000, 10]];
		const HOT_MAX = 12;
		const PAPER_TAG_RULES = [
			{ label: 'LLM', match: ['llm', 'large language model', 'gpt', 'transformer', 'pretrain', '大模型', '预训练'] },
			{ label: 'RL', match: ['reinforcement learning', 'policy gradient', 'reward model', '强化学习', 'rlhf'] },
			{ label: 'CV', match: ['image', 'vision', 'segmentation', 'detection', '计算机视觉', '图像', '分割', '检测'] },
			{ label: 'Graph', match: ['graph neural', 'gnn', 'knowledge graph', '图神经网络', '知识图谱'] },
			{ label: 'Search', match: ['retrieval', 'rag', 'search', '检索', '搜索'] },
			{ label: 'Speech', match: ['speech', 'asr', 'tts', '语音', '音频'] },
			{ label: 'Eval', match: ['benchmark', 'evaluation', '评估', '评测'] },
		];
		/* 批次⑤：CCF 分级（2022 版推荐目录的离线别名表）。
		   只在 venue / comment 明确出现某个会议或期刊时才分级：认不出来就留空，
		   绝不根据标题猜测。因此 CCF-A 的「优先」是排序与徽章，而不是准入。 */
		const CCF_LEVELS = ['A', 'B', 'C'];
		const CCF_RANK = { A: 0, B: 1, C: 2 };
		const CCF_A_VENUES = [
			'AAAI', 'NEURIPS', 'NIPS', 'ICML', 'IJCAI', 'CVPR', 'ICCV', 'ECCV',
			'ACL', 'SIGIR', 'KDD', 'WWW', 'SIGMOD', 'VLDB', 'PVLDB', 'ICDE',
			'OSDI', 'SOSP', 'NSDI', 'SIGCOMM', 'CCS', 'USENIX SECURITY', 'CRYPTO', 'EUROCRYPT',
			'STOC', 'FOCS', 'SODA', 'POPL', 'PLDI', 'OOPSLA', 'ICSE', 'FSE',
			'ISCA', 'MICRO', 'ASPLOS', 'HPCA', 'SC', 'SIGGRAPH', 'CHI', 'UIST',
			'CSCW', 'ACM MULTIMEDIA', 'INFOCOM', 'MOBICOM', 'RTSS',
			'TPAMI', 'PAMI', 'PATTERN ANALYSIS AND MACHINE INTELLIGENCE',
			'IJCV', 'INTERNATIONAL JOURNAL OF COMPUTER VISION',
			'JMLR', 'JOURNAL OF MACHINE LEARNING RESEARCH',
			'ARTIFICIAL INTELLIGENCE', 'TOG', 'TOCS', 'TOS', 'TSE', 'TIFS', 'TDSC',
			'TKDE', 'VLDB JOURNAL', 'TOIS', 'TSP', 'JSAC', 'TMC', 'TCOM',
		];
		const CCF_B_VENUES = [
			'EMNLP', 'NAACL', 'COLING', 'WSDM', 'RECSYS', 'ICME', 'ICASSP', 'INTERSPEECH',
			'ICDM', 'CIKM', 'ECAI', 'AAMAS', 'ICRA', 'IROS', 'BMVC', 'ACCV',
			'TIP', 'TNNLS', 'TASLP', 'TMM', 'TCAD', 'TCAS', 'TMI', 'TCYB',
			'PATTERN RECOGNITION', 'COMPUTER VISION AND IMAGE UNDERSTANDING',
		];
		const CCF_C_VENUES = [
			'ICPR', 'ICIP', 'IJCNN', 'ICANN', 'PCM', 'ICMR', 'ICTAI', 'ICASSP WORKSHOP',
		];
		const COMPETITION_LEVELS = ['校级', '省级', '国家级', '国际'];
		const COMPETITION_STATUS = ['准备中', '已报名', '已结束'];
		const TIMELINE_KINDS = ['milestone', 'step'];
		const PLAN_ITEM_MAX = 200;
		const PLAN_TIMELINE_MAX = 200;
		const UNNAMED_FOLDER = '未命名文件夹';

		/* 批次④：论文工作台（SSE 流式；全文只进内存 Map，不落 localStorage）。 */
		const WB_TEXT_ROUTE = '/my-courses/paper/text';
		const WB_EXPLAIN_ROUTE = '/my-courses/paper/explain';
		const WB_ASK_ROUTE = '/my-courses/paper/ask';
		const WB_STATUS_ROUTE = '/my-courses/paper/status';
		const WB_CHAT_LIMIT = 40;
		const WB_CHAT_MAX = 1200;
		const WB_GUIDE_MAX = 4000;
		const WB_ZH_MAX = 6000;
		const WB_SECTION_KEY_MAX = 160;
		const WB_PAPER_ID_MAX = 120;
		const WB_SECTION_INPUT_MAX = 12000;
		const WB_SENTENCE_INPUT_MAX = 3000;
		const ARXIV_URL_PATTERN = /^https?:\/\/(?:www\.)?arxiv\.org\/(?:abs|pdf|html)\/([A-Za-z0-9.\/-]+?)(?:v\d+)?(?:\.pdf)?(?:[?#].*)?$/i;
		const ARXIV_ID_PATTERN = /^(?:\d{4}\.\d{4,5}|[a-z-]+(?:\.[A-Z]{2})?\/\d{7})$/;

		/* 批次⑤：PDF 导入（文本层）与工作台资料库。 */
		const WB_PDF_ROUTE = '/my-courses/paper/pdf';
		const WB_LIB_MAX = 200;
		const WB_IMPORT_FILES_MAX = 5;
		const WB_IMPORT_BYTES_MAX = 8 * 1024 * 1024;
		const WB_PDF_ID_PATTERN = /^pdf:[a-f0-9]{16}$/;
		const WB_CCF_FILTERS = ['all', 'A', 'rated'];

		/* 批次⑥：阅读体验（逐段对照 / 术语表 / 段落笔记 / 引用 / 导出）。 */
		const WB_VIEWS = ['bi', 'zh', 'en'];
		const WB_VIEW_LABEL = { bi: 'wb.viewBi', zh: 'wb.viewZh', en: 'wb.viewEn' };
		const WB_NOTE_MAX = 200;
		const WB_NOTE_QUOTE_MAX = 160;
		const WB_NOTE_TEXT_MAX = 2000;
		const WB_NOTE_SECTION_MAX = 64;
		const WB_GLOSSARY_MAX = 40;
		const WB_GLOSSARY_ENTRY_MAX = 64;
		const WB_ALIGN_PARAS_MAX = 20;
		const WB_ALIGN_LINE = /^\[(\d{1,3})\]\s*(.*)$/;
		const WB_CITE_PATTERN = /[\[【]§([^\[\]【】¶]{1,120}?)(?:\s*¶\s*(\d{1,3}))?[\]】]/;
		const WB_EXPORT_NAME_MAX = 80;

		/* ------------------------------------------------------------------ */
		/* 批次③：画像归一化 / 推送条目归一化 / 可复算打分 / 每日守卫          */
		/* 这些函数会被 check-logic.mjs 按名字抽取单独求值，故不得依赖 React、 */
		/* localStorage 或模块级可变状态；入参之外只读上方常量表。              */
		/* ------------------------------------------------------------------ */

		function byteCompare(left, right) {
			const a = String(left || '');
			const b = String(right || '');
			if (a === b) return 0;
			return a < b ? -1 : 1;
		}

		function directionIndex(code) {
			const index = DIRECTION_CODES.indexOf(String(code || ''));
			return index < 0 ? DIRECTION_CODES.length : index;
		}

		function sortDirections(list) {
			return (Array.isArray(list) ? list : []).slice().sort((a, b) => {
				const diff = directionIndex(a) - directionIndex(b);
				return diff !== 0 ? diff : byteCompare(a, b);
			});
		}

		function normalizeDirectionList(next) {
			const list = Array.isArray(next) ? next : [];
			const picked = [];
			list.forEach((entry) => {
				const code = String(entry || '');
				if (!code || picked.indexOf(code) >= 0) return;
				if (DIRECTION_CODES.indexOf(code) < 0 && !/^c:[\w\u4e00-\u9fa5-]{1,32}$/.test(code)) return;
				picked.push(code);
			});
			const ordered = sortDirections(picked).slice(0, PROFILE_DIRECTION_MAX);
			return ordered.length > 0 ? ordered : ['cs.CL'];
		}

		function normalizeProfile(raw, legacyDirections) {
			const source = raw && typeof raw === 'object' ? raw : {};
			const custom = [];
			(Array.isArray(source.custom) ? source.custom : []).forEach((entry) => {
				if (!entry || typeof entry !== 'object') return;
				const id = String(entry.id || '');
				const label = String(entry.label || '').trim().slice(0, PROFILE_LABEL_MAX);
				if (!id || !label) return;
				if (!/^c:[\w\u4e00-\u9fa5-]{1,32}$/.test(id)) return;
				if (custom.some((row) => row.id === id)) return;
				custom.push({ id, label });
			});
			const customList = custom.slice(0, PROFILE_CUSTOM_MAX);
			const allowed = DIRECTION_CODES.concat(customList.map((row) => row.id));
			const legacy = (Array.isArray(legacyDirections) ? legacyDirections : []).filter((code) => allowed.indexOf(String(code || '')) >= 0);
			const rawDirections = Array.isArray(source.directions) ? source.directions : legacy;
			const kept = rawDirections.filter((code) => allowed.indexOf(String(code || '')) >= 0);
			const directions = normalizeDirectionList(kept);
			let major = String(source.major || '');
			if (MAJOR_IDS.indexOf(major) < 0) major = 'cs';
			let majorCustom = String(source.majorCustom || '').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, PROFILE_LABEL_MAX);
			if (major === 'custom' && !majorCustom) {
				major = 'cs';
				majorCustom = '';
			}
			if (major !== 'custom') majorCustom = '';
			const keywords = String(source.keywords || '').trim().slice(0, PROFILE_KEYWORD_MAX);
			return {
				major,
				majorCustom,
				directions,
				custom: customList,
				keywords,
				glossary: normalizeGlossary(source.glossary),
				updatedAt: Number(source.updatedAt) || 0,
			};
		}

		/* 专业只用于兜底查询词（下拉框与「没有方向」时的取词），不进入打分。 */
		function pushProfileQuery(profile) {
			const source = profile && typeof profile === 'object' ? profile : {};
			const major = String(source.major || '');
			if (major === 'custom') return String(source.majorCustom || '').trim();
			const hit = MAJORS.filter((row) => row.id === major)[0];
			return hit ? hit.query : '';
		}

		/* 每个选中方向一条查询种子：预置方向有 arxiv 分类码，自定义方向只有标签。 */
		function pushDirectionFeeds(profile) {
			const source = profile && typeof profile === 'object' ? profile : {};
			const selected = Array.isArray(source.directions) ? source.directions : [];
			const custom = Array.isArray(source.custom) ? source.custom : [];
			const out = [];
			selected.forEach((code) => {
				const preset = DIRECTION_FEEDS.filter((row) => row.code === code)[0];
				if (preset) {
					out.push(preset);
					return;
				}
				const own = custom.filter((row) => row.id === code)[0];
				const label = own ? own.label : '';
				if (label) out.push({ code, arxiv: '', news: label, repo: label });
			});
			return out;
		}

		/* ------------------------------------------------------------------ */
		/* 批次④ 纯函数：check-logic.mjs 按名字抽取，禁止依赖 React / 存储       */
		/* ------------------------------------------------------------------ */

		function arxivIdOf(value) {
			const text = String(value || '').trim();
			if (!text) return '';
			const match = ARXIV_URL_PATTERN.exec(text);
			if (!match) {
				const bare = text.replace(/\.pdf$/i, '').replace(/v\d+$/, '');
				return ARXIV_ID_PATTERN.test(bare) ? bare : '';
			}
			const id = String(match[1] || '').replace(/\.pdf$/i, '').replace(/v\d+$/, '');
			return ARXIV_ID_PATTERN.test(id) ? id : '';
		}

		function readSseFrames(text) {
			const events = [];
			let rest = String(text || '').replace(/\r\n/g, '\n');
			for (;;) {
				const cut = rest.indexOf('\n\n');
				if (cut < 0) break;
				const raw = rest.slice(0, cut);
				rest = rest.slice(cut + 2);
				let name = 'message';
				const data = [];
				const lines = raw.split('\n');
				for (let index = 0; index < lines.length; index += 1) {
					const line = lines[index];
					if (line.indexOf(':') < 0) continue;
					const colon = line.indexOf(':');
					const field = line.slice(0, colon).trim();
					const value = line.slice(colon + 1).replace(/^ /, '');
					if (field === 'event') name = value.trim();
					else if (field === 'data') data.push(value);
				}
				if (data.length > 0) events.push({ event: name, data: data.join('\n') });
			}
			return { events, rest };
		}

		function clipPaperChat(raw) {
			const list = [];
			const source = Array.isArray(raw) ? raw : [];
			for (let index = 0; index < source.length; index += 1) {
				const cell = source[index] && typeof source[index] === 'object' ? source[index] : null;
				if (!cell) continue;
				const role = cell.role === 'assistant' ? 'assistant' : cell.role === 'user' ? 'user' : '';
				const text = String(cell.text || '').trim().slice(0, WB_CHAT_MAX);
				if (!role || !text) continue;
				list.push({ role, text, at: Math.trunc(Number(cell.at) || 0) });
			}
			return list.slice(-WB_CHAT_LIMIT);
		}

		/**
		 * Normalize one glossary entry list: `source=target` or `source：target`,
		 * 40 entries at most, 64 characters per side, first spelling wins.
		 * @param raw - array of strings from the input box or the store.
		 * @returns normalized `['source=target']` rows.
		 */
		function normalizeGlossary(raw) {
			const source = Array.isArray(raw) ? raw : [];
			const seen = [];
			const out = [];
			for (let index = 0; index < source.length; index += 1) {
				const text = String(source[index] == null ? '' : source[index]).trim();
				if (!text) continue;
				const equal = text.indexOf('=');
				const split = equal >= 0 ? equal : text.indexOf('：');
				if (split <= 0) continue;
				const from = text.slice(0, split).trim().slice(0, WB_GLOSSARY_ENTRY_MAX);
				const to = text.slice(split + 1).trim().slice(0, WB_GLOSSARY_ENTRY_MAX);
				if (!from || !to) continue;
				const key = from.toLowerCase();
				if (seen.indexOf(key) >= 0) continue;
				seen.push(key);
				out.push(from + '=' + to);
				if (out.length >= WB_GLOSSARY_MAX) break;
			}
			return out;
		}

		/**
		 * Render a glossary list as the newline text the editor shows.
		 * @param list - glossary rows.
		 * @returns newline-joined text.
		 */
		function glossaryText(list) {
			return normalizeGlossary(list).join('\n');
		}

		/**
		 * Parse `[n] 中文` alignment output. Every index from 1 to `count` must be
		 * present exactly once with non-empty text, otherwise the caller falls back
		 * to whole-section translation instead of risking a wrong pairing.
		 * @param text - model output.
		 * @param count - paragraph count sent to the model.
		 * @returns array of translations, or null when alignment is unusable.
		 */
		function parseAlignedTranslation(text, count) {
			const total = Math.trunc(Number(count) || 0);
			if (total <= 0 || total > WB_NOTE_SECTION_MAX) return null;
			const rows = [];
			const lines = String(text || '').split(/\r?\n/);
			for (let index = 0; index < lines.length; index += 1) {
				const hit = WB_ALIGN_LINE.exec(lines[index].trim());
				if (!hit) continue;
				const order = Number(hit[1]);
				if (!(order >= 1 && order <= total)) continue;
				const body = String(hit[2] || '').trim();
				if (!body) continue;
				rows[order - 1] = body;
			}
			if (rows.length !== total) return null;
			for (let index = 0; index < total; index += 1) {
				if (!rows[index]) return null;
			}
			return rows;
		}

		/**
		 * Find `[§heading ¶n]` citation markers in an answer.
		 * @param text - assistant text.
		 * @returns `[{ heading, para, raw }]` in reading order.
		 */
		function parseCitations(text) {
			const source = String(text || '');
			const pattern = new RegExp(WB_CITE_PATTERN.source, 'g');
			const out = [];
			let hit = pattern.exec(source);
			while (hit) {
				const heading = String(hit[1] || '').trim();
				if (heading) {
					out.push({ heading, para: Math.max(0, Math.trunc(Number(hit[2]) || 0)), raw: hit[0] });
				}
				hit = pattern.exec(source);
			}
			return out;
		}

		/**
		 * Normalize stored paragraph notes: 200 rows at most, newest last.
		 * @param raw - stored note list.
		 * @returns cleaned note rows.
		 */
		function normalizePaperNotes(raw) {
			const source = Array.isArray(raw) ? raw : [];
			const out = [];
			for (let index = 0; index < source.length; index += 1) {
				const entry = source[index];
				if (!entry || typeof entry !== 'object') continue;
				const id = String(entry.id || '').slice(0, 60);
				const text = String(entry.text || '').trim().slice(0, WB_NOTE_TEXT_MAX);
				if (!id || !text) continue;
				out.push({
					id,
					sec: String(entry.sec || '').slice(0, WB_ZH_MAX),
					para: Math.max(0, Math.trunc(Number(entry.para) || 0)),
					heading: String(entry.heading || '').replace(/\s+/g, ' ').trim().slice(0, 200),
					quote: String(entry.quote || '').replace(/\s+/g, ' ').trim().slice(0, WB_NOTE_QUOTE_MAX),
					text,
					at: Math.trunc(Number(entry.at) || 0),
				});
			}
			return out.slice(-WB_NOTE_MAX);
		}

		/**
		 * Build the bilingual Markdown export for one paper. Pure: it only reads
		 * what the reader already has, so exporting never spends model quota.
		 * @param input - `{ id, title, venue, ccf, url, guide, sections, sectionsZh, notes }`.
		 * @returns markdown text.
		 */
		function buildPaperMarkdown(input) {
			const source = input && typeof input === 'object' ? input : {};
			const title = String(source.title || source.id || 'paper').replace(/\s+/g, ' ').trim() || 'paper';
			const lines = ['# ' + title, ''];
			if (source.venue) lines.push('- venue: ' + String(source.venue).slice(0, 200));
			if (source.ccf) lines.push('- CCF: ' + String(source.ccf) + ' 类');
			if (source.url) lines.push('- link: ' + String(source.url).slice(0, 500));
			lines.push('');
			if (source.guide) lines.push('## Guide', '', String(source.guide).trim(), '');
			const sections = Array.isArray(source.sections) ? source.sections : [];
			const zhTable = source.sectionsZh && typeof source.sectionsZh === 'object' ? source.sectionsZh : {};
			for (let index = 0; index < sections.length; index += 1) {
				const section = sections[index] && typeof sections[index] === 'object' ? sections[index] : null;
				if (!section) continue;
				const heading = String(section.heading || '').trim();
				if (!heading) continue;
				const paragraphs = Array.isArray(section.paragraphs) ? section.paragraphs : [];
				const stored = zhTable[section.key];
				const aligned = stored && Array.isArray(stored.aligned) && stored.aligned.length === paragraphs.length ? stored.aligned : null;
				lines.push('## ' + heading, '');
				if (aligned) {
					for (let order = 0; order < paragraphs.length; order += 1) {
						lines.push(String(paragraphs[order] || '').trim(), '', '> ' + String(aligned[order] || '').trim(), '');
					}
				} else {
					for (let order = 0; order < paragraphs.length; order += 1) lines.push(String(paragraphs[order] || '').trim(), '');
					if (stored && stored.zh) lines.push('> ' + String(stored.zh).trim().replace(/\r?\n/g, '\n> '), '');
				}
			}
			const notes = normalizePaperNotes(source.notes);
			if (notes.length > 0) {
				lines.push('## Notes', '');
				for (let index = 0; index < notes.length; index += 1) {
					const note = notes[index];
					const where = '§' + (note.heading || note.sec || 'untitled') + (note.para ? ' ¶' + note.para : '');
					lines.push('### ' + (index + 1) + '. ' + where, '');
					if (note.quote) lines.push('> ' + note.quote, '');
					lines.push(note.text, '');
				}
			}
			return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
		}

		function normalizePaperState(raw) {
			const source = raw && typeof raw === 'object' ? raw : {};
			const table = source.items && typeof source.items === 'object' ? source.items : {};
			const items = {};
			Object.keys(table).forEach((key) => {
				const id = String(key || '').trim().slice(0, WB_PAPER_ID_MAX);
				const cell = table[key] && typeof table[key] === 'object' ? table[key] : null;
				if (!id || !cell) return;
				const zhTable = cell.sectionsZh && typeof cell.sectionsZh === 'object' ? cell.sectionsZh : {};
				const sectionsZh = {};
				Object.keys(zhTable).forEach((secKey) => {
					const name = String(secKey || '').slice(0, WB_SECTION_KEY_MAX);
					const entry = zhTable[secKey] && typeof zhTable[secKey] === 'object' ? zhTable[secKey] : null;
					if (!name || !entry) return;
					const zh = String(entry.zh || '').slice(0, WB_ZH_MAX);
					const aligned = Array.isArray(entry.aligned) ? entry.aligned.slice(0, WB_NOTE_SECTION_MAX) : [];
					const pairs = aligned.map((row) => String(row || '').trim().slice(0, WB_ZH_MAX));
					if (!zh && pairs.length === 0) return;
					sectionsZh[name] = {
						zh,
						at: Math.trunc(Number(entry.at) || 0),
						aligned: pairs.length > 0 && pairs.every((row) => row) ? pairs : [],
					};
				});
				const kind = cell.kind === 'pdf' || WB_PDF_ID_PATTERN.test(id) ? 'pdf' : 'arxiv';
				const venue = String(cell.venue || '').replace(/\s+/g, ' ').trim().slice(0, PUSH_TITLE_MAX);
				items[id] = {
					id,
					kind,
					title: String(cell.title || '').replace(/\s+/g, ' ').trim().slice(0, PUSH_TITLE_MAX),
					url: String(cell.url || '').trim().slice(0, PUSH_URL_MAX),
					venue,
					ccf: CCF_LEVELS.indexOf(String(cell.ccf || '')) >= 0 ? String(cell.ccf) : paperCcfLevel({ venue }),
					at: Math.trunc(Number(cell.at) || 0),
					openedAt: Math.trunc(Number(cell.openedAt) || Number(cell.at) || 0),
					guide: String(cell.guide || '').slice(0, WB_GUIDE_MAX),
					sectionsZh,
					chat: clipPaperChat(cell.chat),
					notes: normalizePaperNotes(cell.notes),
					view: WB_VIEWS.indexOf(String(cell.view || '')) >= 0 ? String(cell.view) : 'bi',
					anchor: Math.max(0, Math.trunc(Number(cell.anchor) || 0)),
				};
			});
			const kept = Object.keys(items).slice(0, WB_LIB_MAX);
			const library = {};
			kept.forEach((key) => {
				library[key] = items[key];
			});
			const open = typeof source.open === 'string' ? source.open.slice(0, WB_PAPER_ID_MAX) : '';
			return {
				open: library[open] ? open : '',
				tab: source.tab === 'chat' ? 'chat' : source.tab === 'notes' ? 'notes' : 'guide',
				items: library,
			};
		}

		function normalizePushItem(raw) {
			const source = raw && typeof raw === 'object' ? raw : {};
			const id = String(source.id || '').slice(0, 120);
			if (!id) return null;
			const url = String(source.url || '').trim().slice(0, PUSH_URL_MAX);
			if (!/^https?:\/\//i.test(url)) return null;
			const kind = SOURCE_KEYS.indexOf(String(source.source || '')) >= 0 ? String(source.source) : 'news';
			const summary = String(source.summary || '').replace(/\s+/g, ' ').trim().slice(0, PUSH_SUMMARY_MAX);
			let title = String(source.title || '').replace(/\s+/g, ' ').trim().slice(0, PUSH_TITLE_MAX);
			if (!title) title = summary.slice(0, 80).trim();
			if (!title) return null;
			let publishedAt = source.publishedAt;
			if (typeof publishedAt === 'string') publishedAt = Date.parse(publishedAt);
			publishedAt = Math.trunc(Number(publishedAt) || 0);
			if (!Number.isFinite(publishedAt) || publishedAt < 0) publishedAt = 0;
			const cell = source.metrics && typeof source.metrics === 'object' ? source.metrics : {};
			const hot = Math.trunc(Number(cell.hot) || 0);
			const tags = [];
			(Array.isArray(source.tags) ? source.tags : []).forEach((entry) => {
				const label = String(entry || '').trim().slice(0, 24);
				if (!label || tags.indexOf(label) >= 0) return;
				tags.push(label);
			});
			tags.sort(byteCompare);
			const directions = [];
			(Array.isArray(source.directions) ? source.directions : []).forEach((entry) => {
				const code = String(entry || '');
				if (!code || directions.indexOf(code) >= 0) return;
				directions.push(code);
			});
			const seenReasons = Array.isArray(source.reasons) ? source.reasons : [];
			const reasons = PUSH_REASON_KEYS.map((key) => 'push.reason.' + key).filter((key) => seenReasons.indexOf(key) >= 0);
			const stored = Math.trunc(Number(source.score) || 0);
			return {
				id,
				venue: String(source.venue || '').slice(0, PUSH_TITLE_MAX),
				comment: String(source.comment || '').slice(0, PUSH_TITLE_MAX),
				source: kind,
				title,
				summary,
				url,
				publishedAt,
				tags: tags.slice(0, PUSH_TAG_MAX),
				directions: sortDirections(directions),
				metrics: { hot: hot > 0 ? hot : 0 },
				score: stored > 0 ? stored : 0,
				reasons,
			};
		}

		function pushNormKey(item) {
			const title = String(item && item.title ? item.title : '');
			return title.toLowerCase().replace(/[^0-9a-z\u4e00-\u9fa5]+/g, '');
		}

		function pushByOrder(left, right) {
			if (left.score !== right.score) return right.score - left.score;
			if (left.publishedAt !== right.publishedAt) {
				if (left.publishedAt === 0) return 1;
				if (right.publishedAt === 0) return -1;
				return right.publishedAt - left.publishedAt;
			}
			const a = SOURCE_RANK[left.source] === undefined ? 3 : SOURCE_RANK[left.source];
			const b = SOURCE_RANK[right.source] === undefined ? 3 : SOURCE_RANK[right.source];
			if (a !== b) return a - b;
			return byteCompare(left.id, right.id);
		}

		function capPushItems(items) {
			const used = {};
			const out = [];
			(Array.isArray(items) ? items : []).forEach((item) => {
				if (!item || out.length >= PUSH_ITEM_MAX) return;
				const kind = SOURCE_KEYS.indexOf(item.source) >= 0 ? item.source : 'news';
				const count = used[kind] || 0;
				if (count >= PUSH_PER_SOURCE_MAX) return;
				used[kind] = count + 1;
				out.push(item);
			});
			return out;
		}

		function normalizePush(raw) {
			const source = raw && typeof raw === 'object' ? raw : {};
			const items = [];
			(Array.isArray(source.items) ? source.items : []).forEach((entry) => {
				const item = normalizePushItem(entry);
				if (!item) return;
				const key = pushNormKey(item);
				const clash = items.some((row) => row.id === item.id || (key && pushNormKey(row) === key));
				if (clash) return;
				items.push(item);
			});
			items.sort(pushByOrder);
			const seenIds = [];
			(Array.isArray(source.seenIds) ? source.seenIds : []).forEach((entry) => {
				const id = String(entry || '');
				if (!id || seenIds.indexOf(id) >= 0) return;
				seenIds.push(id);
			});
			const sourceState = {};
			SOURCE_KEYS.forEach((kind) => {
				const rawCell = source.sourceState && typeof source.sourceState === 'object' ? source.sourceState[kind] : null;
				const cell = rawCell && typeof rawCell === 'object' ? rawCell : {};
				sourceState[kind] = {
					ok: cell.ok === true,
					at: Math.trunc(Number(cell.at) || 0),
					error: String(cell.error || '').slice(0, 120),
				};
			});
			const day = String(source.lastRunDay || '');
			return {
				lastRunDay: /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '',
				lastRunAt: Math.trunc(Number(source.lastRunAt) || 0),
				retryAfter: Math.trunc(Number(source.retryAfter) || 0),
				items: capPushItems(items),
				seenIds: seenIds.slice(Math.max(0, seenIds.length - PUSH_SEEN_MAX)),
				sourceState,
				lastError: String(source.lastError || '').slice(0, 160),
			};
		}

		/* 权重理由：相关性最重（方向命中 40 起，最高 50），因为推送的第一义务是「和我有关」； */
		/* 来源梯度 20/12/10 让同等相关性下 论文 > 新闻 > 仓库，但差距小于一次新鲜度跳档， */
		/* 所以热门的当天新闻仍能超过一周前的论文；新鲜度最高 25，只做「今天优先」的排序信号； */
		/* 关键词最高 24，是加成而不是准入门槛，热度最高 12 只用来区分同一来源内部的活跃度。 */
		function scoreItem(item, profile, now) {
			const source = item && typeof item === 'object' ? item : {};
			const target = profile && typeof profile === 'object' ? profile : {};
			const selected = Array.isArray(target.directions) ? target.directions : [];
			const own = Array.isArray(source.directions) ? source.directions : [];
			const hits = own.filter((code) => selected.indexOf(String(code || '')) >= 0).length;
			const dirScore = hits === 0 ? 0 : Math.min(SCORE_DIRECTION_MAX, SCORE_DIRECTION_BASE + SCORE_DIRECTION_STEP * (hits - 1));
			const words = String(target.keywords || '').split(/\s+/).filter(Boolean).slice(0, PUSH_KEYWORD_COUNT);
			const text = (String(source.title || '') + ' ' + String(source.summary || '')).toLowerCase();
			const kwHits = words.filter((word) => text.indexOf(String(word).toLowerCase()) >= 0).length;
			const kwScore = Math.min(SCORE_KEYWORD_MAX, SCORE_KEYWORD_STEP * kwHits);
			const stamp = Math.trunc(Number(source.publishedAt) || 0);
			const base = now instanceof Date ? now.getTime() : Math.trunc(Number(now) || 0);
			const ageDays = stamp > 0 && base > 0 ? Math.floor((base - stamp) / 86400000) : null;
			let freshScore = 0;
			if (ageDays !== null && ageDays >= 0) {
				for (let index = 0; index < FRESH_TIERS.length; index += 1) {
					if (ageDays <= FRESH_TIERS[index][0]) {
						freshScore = FRESH_TIERS[index][1];
						break;
					}
				}
			}
			const srcScore = SOURCE_SCORE[source.source] || 0;
			/* 论文的会议/期刊档次是质量信号：CCF-A +25 足以压过两天的新鲜度差，
			   但压不过「完全不相关」，因为相关性仍是准入条件。 */
			const ccfLevel = source.source === 'paper' ? paperCcfLevel(source) : '';
			const ccfScore = ccfLevel === 'A' ? 25 : ccfLevel === 'B' ? 12 : ccfLevel === 'C' ? 4 : 0;
			const hot = Math.trunc(Number(source.metrics && source.metrics.hot) || 0);
			let hotScore = HOT_MAX;
			for (let index = 0; index < HOT_TIERS.length; index += 1) {
				if (hot < HOT_TIERS[index][0]) {
					hotScore = HOT_TIERS[index][1];
					break;
				}
			}
			const reasons = [];
			if (dirScore > 0) reasons.push('push.reason.' + PUSH_REASON_KEYS[0]);
			if (kwScore > 0) reasons.push('push.reason.' + PUSH_REASON_KEYS[1]);
			if (freshScore >= 10) reasons.push('push.reason.' + PUSH_REASON_KEYS[2]);
			if (hotScore >= 6) reasons.push('push.reason.' + PUSH_REASON_KEYS[3]);
			if (ccfScore > 0) reasons.push('push.reason.ccf');
			return { ...source, ccf: ccfLevel, score: dirScore + kwScore + freshScore + srcScore + hotScore + ccfScore, reasons };
		}

		/* 相关性门槛：方向命中或关键词命中，二者皆无者不进入推流（质量下限）。 */
		function rankPushItems(items, profile, now) {
			const unique = [];
			(Array.isArray(items) ? items : []).forEach((entry) => {
				const item = normalizePushItem(entry);
				if (!item) return;
				const key = pushNormKey(item);
				const clash = unique.some((row) => row.id === item.id || (key && pushNormKey(row) === key));
				if (clash) return;
				unique.push(item);
			});
			const kept = [];
			unique.forEach((item) => {
				const scored = scoreItem(item, profile, now);
				const related = scored.reasons.indexOf('push.reason.' + PUSH_REASON_KEYS[0]) >= 0
					|| scored.reasons.indexOf('push.reason.' + PUSH_REASON_KEYS[1]) >= 0;
				if (related) kept.push(scored);
			});
			kept.sort(pushByOrder);
			return capPushItems(kept);
		}

		function pushUnreadCount(push) {
			const source = push && typeof push === 'object' ? push : {};
			const seen = Array.isArray(source.seenIds) ? source.seenIds : [];
			return (Array.isArray(source.items) ? source.items : []).filter((item) => item && seen.indexOf(item.id) < 0).length;
		}

		function pushIsDue(push, now) {
			const base = now instanceof Date ? now : new Date(Math.trunc(Number(now) || 0));
			const stamp = base.getTime();
			const day = push && typeof push.lastRunDay === 'string' ? push.lastRunDay : '';
			if (isoDate(base) !== day) return true;
			const lastRunAt = Math.trunc(Number(push && push.lastRunAt) || 0);
			return lastRunAt > 0 && stamp < lastRunAt - PUSH_CLOCK_SLACK_MS;
		}

		function pushDayOf(date) {
			return isoDate(date instanceof Date ? date : new Date(Math.trunc(Number(date) || 0)));
		}

		function normalizePaper(item) {
			const source = item && typeof item === 'object' ? item : {};
			const id = String(source.id || '');
			if (!id) return null;
			return {
				id,
				title: String(source.title || ''),
				authors: Array.isArray(source.authors) ? source.authors.map(String).slice(0, 6) : [],
				published: String(source.published || ''),
				summary: String(source.summary || ''),
				url: String(source.url || ''),
				pdf: String(source.pdf || ''),
				category: String(source.category || ''),
				venue: String(source.venue || ''),
				doi: String(source.doi || ''),
				doiUrl: String(source.doiUrl || ''),
				arxivId: String(source.arxivId || ''),
				arxivIdBase: String(source.arxivIdBase || id),
				primaryCategory: String(source.primaryCategory || source.category || ''),
				comment: String(source.comment || ''),
			};
		}

		/* R2：预印本判定收成纯函数。有 DOI 即视为已发表，即便 arxivId 存在也不得标预印本。 */
		function paperVenueMeta(item, t) {
			const source = item && typeof item === 'object' ? item : {};
			const hasVenue = String(source.venue || '').trim().length > 0;
			const hasDoi = String(source.doi || source.doiUrl || '').trim().length > 0;
			const hasArxiv = String(source.arxivId || '').trim().length > 0;
			const preprint = !hasVenue && !hasDoi && hasArxiv;
			return {
				text: hasVenue ? source.venue : preprint ? t('paper.preprint') : '',
				title: hasVenue ? t('paper.venue') : preprint ? t('paper.preprint') : '',
			};
		}

		function paperTagList(item) {
			const source = item && typeof item === 'object' ? item : {};
			const tags = [];
			const category = String(source.primaryCategory || source.category || '').trim();
			if (category) tags.push(category);
			const haystack = (String(source.title || '') + ' ' + String(source.summary || '')).toLowerCase();
			let hits = 0;
			for (const rule of PAPER_TAG_RULES) {
				if (hits >= 2) break;
				if (rule.match.some((word) => haystack.indexOf(word) >= 0)) {
					tags.push(rule.label);
					hits += 1;
				}
			}
			return tags;
		}

		function paperTagCounts(items) {
			const counts = new Map();
			(Array.isArray(items) ? items : []).forEach((item) => {
				paperTagList(item).forEach((label) => {
					counts.set(label, (counts.get(label) || 0) + 1);
				});
			});
			return Array.from(counts, ([label, count]) => ({ label, count }))
				.sort((left, right) => (right.count - left.count) || left.label.localeCompare(right.label))
				.slice(0, 12);
		}

		/* CCF 分级只依赖原文自报的 venue / comment，任何一处认不出就不分级。 */
		function ccfNormalize(text) {
			return String(text || '')
				.toUpperCase()
				.replace(/[^A-Z0-9]+/g, ' ')
				.replace(/\s+/g, ' ')
				.trim();
		}

		function ccfMatchList(haystack, list) {
			for (let index = 0; index < list.length; index += 1) {
				const alias = list[index];
				if (alias.length < 3) continue;
				if (haystack.indexOf(' ' + alias + ' ') >= 0) return true;
			}
			return false;
		}

		function paperCcfLevel(item) {
			const source = item && typeof item === 'object' ? item : {};
			const raw = [source.venue, source.comment, source.journalRef]
				.map((cell) => String(cell || '').trim())
				.filter(Boolean)
				.join(' ');
			if (!raw) return '';
			const norm = ccfNormalize(raw);
			if (!norm) return '';
			const haystack = ' ' + norm + ' ';
			if (ccfMatchList(haystack, CCF_A_VENUES)) return 'A';
			if (ccfMatchList(haystack, CCF_B_VENUES)) return 'B';
			if (ccfMatchList(haystack, CCF_C_VENUES)) return 'C';
			return '';
		}

		function ccfRank(level) {
			const key = String(level || '');
			return Object.prototype.hasOwnProperty.call(CCF_RANK, key) ? CCF_RANK[key] : 3;
		}

		function normalizeResearch(raw) {
			const source = raw && typeof raw === 'object' ? raw : {};
			const directions = (Array.isArray(source.directions) ? source.directions : [])
				.map(String)
				.filter((code) => DIRECTION_CODES.indexOf(code) >= 0);
			return {
				directions: directions.length > 0 ? directions : ['cs.CL'],
				keywords: String(source.keywords || ''),
				items: (Array.isArray(source.items) ? source.items : []).map(normalizePaper).filter(Boolean).slice(0, 60),
				saved: (Array.isArray(source.saved) ? source.saved : []).map(normalizePaper).filter(Boolean),
				fetchedAt: Number(source.fetchedAt) || 0,
			};
		}

		/* 时间轴条目排序：有日期升序在前，无日期 (`''`) 排最后；
		   再按 createdAt、id 兜底，保证任意输入下顺序唯一（幂等依赖这一点）。 */
		function byTimeline(left, right) {
			const a = dateOfText(left && left.date);
			const b = dateOfText(right && right.date);
			if (a && b) {
				if (a.getTime() !== b.getTime()) return a.getTime() - b.getTime();
			} else if (a) {
				return -1;
			} else if (b) {
				return 1;
			}
			const at = Number(left && left.createdAt) || 0;
			const bt = Number(right && right.createdAt) || 0;
			if (at !== bt) return at - bt;
			const ai = String((left && left.id) || '');
			const bi = String((right && right.id) || '');
			return ai < bi ? -1 : ai > bi ? 1 : 0;
		}

		/* 里程碑 = 时间轴上 kind === 'milestone' 的条目。派生视图，零存储。 */
		function milestonesOf(plan) {
			const timeline = plan && Array.isArray(plan.timeline) ? plan.timeline : [];
			return timeline.filter((entry) => entry.kind === 'milestone').sort(byTimeline);
		}

		function planProgress(plan) {
			const list = milestonesOf(plan);
			return { done: list.filter((entry) => entry.done).length, total: list.length };
		}

		function normalizePlanItem(item) {
			const source = item && typeof item === 'object' ? item : {};
			const text = String(source.text || '').trim();
			if (!text) return null;
			return {
				id: typeof source.id === 'string' && source.id ? source.id : uid(),
				text,
				done: source.done === true,
				createdAt: Number(source.createdAt) > 0 ? Number(source.createdAt) : Date.now(),
			};
		}

		function normalizeTimelineEntry(item) {
			const source = item && typeof item === 'object' ? item : {};
			const title = String(source.title || '').trim();
			if (!title) return null;
			const raw = String(source.date || '').trim();
			return {
				id: typeof source.id === 'string' && source.id ? source.id : uid(),
				kind: TIMELINE_KINDS.indexOf(source.kind) >= 0 ? source.kind : 'step',
				title,
				date: dateOfText(raw) ? raw : '',
				done: source.done === true,
				competitionId: typeof source.competitionId === 'string' ? source.competitionId : '',
				createdAt: Number(source.createdAt) > 0 ? Number(source.createdAt) : Date.now(),
			};
		}

		function dedupeById(list) {
			const seen = new Set();
			return list.filter((entry) => {
				if (seen.has(entry.id)) return false;
				seen.add(entry.id);
				return true;
			});
		}

		function normalizePlan(raw) {
			const source = raw && typeof raw === 'object' ? raw : {};
			const items = dedupeById((Array.isArray(source.items) ? source.items : []).map(normalizePlanItem).filter(Boolean)).slice(0, PLAN_ITEM_MAX);
			let timeline = dedupeById((Array.isArray(source.timeline) ? source.timeline : []).map(normalizeTimelineEntry).filter(Boolean));
			/* §2.5 唯一的单向入口：旧输入里的 milestones 一次性并入 timeline，输出不含该键。 */
			if (Array.isArray(source.milestones) && source.milestones.length > 0) {
				const legacy = dedupeById(source.milestones
					.map((entry) => {
						const item = entry && typeof entry === 'object' ? entry : {};
						return normalizeTimelineEntry({
							...item,
							kind: TIMELINE_KINDS.indexOf(item.kind) >= 0 ? item.kind : 'milestone',
						});
					})
					.filter(Boolean));
				const known = new Set(timeline.map((entry) => entry.id));
				timeline = timeline.concat(legacy.filter((entry) => !known.has(entry.id)));
			}
			return { items, timeline: timeline.sort(byTimeline).slice(0, PLAN_TIMELINE_MAX) };
		}

		function normalizeCompetitionFolder(item, index) {
			const source = item && typeof item === 'object' ? item : {};
			const order = Number(source.order);
			const createdAt = Number(source.createdAt);
			return {
				id: typeof source.id === 'string' && source.id ? source.id : uid(),
				name: String(source.name || '').trim() || UNNAMED_FOLDER,
				order: Number.isInteger(order) && order >= 0 ? order : index,
				createdAt: createdAt > 0 ? createdAt : Date.now(),
				plan: normalizePlan(source.plan),
			};
		}

		function byFolder(left, right) {
			if (left.order !== right.order) return left.order - right.order;
			if (left.createdAt !== right.createdAt) return left.createdAt - right.createdAt;
			const byName = left.name.localeCompare(right.name);
			if (byName !== 0) return byName;
			return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
		}

		/* 排序后按 order 稠密重编号为 0..n-1，删除中间项后不留空洞。 */
		function normalizeCompetitionFolders(raw) {
			const source = Array.isArray(raw) ? raw : [];
			const folders = dedupeById(source.map(normalizeCompetitionFolder)).sort(byFolder);
			return folders.map((folder, index) => ({ ...folder, order: index }));
		}

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
				folderId: typeof source.folderId === 'string' ? source.folderId : '',
			};
		}

		function normalizeTerm(raw, known) {
			const source = raw && typeof raw === 'object' ? raw : {};
			const weekCount = Math.min(30, Math.max(1, Math.trunc(Number(source.weekCount)) || 20));
			const startDate = dateOfText(source.startDate) ? String(source.startDate) : isoDate(mondayOf(new Date()));
			const entries = (Array.isArray(source.entries) ? source.entries : [])
				.map((item) => normalizeEntry(item, known, weekCount))
				.filter(Boolean);
			const courses = (Array.isArray(source.courses) ? source.courses : []).map(normalizeCourse);
			entries.forEach((entry) => {
				if (entry.kind !== 'course') return;
				if (courses.some((course) => course.name === entry.name)) return;
				courses.push({ id: uid(), name: entry.name, teacher: entry.teacher || '', credits: '', note: '' });
			});
			return {
				id: typeof source.id === 'string' && source.id ? source.id : uid(),
				name: String(source.name || '本学期'),
				startDate,
				weekCount,
				entries,
				courses,
				tasks: (Array.isArray(source.tasks) ? source.tasks : []).map(normalizeTask),
			};
		}

		function withCourses(term) {
			const courses = Array.isArray(term.courses) ? term.courses.slice() : [];
			term.entries.forEach((entry) => {
				if (entry.kind !== 'course') return;
				if (courses.some((course) => course.name === entry.name)) return;
				courses.push({ id: uid(), name: entry.name, teacher: entry.teacher || '', credits: '', note: '' });
			});
			return { ...term, courses };
		}

		function normalize(source) {
			const raw = source && typeof source === 'object' ? source : {};
			const periods = Array.isArray(raw.periods) && raw.periods.length > 0
				? raw.periods.map((item, index) => ({
					id: typeof item.id === 'string' && item.id ? item.id : 'p' + (index + 1),
					label: String(item.label || '第' + (index + 1) + '节'),
					start: String(item.start || ''),
					end: String(item.end || ''),
				}))
				: defaultPeriods();
			const known = new Set(periods.map((period) => period.id));
			const rawTerms = Array.isArray(raw.terms) ? raw.terms.filter((term) => term && typeof term === 'object') : [];
			let terms = rawTerms.map((term) => normalizeTerm(term, known));
			if (terms.length === 0) {
				const legacy = Array.isArray(raw.entries) ? raw.entries : Array.isArray(raw.courses) ? raw.courses : [];
				terms = [{
					id: uid(),
					name: String(raw.termName || '本学期'),
					startDate: isoDate(mondayOf(new Date())),
					weekCount: 20,
					entries: legacy.map((item) => normalizeEntry(item, known, 20)).filter(Boolean),
					courses: [],
					tasks: [],
				}];
				terms = terms.map(withCourses);
			}
			const activeTermId = terms.some((term) => term.id === raw.activeTermId) ? raw.activeTermId : terms[0].id;
			const tags = normalizeTags(raw.tags);
			const legacyFolders = Array.isArray(raw.folders) ? raw.folders : [];
			legacyFolders.forEach((folder) => {
				if (!folder || typeof folder.path !== 'string' || !folder.path) return;
				const name = String(folder.name || folder.path.split(/[\\/]/).filter(Boolean).pop() || '文件夹');
				const existing = tags.find((tag) => tag.name === name);
				const record = { id: uid(), name, path: String(folder.path), createdAt: Number(folder.createdAt) || Date.now() };
				if (existing) existing.folders.push(record);
				else tags.push({ id: uid(), name, source: 'manual', folders: [record] });
			});
			const ui = raw.ui && typeof raw.ui === 'object' ? raw.ui : {};
			const uiWeek = Math.trunc(Number(ui.weekOverride));
			/* 顺序敏感（§5.2 M4）：先归一化 folders，再校验竞赛的 folderId 是否指向真实文件夹。 */
			const competitionFolders = normalizeCompetitionFolders(raw.competitionFolders);
			const folderIds = new Set(competitionFolders.map((folder) => folder.id));
			const competitions = (Array.isArray(raw.competitions) ? raw.competitions : [])
				.map((item) => {
					const next = normalizeCompetition(item);
					return next.folderId && !folderIds.has(next.folderId) ? { ...next, folderId: '' } : next;
				});
			/* §2.3 / §5.3：时间轴条目指向不存在的竞赛时只把 competitionId 降级为 ''，不删条目。 */
			const competitionIds = new Set(competitions.map((item) => item.id));
			const folders = competitionFolders.map((folder) => ({
				...folder,
				plan: {
					...folder.plan,
					timeline: folder.plan.timeline.map((entry) => (entry.competitionId && !competitionIds.has(entry.competitionId) ? { ...entry, competitionId: '' } : entry)),
				},
			}));
			/* v10 → v11：阅读体验多了 view / notes / sectionsZh.aligned；三者都由
			   normalize 兜底，重复执行结果一致，因此迁移仍是幂等的纯函数。 */
			return {
				version: 11,
				periods,
				terms,
				research: normalizeResearch(raw.research),
				competitions,
				competitionFolders: folders,
				activeTermId,
				profile: normalizeProfile(raw.profile, raw.research && Array.isArray(raw.research.directions) ? raw.research.directions : null),
				push: normalizePush(raw.push),
				paper: normalizePaperState(raw.paper),
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
				ui: {
					showWeekend: ui.showWeekend !== false,
					weekOverride: Number.isFinite(uiWeek) && uiWeek > 0 ? uiWeek : null,
				},
			};
		}

		/* ------------------------------------------------------------------ */
		/* Store                                                               */
		/* ------------------------------------------------------------------ */

		const listeners = new Set();
		let state = readState();

		/* 存储里未知的顶层键要在写回时原样保留（幂等要求：不丢别人的字段）。 */
		const KNOWN_STATE_KEYS = ['version', 'periods', 'terms', 'research', 'competitions', 'competitionFolders', 'activeTermId', 'profile', 'push', 'paper', 'tags', 'filesRoot', 'image', 'ui'];
		let storedExtras = {};

		function pickExtras(raw) {
			const extras = {};
			if (!raw || typeof raw !== 'object') return extras;
			Object.keys(raw).forEach((key) => {
				if (KNOWN_STATE_KEYS.indexOf(key) < 0) extras[key] = raw[key];
			});
			return extras;
		}

		function readState() {
			try {
				const raw = window.localStorage.getItem(STORAGE_KEY);
				if (raw) {
					const parsed = JSON.parse(raw);
					storedExtras = pickExtras(parsed);
					return normalize(parsed);
				}
			} catch (error) {
				/* unreadable storage starts empty */
			}
			try {
				const legacy = window.localStorage.getItem(LEGACY_KEY);
				if (legacy) {
					const parsed = JSON.parse(legacy);
					storedExtras = pickExtras(parsed);
					return normalize(parsed);
				}
			} catch (error) {
				/* an unparseable legacy value is ignored */
			}
			return normalize(null);
		}

		function writeState(next) {
			state = next;
			let stored = true;
			try {
				window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...storedExtras, ...next }));
			} catch (error) {
				stored = false;
			}
			listeners.forEach((listener) => {
				try {
					listener();
				} catch (error) {
					/* one broken listener must not stop the others */
				}
			});
			return stored;
		}

		function update(patch) {
			return writeState({ ...state, ...patch });
		}

		function updateWith(producer) {
			try {
				const next = producer(state);
				if (!next || typeof next !== 'object') return false;
				return writeState(next);
			} catch (error) {
				return false;
			}
		}

		/* 画像唯一写入口：profile.directions 与既有 research.directions 同步，避免双真值源。 */
		function setDirections(next) {
			return updateWith((current) => {
				const list = normalizeDirectionList(next);
				return {
					...current,
					profile: { ...current.profile, directions: list, updatedAt: Date.now() },
					research: { ...current.research, directions: list },
				};
			});
		}

		/* 批次⑥：术语表是画像级配置，写入口保持唯一。 */
		function setGlossary(list) {
			return updateWith((current) => ({
				...current,
				profile: { ...current.profile, glossary: normalizeGlossary(list), updatedAt: Date.now() },
			}));
		}

		/* ------------------------------------------------------------------ */
		/* 批次④：论文工作台写入口（窄接口，便于回滚；全文不进存储）           */
		/* ------------------------------------------------------------------ */

		function paperBaseSlice(current) {
			const base = current && current.paper && typeof current.paper === 'object' ? current.paper : {};
			return {
				open: typeof base.open === 'string' ? base.open : '',
				tab: base.tab === 'chat' || base.tab === 'notes' ? base.tab : 'guide',
				items: base.items && typeof base.items === 'object' ? base.items : {},
			};
		}

		function patchPaper(id, patch, extra) {
			const target = String(id || '').trim();
			if (!target) return Promise.resolve(state);
			return updateWith((current) => {
				const base = paperBaseSlice(current);
				const cell = base.items[target] || { id: target, title: '', url: '', at: 0, guide: '', sectionsZh: {}, chat: [], anchor: 0 };
				const changes = typeof patch === 'function' ? patch(cell) : patch;
				const items = { ...base.items, [target]: { ...cell, ...(changes || {}) } };
				const paper = normalizePaperState({ ...base, ...(extra || {}), items });
				return { ...current, paper };
			});
		}

		function updatePaperTop(patch) {
			return updateWith((current) => {
				const base = paperBaseSlice(current);
				const paper = normalizePaperState({ ...base, ...(patch || {}) });
				return { ...current, paper };
			});
		}

		function openPaper(item) {
			const id = arxivIdOf(item && item.url);
			if (!id) return Promise.resolve(state);
			return patchPaper(id, {
				title: String((item && item.title) || ''),
				url: String((item && item.url) || ''),
				at: Date.now(),
			}, { open: id });
		}

		function closePaper(id) {
			const target = String(id || '');
			return updateWith((current) => {
				const base = paperBaseSlice(current);
				const paper = normalizePaperState({ ...base, open: base.open === target ? '' : base.open });
				return { ...current, paper };
			});
		}

		function setPaperTab(tab) {
			return updatePaperTop({ tab: tab === 'chat' || tab === 'notes' ? tab : 'guide' });
		}

		function rememberPaperAnchor(id, anchor) {
			return patchPaper(id, { anchor: Math.max(0, Math.trunc(Number(anchor) || 0)) });
		}

		function saveProfile(patch) {
			return updateWith((current) => {
				const list = Array.isArray(patch && patch.directions) ? patch.directions : current.profile.directions;
				const directions = normalizeDirectionList(list);
				const merged = normalizeProfile({ ...current.profile, ...patch, directions, updatedAt: Date.now() }, current.research.directions);
				return { ...current, profile: { ...merged, directions, updatedAt: Date.now() }, research: { ...current.research, directions } };
			});
		}

		function subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		}

		function useStore() {
			return useSyncExternalStore(subscribe, () => state);
		}

		/* ------------------------------------------------------------------ */
		/* Helpers                                                             */
		/* ------------------------------------------------------------------ */

		function messageOf(error) {
			if (!error) return '未知错误';
			return String(error.message || error);
		}

		function format(value, params) {
			return String(value).replace(/\{(\w+)\}/g, (match, key) => (params && key in params ? String(params[key]) : match));
		}

		function makeT(props) {
			if (typeof props.t === 'function') return props.t;
			return (key) => (key in ZH ? ZH[key] : key);
		}

		function hueOf(text) {
			let hash = 0;
			const source = String(text || '');
			for (let index = 0; index < source.length; index += 1) hash = (hash * 31 + source.charCodeAt(index)) % 360;
			return hash;
		}

		function sanitizeName(name) {
			return String(name || '课程').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || '课程';
		}

		function todayIndex() {
			const day = new Date().getDay();
			return day === 0 ? 6 : day - 1;
		}

		function parseDay(value) {
			if (typeof value === 'number' && Number.isFinite(value)) {
				if (value >= 0 && value <= 6) return Math.trunc(value);
				return clampDay(value);
			}
			const text = String(value || '').trim();
			if (/^\d+$/.test(text)) return parseDay(Number(text));
			const table = {
				'一': 0, '二': 1, '三': 2, '四': 3, '五': 4, '六': 5, '日': 6, '天': 6,
				'mon': 0, 'monday': 0, 'tue': 1, 'tues': 1, 'tuesday': 1, 'wed': 2, 'wednesday': 2,
				'thu': 3, 'thur': 3, 'thurs': 3, 'thursday': 3, 'fri': 4, 'friday': 4,
				'sat': 5, 'saturday': 5, 'sun': 6, 'sunday': 6,
			};
			const lowered = text.toLowerCase();
			if (lowered in table) return table[lowered];
			const chinese = /(?:周|星期|礼拜)\s*([一二三四五六日天])/.exec(text);
			if (chinese) return table[chinese[1]];
			const english = /(mon|tue|wed|thu|fri|sat|sun)/.exec(lowered);
			if (english) return table[english[1]];
			return 0;
		}

		function parsePeriods(value, periods) {
			const ids = [];
			const add = (id) => {
				if (id && periods.some((period) => period.id === id) && ids.indexOf(id) < 0) ids.push(id);
			};
			const one = (item) => {
				if (typeof item === 'number') {
					const period = periods[item - 1];
					if (period) add(period.id);
					return;
				}
				if (typeof item === 'object' && item !== null) {
					one(item.id != null ? item.id : item.period);
					return;
				}
				const text = String(item == null ? '' : item).trim();
				if (!text) return;
				if (periods.some((period) => period.id === text)) {
					add(text);
					return;
				}
				const range = /^(\d+)\s*[-~～到至]\s*(\d+)$/.exec(text);
				if (range) {
					const from = Number(range[1]);
					const to = Number(range[2]);
					for (let index = from; index <= to; index += 1) one(index);
					return;
				}
				const digits = /^(?:第)?\s*(\d+)\s*(?:节)?$/.exec(text);
				if (digits) one(Number(digits[1]));
			};
			if (Array.isArray(value)) value.forEach(one);
			else if (typeof value === 'string') value.split(/[,，、;；\s]+/).filter(Boolean).forEach(one);
			else if (value != null) one(value);
			return ids;
		}

		function parseTimetable(text, periods) {
			const source = String(text || '').trim();
			if (!source) throw new Error('EMPTY');
			const start = source.indexOf('{');
			const end = source.lastIndexOf('}');
			if (start < 0 || end <= start) throw new Error('INVALID');
			let data;
			try {
				data = JSON.parse(source.slice(start, end + 1));
			} catch (error) {
				throw new Error('INVALID');
			}
			const list = Array.isArray(data) ? data : Array.isArray(data.courses) ? data.courses : null;
			if (!list) throw new Error('NOCOURSES');
			const entries = list
				.map((item) => {
					if (!item || typeof item !== 'object') return null;
					const periodIds = parsePeriods(item.periods != null ? item.periods : item.period != null ? item.period : item.slots, periods);
					if (periodIds.length === 0) return null;
					return {
						id: uid(),
						kind: item.kind === 'activity' ? 'activity' : 'course',
						name: String(item.name || item.course || item.title || '未命名').trim(),
						room: String(item.room || item.location || item.classroom || '').trim(),
						teacher: String(item.teacher || item.lecturer || '').trim(),
						note: String(item.note || '').trim(),
						day: parseDay(item.day != null ? item.day : item.weekday),
						periodIds,
					};
				})
				.filter(Boolean);
			if (entries.length === 0) throw new Error('NOUSABLE');
			return entries;
		}

		function exportPayload(current, term) {
			const entries = term ? term.entries : [];
			return {
				updatedAt: new Date().toISOString(),
				term: term ? term.name : '',
				periods: current.periods.map((period) => ({ label: period.label, start: period.start, end: period.end })),
				courses: entries.map((entry) => ({
					kind: entry.kind,
					name: entry.name,
					room: entry.room,
					teacher: entry.teacher,
					day: entry.day,
					periods: entry.periodIds
						.map((id) => current.periods.findIndex((period) => period.id === id) + 1)
						.filter((index) => index > 0),
				})),
			};
		}

		function buildGrid(entries, periods, dayCount) {
			const order = new Map(periods.map((period, index) => [period.id, index]));
			const cells = [];
			for (let day = 0; day < dayCount; day += 1) cells.push(new Array(periods.length).fill(null));
			entries.forEach((entry) => {
				if (entry.day < 0 || entry.day >= dayCount) return;
				const column = cells[entry.day];
				const indexes = entry.periodIds
					.map((id) => order.get(id))
					.filter((index) => index !== undefined)
					.sort((left, right) => left - right);
				const runs = [];
				let runStart = null;
				let previous = null;
				indexes.forEach((index) => {
					if (runStart === null) {
						runStart = index;
						previous = index;
						return;
					}
					if (index === previous + 1) {
						previous = index;
						return;
					}
					runs.push([runStart, previous]);
					runStart = index;
					previous = index;
				});
				if (runStart !== null) runs.push([runStart, previous]);
				runs.forEach((run) => {
					column[run[0]] = { kind: 'start', entry, span: run[1] - run[0] + 1 };
					for (let index = run[0] + 1; index <= run[1]; index += 1) column[index] = { kind: 'covered' };
				});
			});
			return cells;
		}

		function readImageFile(file) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onerror = () => reject(new Error('READ'));
				reader.onload = () => {
					const image = new Image();
					image.onerror = () => reject(new Error('DECODE'));
					image.onload = () => {
						const limit = 1500;
						const ratio = Math.min(1, limit / Math.max(image.width || 1, image.height || 1));
						const width = Math.max(1, Math.round((image.width || 1) * ratio));
						const height = Math.max(1, Math.round((image.height || 1) * ratio));
						try {
							const canvas = document.createElement('canvas');
							canvas.width = width;
							canvas.height = height;
							const context = canvas.getContext('2d');
							context.fillStyle = '#ffffff';
							context.fillRect(0, 0, width, height);
							context.drawImage(image, 0, 0, width, height);
							let quality = 0.82;
							let dataUrl = canvas.toDataURL('image/jpeg', quality);
							while (dataUrl.length > 2400000 && quality > 0.4) {
								quality -= 0.12;
								dataUrl = canvas.toDataURL('image/jpeg', quality);
							}
							resolve({ dataUrl, name: file.name || '课表图片', addedAt: Date.now(), width, height });
						} catch (error) {
							resolve({ dataUrl: String(reader.result), name: file.name || '课表图片', addedAt: Date.now(), width: image.width, height: image.height });
						}
					};
					image.src = String(reader.result);
				};
				try {
					reader.readAsDataURL(file);
				} catch (error) {
					reject(new Error('READ'));
				}
			});
		}

		async function requestExtraction(dataUrl) {
			const response = await fetch(EXTRACT_ROUTE, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ image: dataUrl }),
			});
			if (!response.ok) throw new Error('HTTP ' + response.status);
			const payload = await response.json();
			if (!payload || payload.ok !== true) {
				const error = payload && payload.error ? String(payload.error) : 'FAILED';
				const failure = new Error(error);
				failure.code = error;
				throw failure;
			}
			return String(payload.text || '');
		}

		/* ------------------------------------------------------------------ */
		/* Styles                                                             */
		/* ------------------------------------------------------------------ */

		const CSS = [
			':root{--mc-note-normal-bg:#fff6d8;--mc-note-normal-edge:#e8d38a;--mc-note-normal-tape:rgba(0,0,0,.14);--mc-note-due-bg:#ffe6c7;--mc-note-due-edge:#f2a94a;--mc-note-due-tape:rgba(0,0,0,.14);--mc-note-overdue-bg:#fde3e3;--mc-note-overdue-edge:#e06a6a;--mc-note-overdue-tape:rgba(0,0,0,.16)}',
			'body[data-ds-dark-theme]{--mc-note-normal-bg:#3a3523;--mc-note-normal-edge:#8a7a3a;--mc-note-due-bg:#40301d;--mc-note-due-edge:#a5712c;--mc-note-overdue-bg:#3d2424;--mc-note-overdue-edge:#a14a4a}',
			'.mc-page{width:100%;min-width:0;height:100%;min-height:0;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);font-size:14px;line-height:1.6;display:flex;flex-direction:column;overflow:hidden}',
			'.mc-page *{box-sizing:border-box}',
			'.mc-scroll{flex:1;min-height:0;overflow:auto;scrollbar-gutter:stable}',
			'.mc-content{max-width:1100px;margin:0 auto;padding:0 clamp(20px,4vw,40px) 48px}',
			'.mc-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 16px;padding-top:28px;margin-bottom:10px}',
			'[data-platform=darwin] .mc-head{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}',
			'.mc-head h1{margin:0;font-size:20px;font-weight:500;line-height:28px}',
			'.mc-summary{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px;display:flex;gap:10px;flex-wrap:wrap}',
			'.mc-tabs{display:flex;gap:22px;border-bottom:.5px solid var(--dsw-alias-border-l3);margin-bottom:18px}',
			'.mc-tab{background:none;border:none;padding:0 0 10px;font:inherit;font-size:13px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-tertiary);cursor:pointer;position:relative}',
			'.mc-tab[aria-selected=true]{color:var(--dsw-alias-label-primary)}',
			'.mc-tab[aria-selected=true]:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;border-radius:2px;background:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary))}',
			'.mc-tab:hover{color:var(--dsw-alias-label-primary)}',
			'.mc-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:14px}',
			'.mc-spacer{flex:1;min-width:8px}',
			'.mc-btn{font:inherit;font-size:13px;line-height:20px;height:32px;padding:0 12px;border-radius:16px;border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;transition:background .15s,border-color .15s}',
			'.mc-btn:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}',
			'.mc-btn:disabled{color:var(--dsw-alias-label-caption);cursor:default;background:transparent}',
			'.mc-btn-primary{background:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary));border-color:transparent;color:#fff}',
			'.mc-btn-primary:hover{background:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary));opacity:.9}',
			'.mc-btn-danger{color:var(--dsw-alias-state-error-primary)}',
			'.mc-btn-sm{height:26px;padding:0 9px;border-radius:13px;font-size:12px}',
			'.mc-card{border:.5px solid var(--dsw-alias-border-l3);border-radius:14px;padding:14px 16px;background:var(--dsw-alias-bg-base)}',
			'.mc-card+.mc-card{margin-top:10px}',
			'.mc-select{width:auto;min-width:120px;height:30px;padding-right:8px;cursor:pointer}',
			'.mc-weeknav{display:inline-flex;align-items:center;gap:4px}',
			'.mc-weeklabel{font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary);min-width:60px;text-align:center}',
			'.mc-today{margin-bottom:12px}',
			'.mc-today-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}',
			'.mc-today-head strong{font-size:14px;font-weight:500;line-height:22px}',
			'.mc-today-status{margin:0;flex:1;min-width:0}',
			'.mc-today-items{display:flex;flex-wrap:wrap;gap:8px}',
			'.mc-today-item{display:flex;align-items:baseline;gap:8px;border:.5px solid var(--dsw-alias-border-l2);border-radius:10px;padding:4px 10px;background:var(--dsw-alias-bg-layer-1);font-size:12px;line-height:20px}',
			'.mc-today-item[data-state=now]{border-color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary));background:var(--dsw-alias-interactive-bg-hover)}',
			'.mc-today-item[data-state=next]{border-style:dashed}',
			'.mc-today-time{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
			'.mc-today-name{font-weight:500}',
			'.mc-today-room{color:var(--dsw-alias-label-secondary)}',
			'.mc-course-card{display:flex;flex-direction:column;gap:10px;margin-bottom:10px}',
			'.mc-course-card[data-dragging=true]{border-color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary));background:var(--dsw-alias-interactive-bg-hover)}',
			'.mc-course-head{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}',
			'.mc-course-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;flex:1}',
			'.mc-course-title strong{font-size:14px;font-weight:500;line-height:22px}',
			'.mc-course-note{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px}',
			'.mc-course-slots{display:flex;flex-direction:column;gap:2px}',
			'.mc-course-slot{display:flex;gap:10px;align-items:baseline;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
			'.mc-course-when{color:var(--dsw-alias-label-primary);min-width:96px}',
			'.mc-course-time{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}',
			'.mc-course-tasks{border-top:.5px solid var(--dsw-alias-border-l1);padding-top:8px;display:flex;flex-direction:column;gap:2px}',
			'.mc-course-tasks-head{display:flex;align-items:center;gap:8px;margin-bottom:4px}',
			'.mc-course-drop{font-size:11px;line-height:16px;color:var(--dsw-alias-label-caption)}',
			'.mc-task{display:flex;align-items:center;gap:10px;padding:6px 4px;border-radius:10px}',
			'.mc-task:hover{background:var(--dsw-alias-interactive-bg-hover)}',
			'.mc-task[data-done=true] .mc-task-title{text-decoration:line-through;color:var(--dsw-alias-label-tertiary)}',
			'.mc-check{width:20px;height:20px;flex:none;border-radius:6px;border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:#fff;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0}',
			'.mc-check[aria-pressed=true]{background:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary));border-color:transparent}',
			'.mc-task-body{display:flex;flex-direction:column;min-width:0;flex:1;cursor:pointer;text-align:left}',
			'.mc-task-title{font-size:13px;line-height:20px;overflow-wrap:anywhere}',
			'.mc-task-meta{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
			'.mc-task-late{color:var(--dsw-alias-state-error-primary)}',
			'.mc-task-today{color:var(--dsw-alias-state-warn-primary)}',
			'.mc-task[data-state=overdue] .mc-task-title{color:var(--dsw-alias-state-error-primary)}',
			'.mc-task-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;align-items:stretch}',
			'.mc-note{--mc-note-tint:var(--mc-note-normal-bg);--mc-note-line:var(--mc-note-normal-edge);align-items:flex-start;flex-wrap:wrap;gap:8px;min-height:64px;padding:10px 12px 10px 14px;border-radius:12px;border:.5px solid color-mix(in oklab,var(--dsw-alias-border-l2) 55%,var(--mc-note-line) 45%);background-color:color-mix(in oklab,var(--dsw-alias-bg-layer-1) 80%,var(--mc-note-tint) 20%);background-image:linear-gradient(180deg,var(--mc-note-normal-tape),transparent 6px)}',
			'.mc-note[data-tier=due]{--mc-note-tint:var(--mc-note-due-bg);--mc-note-line:var(--mc-note-due-edge);min-height:80px;background-image:linear-gradient(180deg,var(--mc-note-due-tape),transparent 6px)}',
			'.mc-note[data-tier=overdue]{--mc-note-tint:var(--mc-note-overdue-bg);--mc-note-line:var(--mc-note-overdue-edge);min-height:88px;background-image:linear-gradient(180deg,var(--mc-note-overdue-tape),transparent 6px)}',
			'.mc-note:hover{background-color:color-mix(in oklab,var(--dsw-alias-interactive-bg-hover) 65%,var(--mc-note-tint) 35%)}',
			'.mc-task[data-done=true]{opacity:.55}',
			'.mc-note .mc-task-body{gap:2px}',
			'.mc-course-tasks .mc-note{min-height:0;padding:4px 8px;border-radius:8px;background-image:none}',
			'.mc-paper-filters{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}',
			'.mc-paper-list{display:flex;flex-direction:column;gap:10px}',
			'.mc-papers{display:grid;grid-template-columns:minmax(0,1fr) 176px;gap:16px;align-items:start}',
			'.mc-paper-main{min-width:0;display:flex;flex-direction:column}',
			'.mc-paper-tags{position:sticky;top:12px;align-self:start;display:flex;flex-direction:column;gap:6px;padding:10px;border:.5px solid var(--dsw-alias-border-l3);border-radius:14px;background:var(--dsw-alias-bg-layer-1)}',
			'.mc-paper-tags-head{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);padding:0 2px 2px}',
			'.mc-paper-tags-empty{margin:0;padding:2px;color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}',
			'.mc-paper-tag{display:flex;align-items:center;justify-content:space-between;gap:6px;width:100%;text-align:left}',
			'.mc-paper-tag-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.mc-paper-venue{color:var(--dsw-alias-label-secondary)}',
			'.mc-paper-id,.mc-paper-doi{color:var(--dsw-alias-label-tertiary);text-decoration:none}',
			'.mc-paper-id:hover,.mc-paper-doi:hover{color:var(--dsw-alias-label-primary);text-decoration:underline}',
			'.mc-paper{display:flex;flex-direction:column;gap:6px}',
			'.mc-paper-head{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}',
			'.mc-paper-title{flex:1;min-width:0;font-size:14px;font-weight:500;line-height:22px;color:var(--dsw-alias-label-primary);text-decoration:none}',
			'.mc-paper-title:hover{text-decoration:underline}',
			'.mc-paper-meta{display:flex;gap:8px;flex-wrap:wrap;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
			'.mc-paper-summary{margin:0;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}',
			'.mc-clamp{display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
			'.mc-linkbtn{font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);background:none;border:0;padding:0;cursor:pointer;align-self:flex-start}',
			'.mc-linkbtn:hover{color:var(--dsw-alias-label-primary)}',
			'.mc-competition-list{display:flex;flex-direction:column;gap:10px}',
			'.mc-competition{display:flex;flex-direction:column;gap:6px}',
			'.mc-competition-head{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}',
			'.mc-competition-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;flex:1}',
			'.mc-competition-title strong,.mc-competition-title a{font-size:14px;font-weight:500;line-height:22px;color:var(--dsw-alias-label-primary);text-decoration:none}',
			'.mc-competition-title a:hover{text-decoration:underline}',
			'.mc-competition-meta{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
			'.mc-competition-note{margin:0;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary)}',
			/* 批次②：竞赛文件夹层 .mc-cf-* 与学习规划层 .mc-plan-*（不复用磁盘浏览器的 .mc-folder*） */
			'.mc-cf-list{display:flex;flex-direction:column;gap:10px}',
			'.mc-cf-card{display:flex;flex-direction:column;gap:6px;cursor:pointer;text-align:left;width:100%;font:inherit;color:inherit}',
			'.mc-cf-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
			'.mc-cf-name{font-size:14px;font-weight:500;line-height:22px;color:var(--dsw-alias-label-primary);min-width:0;flex:1}',
			'.mc-cf-meta{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
			'.mc-cf-progress{height:6px;border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 70%, transparent);overflow:hidden}',
			'.mc-cf-progress-bar{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-label-primary)}',
			'.mc-cf-ungrouped{border-style:dashed}',
			'.mc-cf-detail{display:flex;gap:12px;align-items:flex-start}',
			'.mc-cf-detail-competitions{display:flex;flex-direction:column;gap:10px;flex:1;min-width:0}',
			'.mc-cf-toolbar{display:flex;align-items:center;gap:10px}',
			'.mc-plan{display:flex;flex-direction:column;gap:10px;flex:1;min-width:0}',
			'.mc-plan-tabs{display:flex;gap:6px}',
			'.mc-plan-tab{font-size:12px;line-height:20px;padding:2px 10px;border-radius:999px;border:1px solid var(--dsw-alias-border-secondary, var(--dsw-alias-label-tertiary));background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;white-space:nowrap;font-family:inherit}',
			'.mc-plan-tab[data-active=true]{border-color:transparent;background:color-mix(in srgb, var(--dsw-alias-bg-layer-1) 70%, transparent);color:var(--dsw-alias-label-primary)}',
			'.mc-plan-items{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}',
			'.mc-plan-item{display:flex;align-items:center;gap:8px;font-size:13px;line-height:22px;color:var(--dsw-alias-label-primary)}',
			'.mc-plan-item[data-done=true]{color:var(--dsw-alias-label-tertiary);text-decoration:line-through}',
			'.mc-plan-tl{display:flex;flex-direction:column;gap:10px}',
			'.mc-plan-tl-group{display:flex;flex-direction:column;gap:6px}',
			'.mc-plan-tl-row{display:flex;align-items:center;gap:8px;font-size:13px;line-height:22px;color:var(--dsw-alias-label-primary)}',
			'.mc-plan-tl-dot{width:8px;height:8px;border-radius:999px;border:1px solid var(--dsw-alias-label-tertiary);flex:none}',
			'.mc-plan-tl-dot[data-kind=milestone]{border-color:transparent;background:var(--dsw-alias-label-primary)}',
			'.mc-plan-empty{margin:0;font-size:12px;line-height:20px;color:var(--dsw-alias-label-tertiary)}',
			'.mc-file-body{display:flex;flex-direction:column;gap:8px;min-height:120px}',
			'.mc-file-image{max-width:100%;max-height:56vh;object-fit:contain;border-radius:8px;align-self:center}',
			'.mc-file-pdf{width:100%;height:56vh;border:0;border-radius:8px;background:var(--dsw-alias-bg-layer-1)}',
			'.mc-file-text{min-height:46vh;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:19px}',
			'.mc-imagecard{display:flex;gap:14px;align-items:flex-start;margin-bottom:14px}',
			'.mc-thumb{width:132px;max-height:132px;object-fit:cover;border-radius:10px;border:.5px solid var(--dsw-alias-border-l2);cursor:zoom-in;background:var(--dsw-alias-bg-layer-1);flex:none}',
			'.mc-imageinfo{min-width:0;display:flex;flex-direction:column;gap:6px;flex:1}',
			'.mc-imageinfo strong{font-weight:500;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.mc-muted{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:20px}',
			'.mc-caption{color:var(--dsw-alias-label-caption);font-size:12px;line-height:18px;display:block}',
			'.mc-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
			'.mc-banner{margin-bottom:10px;border-radius:12px;padding:8px 14px;background:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px}',
			'.mc-busy{border-radius:12px;padding:8px 14px;margin-bottom:10px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px}',
			'.mc-tablewrap{border:.5px solid var(--dsw-alias-border-l3);border-radius:14px;overflow:auto;background:var(--dsw-alias-bg-base)}',
			'.mc-table{width:100%;min-width:820px;border-collapse:separate;border-spacing:0;table-layout:fixed}',
			'.mc-table th,.mc-table td{border-right:.5px solid var(--dsw-alias-border-l3);border-bottom:.5px solid var(--dsw-alias-border-l3);padding:0;vertical-align:top}',
			'.mc-table tr:last-child>th,.mc-table tr:last-child>td{border-bottom:0}',
			'.mc-table th:last-child,.mc-table td:last-child{border-right:0}',
			'.mc-headcell{position:sticky;top:0;z-index:2;background:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;line-height:18px;padding:9px 6px;text-align:center}',
			'.mc-headcell.mc-corner{width:96px;cursor:pointer}',
			'.mc-headcell.mc-corner:hover{color:var(--dsw-alias-label-primary)}',
			'.mc-headcell.mc-today{color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary))}',
			'.mc-timecell{width:96px;background:var(--dsw-alias-bg-layer-1);padding:8px 6px;text-align:center;cursor:pointer}',
			'.mc-timecell:hover{background:var(--dsw-alias-interactive-bg-hover)}',
			'.mc-period{display:block;font-size:12px;font-weight:500;line-height:18px}',
			'.mc-clock{display:block;color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px;margin-top:2px;font-variant-numeric:tabular-nums}',
			'.mc-slot{position:relative;min-height:62px;cursor:pointer;padding:4px}',
			'.mc-slot:hover{background:var(--dsw-alias-interactive-bg-hover)}',
			'.mc-slot:after{content:"＋";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-caption);font-size:15px;opacity:0;pointer-events:none}',
			'.mc-slot:hover:after{opacity:.75}',
			'.mc-entry{position:relative;display:flex;flex-direction:column;gap:2px;min-height:62px;height:100%;padding:7px 8px 7px 11px;border-radius:10px;cursor:pointer;overflow:hidden;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2)}',
			'.mc-entry:hover{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-interactive-bg-hover)}',
			'.mc-entry[data-kind=activity]{border-style:dashed;background:transparent}',
			'.mc-entry-bar{position:absolute;left:0;top:0;bottom:0;width:3px;border-radius:3px 0 0 3px}',
			'.mc-entry[data-kind=activity] .mc-entry-bar{border-radius:0;width:2px}',
			'.mc-entry-name{font-size:12.5px;font-weight:500;line-height:17px;overflow-wrap:anywhere}',
			'.mc-entry-room{color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:16px;overflow-wrap:anywhere}',
			'.mc-entry-kind{color:var(--dsw-alias-label-caption);font-size:10.5px;line-height:14px;letter-spacing:.02em}',
			'.mc-hint{margin-top:16px;border-radius:14px;padding:10px 16px;background:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px}',
			'.mc-overlay{position:fixed;inset:0;background:rgba(0,0,0,.38);display:flex;align-items:center;justify-content:center;padding:24px;z-index:60}',
			'.mc-dialog{width:100%;max-width:560px;max-height:calc(100dvh - 48px);display:flex;flex-direction:column;overflow:hidden;border-radius:16px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));box-shadow:0 18px 48px rgba(0,0,0,.28)}',
			'.mc-dialog-wide{max-width:680px}',
			'.mc-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 20px 0}',
			'.mc-dialog-head h2{margin:0;font-size:16px;font-weight:500;line-height:24px}',
			'.mc-dialog-body{padding:16px 20px;overflow:auto;display:flex;flex-direction:column;gap:14px;min-height:0}',
			'.mc-dialog-foot{display:flex;justify-content:flex-end;gap:8px;padding:4px 20px 18px;flex-wrap:wrap}',
			'.mc-field{display:flex;flex-direction:column;gap:6px;min-width:0}',
			'.mc-field>span{font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
			'.mc-input{width:100%;height:34px;padding:0 10px;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:.5px solid var(--dsw-alias-border-l3);border-radius:10px;outline:none;transition:border-color .15s}',
			'.mc-input:focus{border-color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary))}',
			'textarea.mc-input{height:auto;min-height:132px;padding:10px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:19px;resize:vertical}',
			'.mc-chips{display:flex;flex-wrap:wrap;gap:6px}',
			'.mc-chip{font:inherit;font-size:12px;line-height:18px;height:28px;padding:0 10px;border-radius:14px;border:.5px solid var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
			'.mc-chip[aria-pressed=true]{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}',
			'.mc-periodrow{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) minmax(0,1fr) auto;gap:8px;align-items:center}',
			'.mc-error{margin:0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;overflow-wrap:anywhere}',
			'.mc-toast{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);z-index:70;padding:8px 16px;border-radius:14px;font-size:13px;line-height:20px;max-width:min(80vw,520px);background:var(--dsw-alias-bg-overlay,var(--dsw-alias-bg-layer-1));color:var(--dsw-alias-label-primary);border:.5px solid var(--dsw-alias-border-l2);box-shadow:0 10px 30px rgba(0,0,0,.22)}',
			'.mc-toast[data-tone=error]{color:var(--dsw-alias-state-error-primary)}',
			'.mc-lightbox{position:fixed;inset:0;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:32px;z-index:80;cursor:zoom-out}',
			'.mc-lightbox img{max-width:100%;max-height:100%;border-radius:8px}',
			'.mc-rootbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}',
			'.mc-rootbar .mc-path{flex:1;min-width:0}',
			'.mc-workbench{display:grid;grid-template-columns:212px minmax(0,1fr);gap:16px;align-items:start}',
			'.mc-taglist{padding:10px;display:flex;flex-direction:column;gap:4px}',
			'.mc-taglist-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:2px 6px 8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}',
			'.mc-tagbtn{display:flex;align-items:center;gap:8px;width:100%;text-align:left;font:inherit;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary);background:none;border:0;border-radius:10px;padding:6px 8px;cursor:pointer}',
			'.mc-tagbtn:hover{background:var(--dsw-alias-interactive-bg-hover)}',
			'.mc-tagbtn[aria-current=true]{background:var(--dsw-alias-interactive-bg-hover);font-weight:500}',
			'.mc-tagbtn .mc-taglabel{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.mc-tagcount{color:var(--dsw-alias-label-caption);font-size:11px;line-height:16px}',
			'.mc-tagpane{min-width:0}',
			'.mc-taghead{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}',
			'.mc-taghead strong{font-size:15px;font-weight:500;line-height:22px}',
			'.mc-badge{font-size:11px;line-height:16px;padding:1px 7px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border:.5px solid var(--dsw-alias-border-l2);white-space:nowrap}',
			'.mc-folder{display:flex;flex-direction:column;gap:8px;min-width:0}',
			'.mc-folder-head{display:flex;align-items:flex-start;gap:10px;flex-wrap:wrap}',
			'.mc-folder-title{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}',
			'.mc-folder-title strong{font-weight:500;font-size:13px;line-height:20px}',
			'.mc-path{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere}',
			'.mc-list{display:flex;flex-direction:column;gap:1px;border-top:.5px solid var(--dsw-alias-border-l1);padding-top:6px}',
			'.mc-listrow{display:flex;align-items:center;gap:8px;width:100%;text-align:left;font:inherit;font-size:13px;line-height:22px;color:var(--dsw-alias-label-primary);background:none;border:0;border-radius:8px;padding:3px 8px;cursor:pointer}',
			'.mc-listrow:hover{background:var(--dsw-alias-interactive-bg-hover)}',
			'.mc-glyph{color:var(--dsw-alias-label-tertiary);flex:none;display:inline-flex}',
			'.mc-page :focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary)));outline-offset:2px}',
			'.mc-entry:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary)));outline-offset:-2px}',
			'@media (width<=820px){.mc-workbench{grid-template-columns:minmax(0,1fr)}.mc-papers{grid-template-columns:minmax(0,1fr)}.mc-paper-tags{position:static;flex-direction:row;flex-wrap:wrap;align-items:center}.mc-paper-tag{width:auto}}',
			'@media (width<=640px){.mc-task-list{grid-template-columns:minmax(0,1fr)}.mc-note{min-height:auto}.mc-task{flex-wrap:wrap}.mc-task-body{flex:1 1 140px}.mc-task .mc-btn-danger{margin-left:auto}}',
			'@media (width<=640px){.mc-cf-detail{flex-direction:column}.mc-plan-tabs{overflow-x:auto;flex-wrap:nowrap}.mc-cf-toolbar{flex-wrap:wrap}.mc-cf-toolbar .mc-btn-primary{order:-1}.mc-wb-box{border-radius:0}.mc-wb-lib-row{flex-wrap:wrap}.mc-wb-lib-acts{width:100%;justify-content:flex-end}.mc-ccf-hint{text-align:left}.mc-wb-body{grid-template-columns:minmax(0,1fr)}.mc-wb-right{border-left:none;border-top:.5px solid var(--dsw-alias-border-l2);max-height:54vh}.mc-wb-head .mc-wb-title{max-width:100%}}',
			'.mc-push{display:flex;flex-direction:column;gap:12px}',
			'.mc-push-sources{display:flex;gap:8px;flex-wrap:wrap}',
			'.mc-push-source{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-tertiary, #8a8f99)}',
			'.mc-push-list{display:flex;flex-direction:column;gap:10px}',
			'.mc-push-card{border:1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08));background:var(--dsw-alias-bg-layer-2, transparent);border-radius:10px;padding:10px 12px}',
			'.mc-push-card-head{display:flex;justify-content:space-between;gap:10px;align-items:baseline}',
			'.mc-push-title{font-weight:600;font-size:13px;line-height:1.45;color:inherit;text-decoration:none}',
			'.mc-push-meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--dsw-alias-label-secondary, #6b7280);margin-top:6px}',
			'.mc-push-src{font-size:11px;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))}',
			'.mc-push-reasons{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}',
			'.mc-reason{font-size:11px;padding:1px 6px;border-radius:6px;background:var(--mc-note-bg, var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)));color:var(--dsw-alias-label-secondary, #6b7280)}',
			'.mc-push-skeleton{height:56px;border-radius:10px;background:var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05));opacity:.6}',
			'.mc-profile{border:1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08));border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px}',
			'.mc-profile-chips{display:flex;gap:6px;flex-wrap:wrap}',
			'.mc-profile-chip{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08));cursor:pointer;background:transparent}',
			'.mc-profile-chip[data-on="1"]{background:var(--dsw-alias-state-business-primary, #4d6bfe);color:#fff;border-color:transparent}',
			'.mc-wb{position:relative;display:flex;flex-direction:column;min-height:0;height:100%}',
			'.mc-wb.mc-wb-inline{align-items:stretch;justify-content:stretch}',
			'.mc-wb-tab-page{padding-bottom:8px}',
			'.mc-wb-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask,rgba(15,20,35,.45))}',
			'.mc-wb-box{position:relative;display:flex;flex-direction:column;flex:1 1 auto;width:100%;height:100%;min-height:0;border-radius:14px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);overflow:hidden}',
			'.mc-wb-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:.5px solid var(--dsw-alias-border-l2);flex-wrap:wrap}',
			'.mc-wb-title{font-size:14px;font-weight:600;max-width:44%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.mc-wb-id{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
			'.mc-wb-chip{font-size:11px;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover)}',
			'.mc-wb-gap{flex:1 1 auto}',
			'.mc-wb-body{flex:1 1 auto;display:grid;grid-template-columns:minmax(0,1.45fr) minmax(0,1fr);min-height:0}',
			'.mc-wb-pane{min-width:0;min-height:0;display:flex;flex-direction:column;gap:8px;padding:12px 14px}',
			'.mc-wb-col{overflow:auto}',
			'.mc-wb-paper{display:flex;flex-direction:column;gap:10px}',
			'.mc-wb-toc{display:flex;flex-wrap:wrap;gap:4px;padding-bottom:8px;border-bottom:.5px dashed var(--dsw-alias-border-l2)}',
			'.mc-wb-cap{font-size:11px;letter-spacing:.04em;color:var(--dsw-alias-label-secondary)}',
			'.mc-wb-toc-item{font-size:11px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 7px;border-radius:6px;border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
			'.mc-wb-toc-item:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}',
			'.mc-wb-toc-item[data-level="2"]{opacity:.8}',
			'.mc-wb-sec{scroll-margin-top:10px}',
			'.mc-wb-h{display:flex;align-items:center;gap:8px;margin:14px 0 6px;position:sticky;top:0;background:var(--dsw-alias-bg-layer-1);padding:4px 0;z-index:1}',
			'.mc-wb-h-text{font-size:13px;font-weight:600;flex:1 1 auto;min-width:0}',
			'.mc-wb-h[data-level="1"] .mc-wb-h-text{font-size:14px}',
			'.mc-wb-run{opacity:0;transition:opacity .15s}',
			'.mc-wb-h:hover .mc-wb-run,.mc-wb-run:focus-visible{opacity:1}',
			'.mc-wb-p{position:relative;margin:0 0 10px;font-size:13px;line-height:1.75;color:var(--dsw-alias-label-primary)}',
			'.mc-wb-ask-para{white-space:nowrap}',
			'.mc-wb-p:hover .mc-wb-ptools,.mc-wb-ptools:focus-within{opacity:1;pointer-events:auto}',
			'.mc-wb-sec-zh{margin:4px 0 16px;padding:8px 10px;border-radius:10px;background:var(--dsw-alias-interactive-bg-hover)}',
			'.mc-wb-right{display:flex;flex-direction:column;min-width:0;min-height:0;border-left:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}',
			'.mc-wb-tabs{display:flex;gap:6px;padding:8px 12px 0}',
			'.mc-wb-tab{font-size:12px;padding:4px 10px;border-radius:8px;border:.5px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
			'.mc-wb-tab[data-on="1"]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2);font-weight:600}',
			'.mc-wb-zh{font-size:13px;line-height:1.8;white-space:pre-wrap;word-break:break-word}',
			'.mc-wb-guide{overflow:auto;flex:1 1 auto;padding-top:6px}',
			'.mc-wb-guide-body{padding:2px 0 6px}',
			'.mc-wb-row{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}',
			'.mc-wb-note{font-size:11px;line-height:1.6;color:var(--dsw-alias-label-secondary)}',
			'.mc-wb-note-bad{color:var(--dsw-alias-state-error-primary)}',
			'.mc-wb-note-good{color:var(--dsw-alias-state-business-primary)}',
			'.mc-wb-note-warn{color:var(--dsw-alias-state-business-primary)}',
			'.mc-wb-fail{display:flex;flex-direction:column;gap:8px;align-items:flex-start}',
			'.mc-wb-loading{display:flex;flex-direction:column;gap:10px}',
			'.mc-wb-skeleton{height:12px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover);animation:mcWbPulse 1.4s ease-in-out infinite}',
			'.mc-wb-skeleton:nth-child(2n){width:88%}',
			'.mc-wb-skeleton:nth-child(3n){width:72%}',
			'@keyframes mcWbPulse{0%,100%{opacity:.45}50%{opacity:.9}}',
			'.mc-wb-cursor{display:inline-block;width:6px;height:14px;margin-left:2px;vertical-align:-2px;background:var(--dsw-alias-brand-primary);animation:mcWbBlink 1s steps(2,start) infinite}',
			'@keyframes mcWbBlink{50%{opacity:0}}',
			'.mc-wb-chatwrap{flex:1 1 auto}',
			'.mc-wb-chat{flex:1 1 auto;overflow:auto;display:flex;flex-direction:column;gap:8px;padding:2px 0}',
			'.mc-wb-views{display:inline-flex;gap:2px;padding:2px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);border:.5px solid var(--dsw-alias-border-l2)}',
			'.mc-wb-views .mc-wb-view{border:none;background:transparent;padding:3px 8px;font-size:11.5px;border-radius:6px;color:var(--dsw-alias-label-secondary)}',
			'.mc-wb-views .mc-wb-view[aria-pressed="true"]{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-weight:600}',
			'.mc-wb-para{display:flex;flex-direction:column;gap:4px}',
			'.mc-wb-para .mc-wb-p{margin:0}',
			'.mc-wb-ptools{position:absolute;right:0;top:-10px;z-index:2;display:inline-flex;gap:4px;opacity:0;pointer-events:none;transition:opacity .15s}',
			'.mc-wb-p.mc-wb-has-note{border-left:2px solid var(--dsw-alias-state-business-primary);padding-left:8px}',
			'.mc-wb-pair{border-left:2px solid var(--dsw-alias-border-l2);padding-left:10px;margin-bottom:10px}',
			'.mc-wb-pnotes{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 8px}',
			'.mc-wb-pnote{max-width:100%;text-align:left;font-size:11.5px;line-height:1.5;padding:4px 8px;border-radius:8px;border:.5px dashed var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
			'.mc-wb-pnote:hover{color:var(--dsw-alias-label-primary)}',
			'.mc-wb-flash{animation:mc-wb-flash 1.3s ease-out 1}',
			'@keyframes mc-wb-flash{0%{background:var(--dsw-alias-state-warn-primary)}100%{background:transparent}}',
			'.mc-wb-scope{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:4px 0}',
			'.mc-wb-scope .mc-wb-cap{margin:0}',
			'.mc-wb-scope .mc-wb-view{border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}',
			'.mc-wb-scope .mc-wb-view[aria-pressed="true"]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary);font-weight:600}',
			'.mc-wb-cites{display:flex;flex-wrap:wrap;gap:4px;margin-top:6px}',
			'.mc-wb-cite{font-size:11px;padding:1px 7px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer}',
			'.mc-wb-cite:hover{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-state-business-primary)}',
			'.mc-wb-gloss{display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);margin-top:8px}',
			'.mc-wb-gloss-input{font-family:inherit;font-size:12px;resize:vertical;min-height:72px}',
			'.mc-wb-notes{display:flex;flex-direction:column;gap:8px}',
			'.mc-wb-notecard{display:flex;flex-direction:column;gap:6px;padding:8px;border-radius:10px;border:.5px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-bg-layer-2)}',
			'.mc-wb-notecard-actions{display:flex;gap:6px}',
			'.mc-wb-note-input{font-family:inherit;font-size:12px;resize:vertical;min-height:88px}',
			'.mc-wb-notelist{display:flex;flex-direction:column;gap:8px}',
			'.mc-wb-noterow{display:flex;flex-direction:column;gap:4px;padding:8px 10px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}',
			'.mc-wb-notewhere{align-self:flex-start;font-size:11px;padding:1px 8px;border-radius:999px;border:.5px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
			'.mc-wb-notewhere:hover{color:var(--dsw-alias-state-business-primary);border-color:var(--dsw-alias-state-business-primary)}',
			'.mc-wb-notequote{font-size:11.5px;line-height:1.5;color:var(--dsw-alias-label-tertiary);border-left:2px solid var(--dsw-alias-border-l2);padding-left:8px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}',
			'.mc-wb-notetext{font-size:12.5px;line-height:1.65;white-space:pre-wrap;word-break:break-word}',
			'.mc-wb-noterow-actions{display:flex;gap:6px;justify-content:flex-end}',
			'.mc-wb-msg{font-size:12.5px;line-height:1.7;white-space:pre-wrap;word-break:break-word;padding:7px 10px;border-radius:10px;max-width:100%}',
			'.mc-wb-msg[data-role="user"]{align-self:flex-end;background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-invert,#fff)}',
			'.mc-wb-msg[data-role="assistant"]{align-self:flex-start;background:var(--dsw-alias-bg-layer-1);border:.5px solid var(--dsw-alias-border-l2)}',
			'.mc-wb-ask{display:flex;gap:8px;align-items:flex-end;padding-top:6px}',
			'.mc-wb-input{flex:1 1 auto;resize:vertical;min-height:44px;font-size:12.5px}',
			'.mc-wb-send{flex:0 0 auto}',
			'.mc-wb-end{text-align:center;padding:16px 0 4px}',
'.mc-wb-lib-page{display:flex;flex-direction:column;gap:10px;padding:12px 14px 16px;min-height:0;overflow:auto}',
'.mc-wb-lib-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
'.mc-wb-lib-h{font-size:14px;font-weight:600}',
'.mc-wb-lib-head .mc-muted{font-size:11px;color:var(--dsw-alias-label-secondary)}',
'.mc-wb-import{display:inline-flex;align-items:center;gap:6px;margin-left:auto}',
'.mc-wb-file{display:none}',
'.mc-wb-lib-notice{font-size:12px;padding:6px 10px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}',
'.mc-wb-lib-list{display:flex;flex-direction:column;gap:6px}',
'.mc-wb-lib-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1)}',
'.mc-wb-lib-row:hover{background:var(--dsw-alias-interactive-bg-hover)}',
'.mc-wb-lib-main{min-width:0;flex:1 1 auto;display:flex;flex-direction:column;gap:4px}',
'.mc-wb-lib-title{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'.mc-wb-lib-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:11px;color:var(--dsw-alias-label-secondary)}',
'.mc-wb-lib-venue{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'.mc-wb-lib-time{font-variant-numeric:tabular-nums}',
'.mc-wb-lib-acts{display:flex;gap:6px;flex:0 0 auto}',
'.mc-wb-lib-empty{padding:26px 12px;text-align:center}',
'.mc-wb-lib-hint{font-size:11px}',
'.mc-wb-back{flex:0 0 auto}',
'.mc-wb-open{white-space:nowrap}',
'.mc-ccf-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 10px}',
'.mc-ccf-bar .mc-caption{flex:0 0 auto}',
'.mc-ccf-chip[data-level="A"]{border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-state-warn-primary)}',
'.mc-ccf-chip[data-level="A"][aria-pressed="true"]{background:var(--dsw-alias-state-warn-primary);border-color:var(--dsw-alias-state-warn-primary);color:var(--dsw-alias-label-invert)}',
'.mc-ccf-hint{flex:1 1 auto;min-width:0;text-align:right}',
'.mc-ccf-badge{font-size:10px;font-weight:600;letter-spacing:.03em;line-height:1.5;padding:0 6px;border-radius:6px;border:.5px solid currentColor;color:var(--dsw-alias-label-tertiary);white-space:nowrap}',
'.mc-ccf-badge[data-level="A"]{color:var(--dsw-alias-state-warn-primary)}',
'.mc-ccf-badge[data-level="B"]{color:var(--dsw-alias-label-secondary)}',
			'.mc-push-actions{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}',
		].join('');

		/* ------------------------------------------------------------------ */
		/* Building blocks                                                     */
		/* ------------------------------------------------------------------ */

		const ICON_PLUS = h('svg', { viewBox: '0 0 16 16', width: 13, height: 13, 'aria-hidden': true },
			h('path', { d: 'M8 3v10M3 8h10', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }));
		const ICON_FOLDER = h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true },
			h('path', { d: 'M2 4.5A1.5 1.5 0 0 1 3.5 3h2.4c.4 0 .8.2 1 .5l.6.8h4.9A1.5 1.5 0 0 1 14 5.8v5.7A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7Z', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }));
		const ICON_UP = h('svg', { viewBox: '0 0 16 16', width: 13, height: 13, 'aria-hidden': true },
			h('path', { d: 'M8 13V3M3.5 7.5 8 3l4.5 4.5', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }));
		const ICON_FILE = h('svg', { viewBox: '0 0 16 16', width: 13, height: 13, 'aria-hidden': true },
			h('path', { d: 'M4 1.8h5l3 3v9.4H4V1.8Z', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }),
			h('path', { d: 'M9 1.9v3h3', stroke: 'currentColor', strokeWidth: 1.3, strokeLinejoin: 'round' }));
		const ICON_CHECK = h('svg', { viewBox: '0 0 16 16', width: 11, height: 11, 'aria-hidden': true },
			h('path', { d: 'M3 8.4 6.4 12 13 4.6', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }));
		const ICON_CLOSE = h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true },
			h('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }));

		function Modal(props) {
			const { title, children, footer, onClose, wide } = props;
			const box = useRef(null);
			useEffect(() => {
				const onKeyDown = (event) => {
					if (event.key === 'Escape') {
						event.preventDefault();
						event.stopPropagation();
						if (onClose) onClose();
					}
				};
				document.addEventListener('keydown', onKeyDown, true);
				return () => document.removeEventListener('keydown', onKeyDown, true);
			}, [onClose]);
			useEffect(() => {
				const node = box.current;
				if (!node) return;
				const focusable = node.querySelector('input,textarea,button');
				if (focusable) focusable.focus();
			}, []);
			return h('div', { className: 'mc-overlay', onMouseDown: (event) => { if (event.target === event.currentTarget && onClose) onClose(); } },
				h('div', { className: wide ? 'mc-dialog mc-dialog-wide' : 'mc-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, ref: box },
					h('div', { className: 'mc-dialog-head' },
						h('h2', null, title),
						onClose ? h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: onClose, 'aria-label': 'close' }, ICON_CLOSE) : null),
					h('div', { className: 'mc-dialog-body' }, children),
					footer ? h('div', { className: 'mc-dialog-foot' }, footer) : null));
		}

		function EntryChip(props) {
			const { entry, t, onOpen } = props;
			const hue = hueOf(entry.name);
			const detail = entry.kind === 'activity' ? entry.note || entry.room : entry.room;
			return h('div', {
				className: 'mc-entry',
				'data-kind': entry.kind,
				role: 'button',
				tabIndex: 0,
				title: [entry.name, entry.teacher, entry.room, entry.note].filter(Boolean).join(' · '),
				onClick: (event) => {
					event.stopPropagation();
					onOpen(entry);
				},
				onKeyDown: (event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						onOpen(entry);
					}
				},
			},
				h('span', { className: 'mc-entry-bar', style: { background: 'hsl(' + hue + ' 72% 54%)' } }),
				h('span', { className: 'mc-entry-name' }, entry.name),
				detail ? h('span', { className: 'mc-entry-room' }, detail) : null,
				entry.kind === 'activity' ? h('span', { className: 'mc-entry-kind' }, t('kind.activity')) : null);
		}

		function TimetableGrid(props) {
			const { t, periods, entries, week, showWeekend, onSlotClick, onEntryClick, onEditTimes } = props;
			const dayCount = showWeekend ? 7 : 5;
			const days = useMemo(() => {
				const list = [];
				for (let day = 0; day < dayCount; day += 1) list.push(day);
				return list;
			}, [dayCount]);
			const cells = useMemo(() => buildGrid(entries, periods, dayCount), [entries, periods, dayCount]);
			const current = todayIndex();
			return h('div', { className: 'mc-tablewrap' },
				h('table', { className: 'mc-table' },
					h('thead', null,
						h('tr', null,
							h('th', { className: 'mc-headcell mc-corner', scope: 'col', title: t('corner.edit'), onClick: onEditTimes }, t('corner')),
							days.map((day) => h('th', {
								key: day,
								scope: 'col',
								className: current === day ? 'mc-headcell mc-today' : 'mc-headcell',
							}, t(DAY_KEYS[day]))))),
					h('tbody', null,
						periods.map((period, rowIndex) => h('tr', { key: period.id },
							h('th', { className: 'mc-timecell', scope: 'row', title: t('corner.edit'), onClick: onEditTimes },
								h('span', { className: 'mc-period' }, period.label),
								period.start || period.end
									? h('span', { className: 'mc-clock' }, (period.start || '') + (period.end ? '–' + period.end : ''))
									: null),
							days.map((day) => {
								const cell = cells[day][rowIndex];
								if (cell && cell.kind === 'covered') return null;
								if (cell && cell.kind === 'start') {
									return h('td', { key: day, rowSpan: cell.span },
										h(EntryChip, { entry: cell.entry, t, onOpen: onEntryClick }));
								}
								return h('td', { key: day, className: 'mc-slot', onClick: () => onSlotClick(day, period.id), title: t('add.entry') });
							}))))));
		}

		function TodayCard(props) {
			const { t, entries, periods, week, now, tasks } = props;
			const day = todayIndex();
			const order = new Map(periods.map((period, index) => [period.id, index]));
			const items = entries
				.filter((entry) => entry.day === day && entryInWeek(entry, week))
				.map((entry) => {
					const indexes = entry.periodIds
						.map((id) => order.get(id))
						.filter((index) => index !== undefined)
						.sort((left, right) => left - right);
					const first = indexes.length > 0 ? periods[indexes[0]] : null;
					const last = indexes.length > 0 ? periods[indexes[indexes.length - 1]] : null;
					return {
						entry,
						start: first ? parseClock(first.start) : null,
						end: last ? parseClock(last.end) : null,
						label: first && last ? (first.start || '') + (last.end ? '–' + last.end : '') : '',
					};
				})
				.sort((left, right) => (left.start === null ? Number.MAX_SAFE_INTEGER : left.start) - (right.start === null ? Number.MAX_SAFE_INTEGER : right.start));
			const minutes = now.getHours() * 60 + now.getMinutes();
			const running = items.find((item) => item.start !== null && item.end !== null && item.start <= minutes && minutes < item.end) || null;
			const upcoming = items.find((item) => item.start !== null && item.start > minutes) || null;
			let status;
			if (running) {
				status = format(t('today.now'), { name: running.entry.name });
				if (running.end !== null) status += ' · ' + format(t('today.left'), { minutes: Math.max(1, running.end - minutes) });
			} else if (upcoming) {
				status = format(t('today.next'), { name: upcoming.entry.name }) + ' · ' + format(t('today.in'), { minutes: Math.max(1, upcoming.start - minutes) });
			} else {
				status = items.length > 0 ? t('today.done') : t('today.empty');
			}
			const taskList = Array.isArray(tasks) ? tasks : [];
			const dueToday = taskList.filter((task) => !task.done && taskState(task, now) === 'today').length;
			const overdue = taskList.filter((task) => !task.done && taskState(task, now) === 'overdue').length;
			return h('div', { className: 'mc-card mc-today' },
				h('div', { className: 'mc-today-head' },
					h('strong', null, t('today.title') + ' · ' + t(DAY_KEYS[day])),
					h('span', { className: 'mc-badge' }, format(t('week.label'), { week })),
					h('span', { className: 'mc-caption mc-today-status' }, status),
					overdue + dueToday > 0 ? h('span', { className: 'mc-badge mc-task-late' }, format(t('today.tasks'), { overdue, today: dueToday })) : null),
				items.length > 0 ? h('div', { className: 'mc-today-items' }, items.map((item) => h('div', {
					key: item.entry.id,
					className: 'mc-today-item',
					'data-state': running && running.entry.id === item.entry.id ? 'now' : upcoming && upcoming.entry.id === item.entry.id ? 'next' : 'later',
				},
					h('span', { className: 'mc-today-time' }, item.label || '—'),
					h('span', { className: 'mc-today-name' }, item.entry.name),
					item.entry.room ? h('span', { className: 'mc-today-room' }, item.entry.room) : null))) : null);
		}

		function EntryDialog(props) {
			const { t, value, periods, weekCount, onCancel, onSave, onDelete } = props;
			const total = Math.max(1, Math.trunc(Number(weekCount)) || 20);
			const initialWeeks = value.weeks || { start: 1, end: total, parity: 'all' };
			const [kind, setKind] = useState(value.kind === 'activity' ? 'activity' : 'course');
			const [name, setName] = useState(value.name || '');
			const [room, setRoom] = useState(value.room || '');
			const [teacher, setTeacher] = useState(value.teacher || '');
			const [note, setNote] = useState(value.note || '');
			const [day, setDay] = useState(typeof value.day === 'number' ? value.day : 0);
			const [periodIds, setPeriodIds] = useState(Array.isArray(value.periodIds) ? value.periodIds.slice() : []);
			const [weekStart, setWeekStart] = useState(String(initialWeeks.start || 1));
			const [weekEnd, setWeekEnd] = useState(String(initialWeeks.end || total));
			const [parity, setParity] = useState(initialWeeks.parity || 'all');
			const fromWeek = Math.min(Math.max(1, Math.trunc(Number(weekStart)) || 1), total);
			const toWeek = Math.min(Math.max(fromWeek, Math.trunc(Number(weekEnd)) || total), total);
			const valid = name.trim().length > 0 && periodIds.length > 0;
			const toggle = (id) => {
				setPeriodIds((current) => (current.indexOf(id) >= 0 ? current.filter((item) => item !== id) : current.concat([id])));
			};
			const submit = () => {
				if (!valid) return;
				onSave({
					kind,
					name: name.trim(),
					room: room.trim(),
					teacher: teacher.trim(),
					note: note.trim(),
					day,
					periodIds: periods.filter((period) => periodIds.indexOf(period.id) >= 0).map((period) => period.id),
					weeks: { start: fromWeek, end: toWeek, parity },
				});
			};
			return h(Modal, {
				title: value.id ? t('edit.entry') : t('add.entry'),
				onClose: onCancel,
				footer: [
					onDelete ? h('button', { key: 'delete', type: 'button', className: 'mc-btn mc-btn-danger', style: { marginRight: 'auto' }, onClick: onDelete }, t('delete')) : null,
					h('button', { key: 'cancel', type: 'button', className: 'mc-btn', onClick: onCancel }, t('cancel')),
					h('button', { key: 'save', type: 'button', className: 'mc-btn mc-btn-primary', disabled: !valid, onClick: submit }, t('save')),
				],
			},
				h('div', { className: 'mc-field' },
					h('span', null, t('field.kind')),
					h('div', { className: 'mc-chips' },
						h('button', { type: 'button', className: 'mc-chip', 'aria-pressed': kind === 'course', onClick: () => setKind('course') }, t('kind.course')),
						h('button', { type: 'button', className: 'mc-chip', 'aria-pressed': kind === 'activity', onClick: () => setKind('activity') }, t('kind.activity')))),
				h('div', { className: 'mc-field' },
					h('span', null, t('field.name')),
					h('input', { className: 'mc-input', value: name, placeholder: kind === 'activity' ? '社团活动' : '高等数学', onChange: (event) => setName(event.target.value) })),
				h('div', { className: 'mc-row' },
					h('div', { className: 'mc-field', style: { flex: '1 1 200px' } },
						h('span', null, t('field.room')),
						h('input', { className: 'mc-input', value: room, placeholder: kind === 'activity' ? '体育馆' : 'A 楼 302', onChange: (event) => setRoom(event.target.value) })),
					h('div', { className: 'mc-field', style: { flex: '1 1 200px' } },
						h('span', null, t('field.teacher')),
						h('input', { className: 'mc-input', value: teacher, onChange: (event) => setTeacher(event.target.value) }))),
				h('div', { className: 'mc-field' },
					h('span', null, t('field.note')),
					h('input', { className: 'mc-input', value: note, onChange: (event) => setNote(event.target.value) })),
				h('div', { className: 'mc-field' },
					h('span', null, t('field.day')),
					h('div', { className: 'mc-chips' }, [0, 1, 2, 3, 4, 5, 6].map((index) => h('button', {
						key: index,
						type: 'button',
						className: 'mc-chip',
						'aria-pressed': day === index,
						onClick: () => setDay(index),
					}, t(DAY_KEYS[index]))))),
				h('div', { className: 'mc-field' },
					h('span', null, t('field.periods')),
					h('div', { className: 'mc-chips' }, periods.map((period) => h('button', {
						key: period.id,
						type: 'button',
						className: 'mc-chip',
						'aria-pressed': periodIds.indexOf(period.id) >= 0,
						onClick: () => toggle(period.id),
					}, period.label)))),
				h('div', { className: 'mc-field' },
					h('span', null, t('field.weeks')),
					h('div', { className: 'mc-row' },
						h('input', { className: 'mc-input', style: { width: '80px' }, inputMode: 'numeric', value: weekStart, 'aria-label': t('field.weeks.from'), onChange: (event) => setWeekStart(event.target.value.replace(/[^\d]/g, '')) }),
						h('span', { className: 'mc-caption', style: { margin: 0 } }, '–'),
						h('input', { className: 'mc-input', style: { width: '80px' }, inputMode: 'numeric', value: weekEnd, 'aria-label': t('field.weeks.to'), onChange: (event) => setWeekEnd(event.target.value.replace(/[^\d]/g, '')) }),
						h('div', { className: 'mc-chips' },
							h('button', { type: 'button', className: 'mc-chip', 'aria-pressed': parity === 'all', onClick: () => setParity('all') }, t('parity.all')),
							h('button', { type: 'button', className: 'mc-chip', 'aria-pressed': parity === 'odd', onClick: () => setParity('odd') }, t('parity.odd')),
							h('button', { type: 'button', className: 'mc-chip', 'aria-pressed': parity === 'even', onClick: () => setParity('even') }, t('parity.even'))))));
		}

		function TermDialog(props) {
			const { t, value, onCancel, onSave, onDelete } = props;
			const [name, setName] = useState(value.name || '');
			const [startDate, setStartDate] = useState(value.startDate || isoDate(mondayOf(new Date())));
			const [weekCount, setWeekCount] = useState(String(value.weekCount || 20));
			const total = Math.min(30, Math.max(1, Math.trunc(Number(weekCount)) || 20));
			const valid = name.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(startDate);
			const submit = () => {
				if (!valid) return;
				onSave({ name: name.trim(), startDate, weekCount: total });
			};
			return h(Modal, {
				title: value.id ? t('term.edit') : t('term.new'),
				onClose: onCancel,
				footer: [
					onDelete ? h('button', { key: 'delete', type: 'button', className: 'mc-btn mc-btn-danger', style: { marginRight: 'auto' }, onClick: onDelete }, t('term.delete')) : null,
					h('button', { key: 'cancel', type: 'button', className: 'mc-btn', onClick: onCancel }, t('cancel')),
					h('button', { key: 'save', type: 'button', className: 'mc-btn mc-btn-primary', disabled: !valid, onClick: submit }, t('save')),
				],
			},
				h('div', { className: 'mc-field' },
					h('span', null, t('term.name')),
					h('input', { className: 'mc-input', value: name, placeholder: '2026 秋', onChange: (event) => setName(event.target.value) })),
				h('div', { className: 'mc-field' },
					h('span', null, t('term.start')),
					h('input', { className: 'mc-input', type: 'date', value: startDate, onChange: (event) => setStartDate(event.target.value) })),
				h('div', { className: 'mc-field' },
					h('span', null, t('term.weeks')),
					h('input', { className: 'mc-input', style: { width: '120px' }, inputMode: 'numeric', value: weekCount, onChange: (event) => setWeekCount(event.target.value.replace(/[^\d]/g, '')) })),
				h('p', { className: 'mc-caption', style: { margin: 0 } }, t('term.hint')));
		}

		function PeriodsDialog(props) {
			const { t, periods, onCancel, onSave } = props;
			const [rows, setRows] = useState(periods.map((period) => ({ ...period })));
			const patch = (index, key, value) => {
				setRows((current) => current.map((row, position) => (position === index ? { ...row, [key]: value } : row)));
			};
			const valid = rows.length > 0;
			return h(Modal, {
				title: t('periods'),
				onClose: onCancel,
				footer: [
					h('button', { key: 'add', type: 'button', className: 'mc-btn', style: { marginRight: 'auto' }, onClick: () => setRows((current) => current.concat([{ id: uid(), label: '第' + (current.length + 1) + '节', start: '', end: '' }])) }, ICON_PLUS, t('periods.add')),
					h('button', { key: 'cancel', type: 'button', className: 'mc-btn', onClick: onCancel }, t('cancel')),
					h('button', { key: 'save', type: 'button', className: 'mc-btn mc-btn-primary', disabled: !valid, onClick: () => onSave(rows) }, t('save')),
				],
			},
				h('p', { className: 'mc-caption' }, t('periods.hint')),
				h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
					rows.map((row, index) => h('div', { key: row.id, className: 'mc-periodrow' },
						h('input', { className: 'mc-input', value: row.label, 'aria-label': t('periods.label'), onChange: (event) => patch(index, 'label', event.target.value) }),
						h('input', { className: 'mc-input', value: row.start, placeholder: '08:00', 'aria-label': t('periods.start'), onChange: (event) => patch(index, 'start', event.target.value) }),
						h('input', { className: 'mc-input', value: row.end, placeholder: '08:45', 'aria-label': t('periods.end'), onChange: (event) => patch(index, 'end', event.target.value) }),
						h('button', {
							type: 'button',
							className: 'mc-btn mc-btn-sm mc-btn-danger',
							disabled: rows.length <= 1,
							onClick: () => setRows((current) => current.filter((item) => item.id !== row.id)),
						}, t('periods.remove'))))));
		}

		function AiDialog(props) {
			const { t, periods, onCancel, onImport, notify, initialError, initialText } = props;
			const [text, setText] = useState(initialText || '');
			const [replace, setReplace] = useState(true);
			const [error, setError] = useState(initialError || '');
			const copy = async () => {
				try {
					await navigator.clipboard.writeText(AI_PROMPT);
					notify(t('ai.copied'));
				} catch (failed) {
					setText(AI_PROMPT);
				}
			};
			const apply = () => {
				setError('');
				try {
					onImport(parseTimetable(text, periods), replace);
				} catch (failed) {
					const code = failed && failed.message;
					if (code === 'EMPTY') setError(t('ai.empty'));
					else if (code === 'NOCOURSES') setError(t('ai.noCourses'));
					else if (code === 'NOUSABLE') setError(t('ai.noUsable'));
					else setError(t('ai.invalid'));
				}
			};
			return h(Modal, {
				title: t('ai.title'),
				wide: true,
				onClose: onCancel,
				footer: [
					h('button', { key: 'copy', type: 'button', className: 'mc-btn', style: { marginRight: 'auto' }, onClick: copy }, t('ai.copyPrompt')),
					h('button', { key: 'cancel', type: 'button', className: 'mc-btn', onClick: onCancel }, t('cancel')),
					h('button', { key: 'apply', type: 'button', className: 'mc-btn mc-btn-primary', onClick: apply }, t('ai.apply')),
				],
			},
				h('div', { className: 'mc-card', style: { background: 'var(--dsw-specific-sidebar-fill)', border: '0', display: 'flex', flexDirection: 'column', gap: '4px' } },
					h('p', { style: { margin: 0, fontSize: '12px', lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' } }, t('ai.step1')),
					h('p', { style: { margin: 0, fontSize: '12px', lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' } }, t('ai.step2')),
					h('p', { style: { margin: 0, fontSize: '12px', lineHeight: '20px', color: 'var(--dsw-alias-label-secondary)' } }, t('ai.step3'))),
				h('div', { className: 'mc-field' },
					h('span', null, t('ai.paste')),
					h('textarea', { className: 'mc-input', value: text, spellCheck: false, onChange: (event) => setText(event.target.value), placeholder: '{"courses":[{"name":"高等数学","room":"A302","day":0,"periods":[1,2]}]}' })),
				h('label', { className: 'mc-row', style: { fontSize: '13px' } },
					h('input', { type: 'checkbox', checked: replace, onChange: (event) => setReplace(event.target.checked) }),
					t('ai.replace')),
				error ? h('p', { className: 'mc-error' }, error) : null);
		}

		function taskState(task, now) {
			if (!task || !task.due) return 'none';
			const due = new Date(task.due);
			if (Number.isNaN(due.getTime())) return 'none';
			if (now.getTime() >= due.getTime()) return 'overdue';
			const days = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / 86400000);
			if (days === 0) return 'today';
			if (days === 1) return 'tomorrow';
			if (days <= 7) return 'week';
			return 'later';
		}

		function taskDueLabel(task) {
			if (!task || !task.due) return '';
			const due = new Date(task.due);
			if (Number.isNaN(due.getTime())) return '';
			const hasTime = /T\d{2}:\d{2}/.test(task.due);
			return isoDate(due) + (hasTime ? ' ' + task.due.slice(11, 16) : '');
		}

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

		/* R3：已完成任务不再走倒计时判定，一律「已完成 · <日期>」，且 tone 恒为空。 */
		function taskCountdownFor(task, now) {
			if (task && task.done) {
				const date = taskDueLabel(task);
				return date ? { key: 'task.doneOn', params: { date }, tone: '' } : null;
			}
			const base = taskCountdown(task, now);
			if (!base) return null;
			const kind = taskState(task, now);
			const tone = kind === 'overdue' ? ' mc-task-late' : kind === 'today' || kind === 'tomorrow' ? ' mc-task-today' : '';
			return { ...base, tone };
		}

		function byDue(left, right) {
			const a = left.due ? new Date(left.due).getTime() : Number.MAX_SAFE_INTEGER;
			const b = right.due ? new Date(right.due).getTime() : Number.MAX_SAFE_INTEGER;
			if (a !== b) return a - b;
			return String(left.title).localeCompare(String(right.title));
		}

		function TaskRow(props) {
			const { t, task, now, onToggle, onEdit, onDelete, showCourse } = props;
			const kind = taskState(task, now);
			const tier = task.done ? 'normal' : kind === 'overdue' ? 'overdue' : kind === 'today' || kind === 'tomorrow' ? 'due' : 'normal';
			const countdown = taskCountdownFor(task, now);
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
			return h('article', { className: 'mc-task mc-note', 'data-state': task.done ? 'done' : kind, 'data-done': task.done ? 'true' : 'false', 'data-tier': tier },
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
						countdown ? h('span', { className: 'mc-task-due' + countdown.tone }, format(t(countdown.key), countdown.params)) : null)),
				h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-btn-danger', onClick: () => onDelete(task) }, t('delete')));
		}

		function CourseCard(props) {
			const { t, course, entries, tasks, periods, week, folders, now, onEdit, onAddTask, onToggleTask, onEditTask, onDeleteTask, onOpenFiles, notify } = props;
			const [dragging, setDragging] = useState(false);
			const pieces = entries
				.filter((entry) => entry.kind === 'course' && entry.name === course.name && entryInWeek(entry, week))
				.map((entry) => {
					const indexes = entry.periodIds
						.map((id) => periods.findIndex((period) => period.id === id))
						.filter((index) => index >= 0)
						.sort((left, right) => left - right);
					const first = indexes.length > 0 ? periods[indexes[0]] : null;
					const last = indexes.length > 0 ? periods[indexes[indexes.length - 1]] : null;
					return {
						key: entry.id,
						day: t(DAY_KEYS[entry.day]),
						periodLabel: first && last ? (first === last ? first.label : first.label + '–' + last.label) : '',
						time: first && last ? (first.start || '') + (last.end ? '–' + last.end : '') : '',
						room: entry.room,
					};
				});
			const openTasks = tasks.filter((task) => !task.done).sort(byDue);
			const handleDrop = async (event) => {
				event.preventDefault();
				setDragging(false);
				const files = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
				if (files.length === 0) return;
				const folder = folders[0];
				if (!folder) {
					notify(t('course.needFolder'), 'error');
					return;
				}
				if (!HAS_DIRECTORY_ACCESS) {
					notify(t('course.noDrop'), 'error');
					return;
				}
				const handle = await getHandle(folder.id);
				if (!handle) {
					notify(t('course.needFolder'), 'error');
					return;
				}
				if (!(await ensurePermission(handle, 'readwrite'))) {
					notify(t('folder.notAllowed'), 'error');
					return;
				}
				let written = 0;
				for (const file of files) {
					try {
						const target = await handle.getFileHandle(file.name, { create: true });
						const writable = await target.createWritable();
						await writable.write(file);
						await writable.close();
						written += 1;
					} catch (error) {
						/* the count reports what landed */
					}
				}
				notify(format(t('course.dropped'), { count: written }), written > 0 ? 'info' : 'error');
			};
			return h('div', {
				className: 'mc-card mc-course-card',
				'data-dragging': dragging ? 'true' : 'false',
				onDragOver: (event) => {
					if (!folders.length) return;
					event.preventDefault();
					setDragging(true);
				},
				onDragLeave: () => setDragging(false),
				onDrop: handleDrop,
			},
				h('div', { className: 'mc-course-head' },
					h('div', { className: 'mc-course-title' },
						h('strong', null, course.name),
						course.credits ? h('span', { className: 'mc-badge' }, format(t('course.credits'), { value: course.credits })) : null,
						course.teacher ? h('span', { className: 'mc-caption', style: { margin: 0 } }, course.teacher) : null),
					h('div', { className: 'mc-row' },
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => onOpenFiles(course) }, ICON_FOLDER, t('course.files')),
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => onEdit(course) }, t('course.edit')))),
				course.note ? h('p', { className: 'mc-course-note' }, course.note) : null,
				pieces.length > 0
					? h('div', { className: 'mc-course-slots' }, pieces.map((piece) => h('div', { key: piece.key, className: 'mc-course-slot' },
						h('span', { className: 'mc-course-when' }, piece.day + (piece.periodLabel ? ' ' + piece.periodLabel : '')),
						piece.time ? h('span', { className: 'mc-course-time' }, piece.time) : null,
						piece.room ? h('span', { className: 'mc-course-room' }, piece.room) : null)))
					: h('span', { className: 'mc-caption' }, t('course.noClassThisWeek')),
				h('div', { className: 'mc-course-tasks' },
					h('div', { className: 'mc-course-tasks-head' },
						h('span', { className: 'mc-caption', style: { margin: 0 } }, format(t('course.taskCount'), { count: openTasks.length })),
						h('div', { className: 'mc-spacer' }),
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => onAddTask(course) }, ICON_PLUS, t('task.new'))),
					openTasks.slice(0, 5).map((task) => h(TaskRow, {
						key: task.id,
						t,
						task,
						now,
						showCourse: false,
						onToggle: onToggleTask,
						onEdit: onEditTask,
						onDelete: onDeleteTask,
					})),
					openTasks.length > 5 ? h('span', { className: 'mc-caption' }, format(t('course.moreTasks'), { count: openTasks.length - 5 })) : null),
				h('span', { className: 'mc-course-drop' }, folders.length > 0 ? t('course.dropHere') : t('course.needFolder')));
		}

		function CourseDialog(props) {
			const { t, value, onCancel, onSave } = props;
			const [teacher, setTeacher] = useState(value.teacher || '');
			const [credits, setCredits] = useState(value.credits || '');
			const [note, setNote] = useState(value.note || '');
			return h(Modal, {
				title: t('course.edit'),
				onClose: onCancel,
				footer: [
					h('button', { key: 'cancel', type: 'button', className: 'mc-btn', onClick: onCancel }, t('cancel')),
					h('button', { key: 'save', type: 'button', className: 'mc-btn mc-btn-primary', onClick: () => onSave({ teacher: teacher.trim(), credits: credits.trim(), note: note.trim() }) }, t('save')),
				],
			},
				h('p', { className: 'mc-caption', style: { margin: 0 } }, value.name),
				h('div', { className: 'mc-row' },
					h('div', { className: 'mc-field', style: { flex: '1 1 200px' } },
						h('span', null, t('field.teacher')),
						h('input', { className: 'mc-input', value: teacher, onChange: (event) => setTeacher(event.target.value) })),
					h('div', { className: 'mc-field', style: { flex: '0 1 120px' } },
						h('span', null, t('course.creditsField')),
						h('input', { className: 'mc-input', value: credits, onChange: (event) => setCredits(event.target.value) }))),
				h('div', { className: 'mc-field' },
					h('span', null, t('field.note')),
					h('input', { className: 'mc-input', value: note, onChange: (event) => setNote(event.target.value) })));
		}

		function TaskDialog(props) {
			const { t, value, courses, onCancel, onSave, onDelete } = props;
			const [title, setTitle] = useState(value.title || '');
			const [courseName, setCourseName] = useState(value.courseName || '');
			const [due, setDue] = useState(value.due || '');
			const [note, setNote] = useState(value.note || '');
			const valid = title.trim().length > 0;
			const submit = () => {
				if (!valid) return;
				onSave({ title: title.trim(), courseName, due, note: note.trim() });
			};
			return h(Modal, {
				title: value.id ? t('task.edit') : t('task.new'),
				onClose: onCancel,
				footer: [
					onDelete ? h('button', { key: 'delete', type: 'button', className: 'mc-btn mc-btn-danger', style: { marginRight: 'auto' }, onClick: onDelete }, t('delete')) : null,
					h('button', { key: 'cancel', type: 'button', className: 'mc-btn', onClick: onCancel }, t('cancel')),
					h('button', { key: 'save', type: 'button', className: 'mc-btn mc-btn-primary', disabled: !valid, onClick: submit }, t('save')),
				],
			},
				h('div', { className: 'mc-field' },
					h('span', null, t('task.title')),
					h('input', { className: 'mc-input', value: title, placeholder: t('task.titlePlaceholder'), onChange: (event) => setTitle(event.target.value) })),
				h('div', { className: 'mc-row' },
					h('div', { className: 'mc-field', style: { flex: '1 1 200px' } },
						h('span', null, t('task.course')),
						h('select', { className: 'mc-input', value: courseName, onChange: (event) => setCourseName(event.target.value) },
							h('option', { value: '' }, t('task.noCourse')),
							courses.map((course) => h('option', { key: course.id, value: course.name }, course.name)))),
					h('div', { className: 'mc-field', style: { flex: '1 1 200px' } },
						h('span', null, t('task.due')),
						h('input', { className: 'mc-input', type: 'datetime-local', value: due, onChange: (event) => setDue(event.target.value) }))),
				h('div', { className: 'mc-field' },
					h('span', null, t('field.note')),
					h('input', { className: 'mc-input', value: note, onChange: (event) => setNote(event.target.value) })));
		}

		function TasksPane(props) {
			const { t, tasks, courses, now, onNew, onToggle, onEdit, onDelete } = props;
			const [filter, setFilter] = useState('open');
			const open = tasks.filter((task) => !task.done).sort(byDue);
			const done = tasks.filter((task) => task.done).sort(byDue);
			const overdue = open.filter((task) => taskState(task, now) === 'overdue').length;
			const today = open.filter((task) => taskState(task, now) === 'today').length;
			const shown = filter === 'done' ? done : filter === 'all' ? open.concat(done) : open;
			return h('div', { className: 'mc-tasks' },
				h('div', { className: 'mc-toolbar' },
					h('button', { type: 'button', className: 'mc-btn mc-btn-primary', onClick: () => onNew(null) }, ICON_PLUS, t('task.new')),
					h('div', { className: 'mc-spacer' }),
					h('button', { type: 'button', className: 'mc-btn mc-btn-sm', 'aria-pressed': filter === 'open', onClick: () => setFilter('open') }, format(t('task.filterOpen'), { count: open.length })),
					h('button', { type: 'button', className: 'mc-btn mc-btn-sm', 'aria-pressed': filter === 'done', onClick: () => setFilter('done') }, format(t('task.filterDone'), { count: done.length })),
					h('button', { type: 'button', className: 'mc-btn mc-btn-sm', 'aria-pressed': filter === 'all', onClick: () => setFilter('all') }, t('task.filterAll'))),
				overdue + today > 0 ? h('div', { className: 'mc-banner' }, format(t('task.summary'), { overdue, today })) : null,
				shown.length === 0
					? h('div', { className: 'mc-card', style: { textAlign: 'center', padding: '32px 16px', color: 'var(--dsw-alias-label-tertiary)' } },
						h('p', { style: { margin: 0, fontSize: '13px' } }, filter === 'done' ? t('task.emptyDone') : t('task.empty')))
					: h('div', { className: 'mc-task-list' }, shown.map((task) => h(TaskRow, {
						key: task.id,
						t,
						task,
						now,
						onToggle,
						onEdit,
						onDelete,
					}))),
				h('div', { className: 'mc-hint' }, t('task.hint')));
		}


		function daysUntil(deadline, now) {
			const date = dateOfText(deadline);
			if (!date) return null;
			return Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86400000);
		}

		/* 时间轴条目倒计时（§3.2 判定表）：与竞赛/任务共用 daysUntil，只此一套算术。 */
		function planCountdown(entry, now) {
			if (!entry) return null;
			if (!entry.date) return { key: 'plan.noDate', params: {}, tone: '' };
			if (entry.done) return { key: 'plan.doneOn', params: { date: entry.date }, tone: '' };
			const days = daysUntil(entry.date, now);
			if (days === null) return { key: 'plan.noDate', params: {}, tone: '' };
			if (days < 0) return { key: 'competition.overdue', params: { days: Math.abs(days) }, tone: ' mc-task-late' };
			if (days === 0) return { key: 'task.dueToday', params: {}, tone: ' mc-task-today' };
			if (days === 1) return { key: 'task.dueTomorrow', params: {}, tone: ' mc-task-today' };
			return { key: 'competition.left', params: { days }, tone: days <= 7 ? ' mc-task-today' : '' };
		}

		function PapersPane(props) {
			const { t, research, busy, onRefresh, onToggleDirection, onKeywords, onToggleSave, onOpenWorkbench } = props;
			const [keywordDraft, setKeywordDraft] = useState(research.keywords || '');
			const [savedOnly, setSavedOnly] = useState(false);
			const [openId, setOpenId] = useState(null);
			const [activeTag, setActiveTag] = useState('');
			const [ccfFilter, setCcfFilter] = useState('all');
			const saved = research.saved || [];
			const savedIds = new Set(saved.map((item) => item.id));
			const items = savedOnly ? saved : research.items || [];
			const tags = paperTagCounts(items);
			/* CCF 只按会议/期刊名离线匹配，认不出来就是空串；排序把 A 提到最前，其余保持抓取顺序。 */
			const ccfOf = (item) => paperCcfLevel({ venue: item.venue, comment: item.comment });
			const visible = (activeTag ? items.filter((item) => paperTagList(item).indexOf(activeTag) >= 0) : items)
				.filter((item) => (ccfFilter === 'all' ? true : ccfFilter === 'A' ? ccfOf(item) === 'A' : Boolean(ccfOf(item))))
				.slice()
				.sort((left, right) => ccfRank(ccfOf(left)) - ccfRank(ccfOf(right)));
			const fetched = research.fetchedAt ? new Date(research.fetchedAt).toLocaleString() : '';
			const renderMeta = (item) => {
				const authors = Array.isArray(item.authors) ? item.authors : [];
				const shown = authors.slice(0, 3);
				const category = item.primaryCategory || item.category;
				const doiHref = item.doiUrl || (item.doi ? 'https://doi.org/' + item.doi : '');
				const venue = paperVenueMeta(item, t);
				return h('div', { className: 'mc-paper-meta' },
					item.published ? h('span', { className: 'mc-paper-date' }, item.published) : null,
					venue.text ? h('span', { className: 'mc-paper-venue', title: venue.title }, venue.text) : null,
					ccfOf(item) ? h('span', { className: 'mc-ccf-badge', 'data-level': ccfOf(item), title: t('wb.ccfNote') }, 'CCF-' + ccfOf(item)) : null,
					category ? h('span', { className: 'mc-badge' }, category) : null,
					item.arxivId ? h('a', { className: 'mc-paper-id', href: item.url, target: '_blank', rel: 'noreferrer' }, item.arxivId) : null,
					doiHref ? h('a', { className: 'mc-paper-doi', href: doiHref, target: '_blank', rel: 'noreferrer' }, t('paper.doi')) : null,
					shown.length > 0
						? h('span', { className: 'mc-paper-authors' }, shown.join(', ') + (authors.length > 3 ? ' ' + format(t('paper.authorsMore'), { count: authors.length - 3 }) : ''))
						: null);
			};
			const tagRail = h('aside', { className: 'mc-paper-tags', 'aria-label': t('paper.tags') },
				h('div', { className: 'mc-paper-tags-head' }, t('paper.tags')),
				tags.length === 0
					? h('p', { className: 'mc-paper-tags-empty' }, t('paper.tagEmpty'))
					: tags.map((tag) => h('button', {
						key: tag.label,
						type: 'button',
						className: 'mc-chip mc-paper-tag',
						'aria-pressed': activeTag === tag.label,
						onClick: () => setActiveTag(activeTag === tag.label ? '' : tag.label),
					}, h('span', { className: 'mc-paper-tag-label' }, tag.label), h('span', { className: 'mc-badge' }, String(tag.count)))));
			const emptyCard = (text) => h('div', { className: 'mc-card', style: { textAlign: 'center', padding: '34px 16px', color: 'var(--dsw-alias-label-tertiary)' } },
				h('p', { style: { margin: 0, fontSize: '13px' } }, text));
			const emptyText = items.length > 0 && (activeTag || ccfFilter !== 'all')
				? t('paper.emptyFiltered')
				: savedOnly ? t('paper.emptySaved') : t('paper.empty');
			const directionBar = h('div', { className: 'mc-paper-filters' },
				h('span', { className: 'mc-caption' }, t('paper.directions')),
				h('div', { className: 'mc-chips' }, DIRECTIONS.map(([code, label]) => h('button', {
					key: code,
					type: 'button',
					className: 'mc-chip',
					'aria-pressed': (research.directions || []).indexOf(code) >= 0,
					onClick: () => onToggleDirection(code),
				}, label))));
			const ccfBar = h('div', { className: 'mc-ccf-bar' },
				h('span', { className: 'mc-caption' }, t('wb.ccfTitle')),
				h('div', { className: 'mc-chips' }, WB_CCF_FILTERS.map((mode) => h('button', {
					key: mode,
					type: 'button',
					className: 'mc-chip mc-ccf-chip',
					'data-level': mode,
					'aria-pressed': ccfFilter === mode,
					onClick: () => setCcfFilter(mode),
				}, mode === 'A' ? t('wb.ccfA') : mode === 'rated' ? t('wb.ccfRated') : t('wb.ccfAll')))),
				h('div', { className: 'mc-hint mc-ccf-hint' }, t('wb.ccfNote')));
			const toolbar = h('div', { className: 'mc-toolbar' },
				h('input', {
					className: 'mc-input',
					style: { maxWidth: '300px' },
					value: keywordDraft,
					placeholder: t('paper.keywords'),
					onChange: (event) => setKeywordDraft(event.target.value),
					onKeyDown: (event) => { if (event.key === 'Enter') onRefresh(keywordDraft); },
					onBlur: () => onKeywords(keywordDraft),
				}),
				h('button', { type: 'button', className: 'mc-btn mc-btn-primary', onClick: () => onRefresh(keywordDraft), disabled: busy }, busy ? t('paper.fetching') : t('paper.refresh')),
				h('div', { className: 'mc-spacer' }),
				h('button', { type: 'button', className: 'mc-btn mc-btn-sm', 'aria-pressed': !savedOnly, onClick: () => setSavedOnly(false) }, format(t('paper.allCount'), { count: (research.items || []).length })),
				h('button', { type: 'button', className: 'mc-btn mc-btn-sm', 'aria-pressed': savedOnly, onClick: () => setSavedOnly(true) }, format(t('paper.savedCount'), { count: saved.length })));
			const card = (item) => h('article', { key: item.id, className: 'mc-card mc-paper' },
				h('div', { className: 'mc-paper-head' },
					h('a', { className: 'mc-paper-title', href: item.url, target: '_blank', rel: 'noreferrer' }, item.title),
					h('div', { className: 'mc-row' },
						onOpenWorkbench ? h('button', {
							type: 'button',
							className: 'mc-btn mc-btn-sm mc-wb-open',
							title: t('wb.openTitle'),
							onClick: () => onOpenWorkbench(item),
						}, t('wb.open')) : null,
						item.pdf ? h('a', { className: 'mc-btn mc-btn-sm', href: item.pdf, target: '_blank', rel: 'noreferrer' }, t('paper.pdf')) : null,
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => onToggleSave(item) }, savedIds.has(item.id) ? t('paper.unsave') : t('paper.save')))),
				renderMeta(item),
				h('p', { className: openId === item.id ? 'mc-paper-summary' : 'mc-paper-summary mc-clamp' }, item.summary),
				h('button', { type: 'button', className: 'mc-linkbtn', onClick: () => setOpenId(openId === item.id ? null : item.id) }, openId === item.id ? t('paper.less') : t('paper.more')));
			const listNode = visible.length === 0
				? emptyCard(emptyText)
				: h('div', { className: 'mc-paper-list' }, visible.map(card));
			const fetchedLine = fetched ? h('div', { className: 'mc-caption', style: { marginBottom: '8px' } }, format(t('paper.fetchedAt'), { time: fetched })) : null;
			return h('div', { className: 'mc-papers' },
				h('div', { className: 'mc-paper-main' },
					directionBar,
					ccfBar,
					toolbar,
					fetchedLine,
					listNode,
					h('div', { className: 'mc-hint' }, t('paper.hint'))),
				tagRail);
		}

		/* 竞赛卡片：列表层与文件夹详情层共用的唯一一份标记（§3.4 / §4.1）。 */
		function competitionCard(t, item, now, onEdit, onDelete) {
			const left = daysUntil(item.deadline, now);
			const state = left === null ? 'none' : left < 0 ? 'over' : left <= 7 ? 'soon' : 'open';
			return h('div', { className: 'mc-card mc-competition', 'data-state': state },
				h('div', { className: 'mc-competition-head' },
					h('div', { className: 'mc-competition-title' },
						item.link
							? h('a', { href: item.link, target: '_blank', rel: 'noreferrer' }, item.name)
							: h('strong', null, item.name),
						h('span', { className: 'mc-badge' }, item.level),
						h('span', { className: 'mc-badge' }, item.status)),
					onEdit || onDelete
						? h('div', { className: 'mc-row' },
							onEdit ? h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => onEdit(item) }, t('course.edit')) : null,
							onDelete ? h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-btn-danger', onClick: () => onDelete(item) }, t('delete')) : null)
						: null),
				h('div', { className: 'mc-competition-meta' },
					item.deadline ? h('span', null, t('competition.deadline') + ' ' + item.deadline) : h('span', null, t('competition.noDeadline')),
					left !== null ? h('span', { className: state === 'over' ? 'mc-task-late' : state === 'soon' ? 'mc-task-today' : '' },
						left < 0 ? format(t('competition.overdue'), { days: Math.abs(left) }) : left === 0 ? t('task.dueToday') : format(t('competition.left'), { days: left })) : null),
				item.note ? h('p', { className: 'mc-competition-note' }, item.note) : null);
		}

		function emptyStateCard(text, actions) {
			return h('div', { className: 'mc-card', style: { textAlign: 'center', padding: '34px 16px', color: 'var(--dsw-alias-label-tertiary)' } },
				h('p', { style: { margin: 0, fontSize: '13px' } }, text),
				actions && actions.length > 0
					? h('div', { className: 'mc-row', style: { justifyContent: 'center', marginTop: '12px' } }, actions)
					: null);
		}

		/* 清单视图（§3.3）：唯一数据源是 plan.items。 */
		function PlanItemsView(props) {
			const { t, plan, onAdd, onUpdate, onToggle, onDelete, bare } = props;
			const [draft, setDraft] = useState('');
			const [editing, setEditing] = useState(null);
			const submit = () => {
				const text = draft.trim();
				if (!text) return;
				if (editing) onUpdate(editing, text);
				else onAdd(text);
				setDraft('');
				setEditing(null);
			};
			const startEdit = (item) => {
				setEditing(item);
				setDraft(item.text);
			};
			const cancelEdit = () => {
				setEditing(null);
				setDraft('');
			};
			return h('div', null,
				h('div', { className: 'mc-row' },
					h('input', {
						className: 'mc-input',
						value: draft,
						placeholder: t('plan.itemPlaceholder'),
						onChange: (event) => setDraft(event.target.value),
						onKeyDown: (event) => { if (event.key === 'Enter') submit(); },
					}),
					h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: submit, disabled: !draft.trim() }, editing ? t('save') : t('plan.newItem')),
					editing ? h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: cancelEdit }, t('cancel')) : null),
				plan.items.length === 0
					? (bare ? null : h('p', { className: 'mc-plan-empty' }, t('plan.items.empty')))
					: h('ul', { className: 'mc-plan-items' }, plan.items.map((item) => h('li', { key: item.id, className: 'mc-plan-item', 'data-done': item.done ? 'true' : 'false' },
						h('button', {
							type: 'button',
							className: 'mc-check',
							'aria-pressed': item.done,
							title: t('task.toggle'),
							onClick: () => onToggle(item),
						}),
						h('span', { style: { flex: '1 1 auto', minWidth: 0 } }, item.text),
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => startEdit(item) }, t('course.edit')),
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-btn-danger', onClick: () => onDelete(item) }, t('delete'))))));
		}

		/* 里程碑视图（§3.3）：条目全部来自 plan.timeline 里 kind==='milestone' 的那部分，不另存。 */
		function PlanMilestonesView(props) {
			const { t, plan, now, onAdd, onUpdate, onToggle, onDelete, bare } = props;
			const [title, setTitle] = useState('');
			const [date, setDate] = useState('');
			const [editing, setEditing] = useState(null);
			const list = milestonesOf(plan);
			const progress = planProgress(plan);
			const percent = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
			const submit = () => {
				const text = title.trim();
				if (!text) return;
				if (editing) onUpdate(editing, { title: text, date, kind: 'milestone' });
				else onAdd(text, date, 'milestone');
				setTitle('');
				setDate('');
				setEditing(null);
			};
			const startEdit = (entry) => {
				setEditing(entry);
				setTitle(entry.title);
				setDate(entry.date || '');
			};
			const cancelEdit = () => {
				setEditing(null);
				setTitle('');
				setDate('');
			};
			return h('div', null,
				h('div', { className: 'mc-cf-head' },
					h('span', { className: 'mc-cf-meta' }, format(t('plan.progress'), progress)),
					h('div', { className: 'mc-spacer' })),
				h('div', { className: 'mc-cf-progress', style: { marginBottom: '10px' } },
					h('span', { className: 'mc-cf-progress-bar', style: { width: percent + '%' } })),
				h('div', { className: 'mc-row' },
					h('input', { className: 'mc-input', value: title, placeholder: t('plan.field.title'), onChange: (event) => setTitle(event.target.value) }),
					h('input', { className: 'mc-input', type: 'date', 'aria-label': t('plan.field.date'), style: { flex: '0 0 auto' }, value: date, onChange: (event) => setDate(event.target.value) }),
					h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: submit, disabled: !title.trim() }, editing ? t('save') : t('plan.newMilestone')),
					editing ? h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: cancelEdit }, t('cancel')) : null),
				list.length === 0
					? (bare ? null : h('p', { className: 'mc-plan-empty' }, t('plan.milestones.empty')))
					: h('div', { className: 'mc-plan-tl' }, list.map((entry) => h('div', { key: entry.id, className: 'mc-plan-tl-row', 'data-done': entry.done ? 'true' : 'false' },
						h('span', { className: 'mc-plan-tl-dot', 'data-kind': entry.kind, 'data-done': entry.done ? 'true' : 'false' }),
						h('span', { style: { flex: '1 1 auto', minWidth: 0 } }, entry.title),
						planTimelineMeta(t, entry, now),
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => startEdit(entry) }, t('course.edit')),
						h('button', { type: 'button', className: 'mc-check', 'aria-pressed': entry.done, title: t('task.toggle'), onClick: () => onToggle(entry) }),
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-btn-danger', onClick: () => onDelete(entry) }, t('delete'))))),
				h('p', { className: 'mc-plan-empty' }, t('plan.singleSource')));
		}

		/* 时间线条目右侧的日期/倒计时片段：日期走 planCountdown，只有一套算术。
		   §3.2 判定表里 done 行的文案是「已完成 · {date}」，本身已带日期，
		   所以这一行只渲染那一句、不再重复左侧日期，避免同一行出现两个日期。 */
		function planTimelineMeta(t, entry, now) {
			const countdown = planCountdown(entry, now);
			const text = countdown ? format(t(countdown.key), countdown.params) : '';
			if (countdown && countdown.key === 'plan.doneOn') {
				return h('span', { className: 'mc-cf-meta' }, h('span', { className: countdown.tone.trim() }, text));
			}
			return h('span', { className: 'mc-cf-meta' },
				entry.date ? h('span', null, entry.date) : h('span', null, t('plan.noDate')),
				countdown && countdown.key !== 'plan.noDate'
					? h('span', { className: countdown.tone.trim() }, text)
					: null);
		}

		/* 时间线视图（§3.3）：按月分组，日期为空的一组放最后；里程碑/步骤由 kind 一次渲染。 */
		function PlanTimelineView(props) {
			const { t, plan, now, onAdd, onUpdate, onToggle, onDelete, bare } = props;
			const [title, setTitle] = useState('');
			const [date, setDate] = useState('');
			const [kind, setKind] = useState('step');
			const [editing, setEditing] = useState(null);
			const submit = () => {
				const text = title.trim();
				if (!text) return;
				if (editing) onUpdate(editing, { title: text, date, kind });
				else onAdd(text, date, kind);
				setTitle('');
				setDate('');
				setEditing(null);
			};
			const startEdit = (entry) => {
				setEditing(entry);
				setTitle(entry.title);
				setDate(entry.date || '');
				setKind(entry.kind);
			};
			const cancelEdit = () => {
				setEditing(null);
				setTitle('');
				setDate('');
			};
			const groups = [];
			const undated = [];
			plan.timeline.forEach((entry) => {
				if (!entry.date) {
					undated.push(entry);
					return;
				}
				const month = entry.date.slice(0, 7);
				const last = groups[groups.length - 1];
				if (last && last.month === month) last.entries.push(entry);
				else groups.push({ month, entries: [entry] });
			});
			const renderRows = (entries) => entries.map((entry) => h('div', { key: entry.id, className: 'mc-plan-tl-row', 'data-done': entry.done ? 'true' : 'false' },
				h('span', { className: 'mc-plan-tl-dot', 'data-kind': entry.kind, 'data-done': entry.done ? 'true' : 'false' }),
				h('span', { style: { flex: '1 1 auto', minWidth: 0 } }, entry.title),
				entry.kind === 'milestone' ? h('span', { className: 'mc-badge' }, t('plan.kind.milestone')) : null,
				planTimelineMeta(t, entry, now),
				h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => startEdit(entry) }, t('course.edit')),
				h('button', { type: 'button', className: 'mc-check', 'aria-pressed': entry.done, title: t('task.toggle'), onClick: () => onToggle(entry) }),
				h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-btn-danger', onClick: () => onDelete(entry) }, t('delete'))));
			return h('div', null,
				h('div', { className: 'mc-row' },
					h('input', { className: 'mc-input', value: title, placeholder: t('plan.field.title'), onChange: (event) => setTitle(event.target.value) }),
					h('input', { className: 'mc-input', type: 'date', 'aria-label': t('plan.field.date'), style: { flex: '0 0 auto' }, value: date, onChange: (event) => setDate(event.target.value) }),
					h('div', { className: 'mc-chips', role: 'group', 'aria-label': t('plan.field.kind') }, TIMELINE_KINDS.map((option) => h('button', {
						key: option,
						type: 'button',
						className: 'mc-chip',
						'aria-pressed': kind === option,
						onClick: () => setKind(option),
					}, t('plan.kind.' + option)))),
					h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: submit, disabled: !title.trim() }, editing ? t('save') : t('plan.newEntry')),
					editing ? h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: cancelEdit }, t('cancel')) : null),
				plan.timeline.length === 0
					? (bare ? null : h('p', { className: 'mc-plan-empty' }, t('plan.timeline.empty')))
					: h('div', { className: 'mc-plan-tl' },
						groups.map((group) => h('div', { key: group.month, className: 'mc-plan-tl-group' },
							h('span', { className: 'mc-cf-meta' }, group.month),
							renderRows(group.entries))),
						undated.length > 0
							? h('div', { key: 'undated', className: 'mc-plan-tl-group' },
								h('span', { className: 'mc-cf-meta' }, t('plan.noDate')),
								renderRows(undated))
							: null));
		}

		function PlanPane(props) {
			const { t, plan, now, onAddItem, onUpdateItem, onToggleItem, onDeleteItem, onAddTimeline, onUpdateTimeline, onToggleTimeline, onDeleteTimeline } = props;
			const [view, setView] = useState('items');
			const empty = plan.items.length === 0 && plan.timeline.length === 0;
			const itemsView = (bare) => h(PlanItemsView, { t, plan, onAdd: onAddItem, onUpdate: onUpdateItem, onToggle: onToggleItem, onDelete: onDeleteItem, bare });
			const milestonesView = (bare) => h(PlanMilestonesView, { t, plan, now, onAdd: onAddTimeline, onUpdate: onUpdateTimeline, onToggle: onToggleTimeline, onDelete: onDeleteTimeline, bare });
			const timelineView = (bare) => h(PlanTimelineView, { t, plan, now, onAdd: onAddTimeline, onUpdate: onUpdateTimeline, onToggle: onToggleTimeline, onDelete: onDeleteTimeline, bare });
			if (empty) {
				/* E4：规划整体为空 → 一张空态卡，不渲染三视图 tab；CTA 直接把对应视图的输入行展开。 */
				const composer = view === 'milestones' ? milestonesView(true) : view === 'timeline' ? timelineView(true) : itemsView(true);
				return h('div', { className: 'mc-plan' },
					h('div', { className: 'mc-cf-head' }, h('span', { className: 'mc-cf-name' }, t('plan.tab'))),
					emptyStateCard(t('plan.empty'), [
						h('button', { key: 'item', type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => setView('items') }, t('plan.newItem')),
						h('button', { key: 'milestone', type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => setView('milestones') }, t('plan.newMilestone')),
					]),
					composer);
			}
			const tabs = [
				{ key: 'items', label: t('plan.view.items') },
				{ key: 'milestones', label: t('plan.view.milestones') },
				{ key: 'timeline', label: t('plan.view.timeline') },
			];
			return h('div', { className: 'mc-plan' },
				h('div', { className: 'mc-cf-head' }, h('span', { className: 'mc-cf-name' }, t('plan.tab'))),
				h('div', { className: 'mc-plan-tabs' }, tabs.map((tab) => h('button', {
					key: tab.key,
					type: 'button',
					className: 'mc-plan-tab',
					'data-active': view === tab.key ? 'true' : 'false',
					'aria-pressed': view === tab.key,
					onClick: () => setView(tab.key),
				}, tab.label))),
				view === 'items'
					? itemsView()
					: view === 'milestones'
						? milestonesView()
						: timelineView());
		}

		function CompetitionFolderView(props) {
			const { t, folder, competitions, now, onBack, onNew, onEdit, onDelete, planProps } = props;
			/* 页面级规划回调的签名是 (folderId, ...)，在文件夹视图里把 folderId 一次性绑定掉。 */
			const boundPlan = folder
				? Object.keys(planProps || {}).reduce((acc, key) => {
					if (typeof planProps[key] === 'function') acc[key] = (...args) => planProps[key](folder.id, ...args);
					return acc;
				}, {})
				: {};
			const list = competitions.slice().sort((left, right) => {
				const a = dateOfText(left.deadline);
				const b = dateOfText(right.deadline);
				if (a && b) return a - b;
				if (a) return -1;
				if (b) return 1;
				return left.name.localeCompare(right.name);
			});
			return h('div', { className: 'mc-competitions' },
				h('div', { className: 'mc-toolbar mc-cf-toolbar' },
					h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: onBack }, '‹ ' + t('competition.tab')),
					h('span', { className: 'mc-cf-name' }, folder ? folder.name : t('competition.folder.ungrouped')),
					h('div', { className: 'mc-spacer' }),
					h('button', { type: 'button', className: 'mc-btn mc-btn-primary', onClick: onNew }, ICON_PLUS, t('competition.new'))),
				h('div', { className: 'mc-cf-detail' },
					h('div', { className: 'mc-cf-detail-competitions' },
						h('div', { className: 'mc-cf-head' },
							h('span', { className: 'mc-cf-name' }, t('competition.tab')),
							h('span', { className: 'mc-cf-meta' }, format(t('competition.folder.competitions'), { count: list.length }))),
						list.length === 0
							? emptyStateCard(t('competition.folder.noCompetition'), [
								h('button', { key: 'new', type: 'button', className: 'mc-btn mc-btn-sm mc-btn-primary', onClick: onNew }, t('competition.new')),
							])
							: h('div', { className: 'mc-competition-list' }, list.map((item) => h('div', { key: item.id }, competitionCard(t, item, now, onEdit, onDelete))))),
					folder
						? h(PlanPane, { t, plan: folder.plan, now, ...boundPlan })
						: h('div', { className: 'mc-plan' }, h('p', { className: 'mc-plan-empty' }, t('competition.folder.ungroupedPlanHint')))),
				h('div', { className: 'mc-hint' }, t('competition.hint')));
		}

		function FolderDialog(props) {
			const { t, value, onCancel, onSave } = props;
			const [name, setName] = useState(value.name || '');
			const valid = name.trim().length > 0;
			const submit = () => {
				if (!valid) return;
				onSave({ id: value.id || undefined, name: name.trim() });
			};
			return h(Modal, {
				title: value.id ? t('competition.folder.edit') : t('competition.folder.new'),
				onClose: onCancel,
				footer: [
					h('button', { key: 'cancel', type: 'button', className: 'mc-btn', onClick: onCancel }, t('cancel')),
					h('button', { key: 'save', type: 'button', className: 'mc-btn mc-btn-primary', disabled: !valid, onClick: submit }, t('save')),
				],
			},
			h('div', { className: 'mc-field' },
				h('span', null, t('competition.folder.name')),
				h('input', { className: 'mc-input', value: name, placeholder: '408 考研', onChange: (event) => setName(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') submit(); } })));
		}

		function CompetitionsPane(props) {
			const { t, competitions, folders, now, onNew, onEdit, onDelete, onSaveFolder, onDeleteFolder, onReorderFolder, planProps } = props;
			const [openFolderId, setOpenFolderId] = useState(null);
			const [folderModal, setFolderModal] = useState(null);
			const ungrouped = competitions.filter((item) => !item.folderId);
			const progressOf = (folder) => planProgress(folder.plan);
			const percentOf = (progress) => (progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100));
			const nextMilestoneOf = (folder) => milestonesOf(folder.plan).filter((entry) => !entry.done).find((entry) => {
				const left = daysUntil(entry.date, now);
				return left !== null && left >= 0;
			});
			const nearestDeadlineOf = (items) => {
				let best = null;
				items.forEach((item) => {
					const left = daysUntil(item.deadline, now);
					if (left === null) return;
					if (best === null || left < best) best = left;
				});
				return best;
			};
			const deadlineText = (left) => (left === null ? '' : left < 0 ? format(t('competition.overdue'), { days: Math.abs(left) }) : left === 0 ? t('task.dueToday') : format(t('competition.left'), { days: left }));
			const openFolder = openFolderId === null ? null : folders.find((folder) => folder.id === openFolderId) || null;
			if (openFolderId !== null) {
				const visible = openFolderId === '' ? ungrouped : competitions.filter((item) => item.folderId === openFolderId);
				return h(CompetitionFolderView, {
					t,
					folder: openFolder,
					competitions: visible,
					now,
					onBack: () => setOpenFolderId(null),
					onNew: () => onNew(openFolderId),
					onEdit,
					onDelete,
					planProps,
				});
			}
			const openFolderDialog = (value) => setFolderModal(value);
			const folderCard = (folder, index) => {
				const items = competitions.filter((item) => item.folderId === folder.id);
				const progress = progressOf(folder);
				const next = nextMilestoneOf(folder);
				const nearest = nearestDeadlineOf(items);
				return h('div', {
					key: folder.id,
					className: 'mc-card mc-cf-card',
					role: 'button',
					tabIndex: 0,
					onClick: () => setOpenFolderId(folder.id),
					onKeyDown: (event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							event.preventDefault();
							setOpenFolderId(folder.id);
						}
					},
				},
					h('div', { className: 'mc-cf-head' },
						h('span', { className: 'mc-cf-name' }, folder.name),
						h('span', { className: 'mc-cf-meta' }, format(t('competition.folder.competitions'), { count: items.length })),
						h('span', { className: 'mc-cf-meta' }, format(t('plan.progress'), progress)),
						h('div', { className: 'mc-spacer' }),
						index > 0
							? h('button', {
								type: 'button',
								className: 'mc-btn mc-btn-sm',
								title: t('competition.folder.up'),
								'aria-label': t('competition.folder.up'),
								onClick: (event) => { event.stopPropagation(); onReorderFolder(folder.id, -1); },
							}, '↑')
							: null,
						index < folders.length - 1
							? h('button', {
								type: 'button',
								className: 'mc-btn mc-btn-sm',
								title: t('competition.folder.down'),
								'aria-label': t('competition.folder.down'),
								onClick: (event) => { event.stopPropagation(); onReorderFolder(folder.id, 1); },
							}, '↓')
							: null,
						h('button', {
							type: 'button',
							className: 'mc-btn mc-btn-sm',
							onClick: (event) => { event.stopPropagation(); openFolderDialog({ id: folder.id, name: folder.name }); },
						}, t('competition.folder.edit')),
						h('button', {
							type: 'button',
							className: 'mc-btn mc-btn-sm mc-btn-danger',
							onClick: (event) => { event.stopPropagation(); onDeleteFolder(folder); },
						}, t('delete'))),
					h('div', { className: 'mc-cf-progress' }, h('span', { className: 'mc-cf-progress-bar', style: { width: percentOf(progress) + '%' } })),
					h('div', { className: 'mc-cf-meta' },
						nearest === null
							? h('span', null, t('competition.noDeadline'))
							: h('span', { className: nearest < 0 ? 'mc-task-late' : nearest <= 7 ? 'mc-task-today' : '' }, deadlineText(nearest)),
						h('span', null, t('competition.folder.nextMilestone') + ' · ' + (next ? deadlineText(daysUntil(next.date, now)) : t('plan.noUpcoming')))));
			};
			const ungroupedCard = h('div', {
				key: 'ungrouped',
				className: 'mc-card mc-cf-card mc-cf-ungrouped',
				role: 'button',
				tabIndex: 0,
				onClick: () => setOpenFolderId(''),
				onKeyDown: (event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						setOpenFolderId('');
					}
				},
			},
				h('div', { className: 'mc-cf-head' },
					h('span', { className: 'mc-cf-name' }, t('competition.folder.ungrouped')),
					h('span', { className: 'mc-cf-meta' }, format(t('competition.folder.competitions'), { count: ungrouped.length }))));
			const bothEmpty = folders.length === 0 && competitions.length === 0;
			const summary = folders.length === 0
				? format(t('competition.count'), { count: competitions.length })
				: format(t('competition.folder.count'), { count: folders.length }) + ' · ' + format(t('competition.folder.competitions'), { count: competitions.length });
			return h('div', { className: 'mc-competitions' },
				h('div', { className: 'mc-toolbar mc-cf-toolbar' },
					h('button', { type: 'button', className: 'mc-btn mc-btn-primary', onClick: () => onNew('') }, ICON_PLUS, t('competition.new')),
					h('button', { type: 'button', className: 'mc-btn', onClick: () => openFolderDialog({ id: null, name: '' }) }, t('competition.folder.new')),
					h('div', { className: 'mc-spacer' }),
					h('span', { className: 'mc-caption', style: { margin: 0 } }, summary)),
				bothEmpty
					? emptyStateCard(t('competition.empty'), [
						h('button', { key: 'new', type: 'button', className: 'mc-btn mc-btn-primary', onClick: () => onNew('') }, t('competition.new')),
						h('button', { key: 'folder', type: 'button', className: 'mc-btn', onClick: () => openFolderDialog({ id: null, name: '' }) }, t('competition.folder.new')),
					])
					: h('div', { className: 'mc-cf-list' },
						folders.length === 0 ? h('p', { key: 'hint', className: 'mc-plan-empty' }, t('competition.folder.none')) : null,
						folders.map(folderCard),
						ungrouped.length > 0 ? ungroupedCard : null),
				folderModal ? h(FolderDialog, {
					key: 'folder',
					t,
					value: folderModal,
					onCancel: () => setFolderModal(null),
					onSave: (draft) => {
						setFolderModal(null);
						onSaveFolder(draft);
					},
				}) : null,
				h('div', { className: 'mc-hint' }, t('competition.hint')));
		}

		function CompetitionDialog(props) {
			const { t, value, folders, onCancel, onSave } = props;
			const [name, setName] = useState(value.name || '');
			const [level, setLevel] = useState(value.level || COMPETITION_LEVELS[0]);
			const [status, setStatus] = useState(value.status || COMPETITION_STATUS[0]);
			const [folderId, setFolderId] = useState(value.folderId || '');
			const [deadline, setDeadline] = useState(value.deadline || '');
			const [link, setLink] = useState(value.link || '');
			const [note, setNote] = useState(value.note || '');
			const valid = name.trim().length > 0;
			const submit = () => {
				if (!valid) return;
				onSave({ name: name.trim(), level, status, folderId, deadline, link: link.trim(), note: note.trim() });
			};
			return h(Modal, {
				title: value.id ? t('competition.edit') : t('competition.new'),
				onClose: onCancel,
				footer: [
					h('button', { key: 'cancel', type: 'button', className: 'mc-btn', onClick: onCancel }, t('cancel')),
					h('button', { key: 'save', type: 'button', className: 'mc-btn mc-btn-primary', disabled: !valid, onClick: submit }, t('save')),
				],
			},
				h('div', { className: 'mc-field' },
					h('span', null, t('competition.name')),
					h('input', { className: 'mc-input', value: name, placeholder: '全国大学生数学建模竞赛', onChange: (event) => setName(event.target.value) })),
				h('div', { className: 'mc-field' },
					h('span', null, t('competition.level')),
					h('div', { className: 'mc-chips' }, COMPETITION_LEVELS.map((option) => h('button', {
						key: option,
						type: 'button',
						className: 'mc-chip',
						'aria-pressed': level === option,
						onClick: () => setLevel(option),
					}, option)))),
				h('div', { className: 'mc-field' },
					h('span', null, t('competition.status')),
					h('div', { className: 'mc-chips' }, COMPETITION_STATUS.map((option) => h('button', {
						key: option,
						type: 'button',
						className: 'mc-chip',
						'aria-pressed': status === option,
						onClick: () => setStatus(option),
					}, option)))),
				h('div', { className: 'mc-field' },
					h('span', null, t('competition.folder.moveTo')),
					h('select', {
						className: 'mc-input',
						value: folderId,
						onChange: (event) => setFolderId(event.target.value),
					},
					h('option', { value: '' }, t('competition.folder.ungrouped')),
					(folders || []).map((folder) => h('option', { key: folder.id, value: folder.id }, folder.name)))),
				h('div', { className: 'mc-row' },
					h('div', { className: 'mc-field', style: { flex: '1 1 180px' } },
						h('span', null, t('competition.deadline')),
						h('input', { className: 'mc-input', type: 'date', value: deadline, onChange: (event) => setDeadline(event.target.value) })),
					h('div', { className: 'mc-field', style: { flex: '2 1 240px' } },
						h('span', null, t('competition.link')),
						h('input', { className: 'mc-input', value: link, placeholder: 'https://', onChange: (event) => setLink(event.target.value) }))),
				h('div', { className: 'mc-field' },
					h('span', null, t('field.note')),
					h('input', { className: 'mc-input', value: note, onChange: (event) => setNote(event.target.value) })));
		}


		/* ------------------------------------------------------------------ */
		/* Course files: browser directory handles                             */
		/* ------------------------------------------------------------------ */

		/**
		 * Folder management uses the browser's own directory API, because the
		 * Host picker composed in this build is the native one and only offers
		 * `pick()` — it cannot list or create directories. A handle is stored in
		 * IndexedDB so the same folder is reused on the next visit; when the API
		 * is missing the module degrades to linking folders by path.
		 */
		const HAS_DIRECTORY_ACCESS = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
		const HANDLE_DB = 'dsh-my-courses-handles';
		const HANDLE_STORE = 'handles';
		const handleCache = new Map();

		function openHandleDb() {
			return new Promise((resolve, reject) => {
				if (typeof window === 'undefined' || !window.indexedDB) {
					reject(new Error('INDEXED_DB'));
					return;
				}
				const request = window.indexedDB.open(HANDLE_DB, 1);
				request.onupgradeneeded = () => {
					const db = request.result;
					if (!db.objectStoreNames.contains(HANDLE_STORE)) db.createObjectStore(HANDLE_STORE);
				};
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error || new Error('INDEXED_DB'));
			});
		}

		async function putHandle(key, handle) {
			handleCache.set(key, handle);
			try {
				const db = await openHandleDb();
				await new Promise((resolve, reject) => {
					const tx = db.transaction(HANDLE_STORE, 'readwrite');
					tx.objectStore(HANDLE_STORE).put(handle, key);
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error || new Error('INDEXED_DB'));
				});
				db.close();
			} catch (error) {
				/* memory cache still serves this session */
			}
		}

		async function getHandle(key) {
			if (handleCache.has(key)) return handleCache.get(key);
			try {
				const db = await openHandleDb();
				const handle = await new Promise((resolve, reject) => {
					const tx = db.transaction(HANDLE_STORE, 'readonly');
					const request = tx.objectStore(HANDLE_STORE).get(key);
					request.onsuccess = () => resolve(request.result || null);
					request.onerror = () => reject(request.error || new Error('INDEXED_DB'));
				});
				db.close();
				if (handle) handleCache.set(key, handle);
				return handle || null;
			} catch (error) {
				return null;
			}
		}

		async function dropHandle(key) {
			handleCache.delete(key);
			try {
				const db = await openHandleDb();
				await new Promise((resolve) => {
					const tx = db.transaction(HANDLE_STORE, 'readwrite');
					tx.objectStore(HANDLE_STORE).delete(key);
					tx.oncomplete = () => resolve();
					tx.onerror = () => resolve();
				});
				db.close();
			} catch (error) {
				/* nothing to clean up */
			}
		}

		async function ensurePermission(handle, mode) {
			if (!handle) return false;
			if (typeof handle.queryPermission !== 'function') return true;
			try {
				const current = await handle.queryPermission({ mode });
				if (current === 'granted') return true;
				if (typeof handle.requestPermission !== 'function') return false;
				return (await handle.requestPermission({ mode })) === 'granted';
			} catch (error) {
				return false;
			}
		}

		async function listDirectoryEntries(handle) {
			if (!(await ensurePermission(handle, 'read'))) {
				const failure = new Error('NOT_ALLOWED');
				failure.name = 'NotAllowedError';
				throw failure;
			}
			const rows = [];
			for await (const [name, child] of handle.entries()) {
				const row = { name, kind: child.kind, handle: child };
				if (child.kind === 'file') {
					try {
						const file = await child.getFile();
						row.size = file.size;
					} catch (error) {
						/* the size is decoration */
					}
				}
				rows.push(row);
			}
			rows.sort((left, right) => (left.kind === right.kind ? left.name.localeCompare(right.name) : left.kind === 'directory' ? -1 : 1));
			return rows;
		}

		function formatSize(bytes) {
			if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
			if (bytes < 1024) return bytes + ' B';
			if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
			return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
		}

		/* ------------------------------------------------------------------ */
		/* Course files: components                                            */
		/* ------------------------------------------------------------------ */

		const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'json', 'csv', 'tsv', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'c', 'h', 'cpp', 'hpp', 'java', 'rs', 'go', 'rb', 'php', 'sql', 'sh', 'bat', 'ps1', 'html', 'css', 'yml', 'yaml', 'toml', 'ini', 'cfg', 'log', 'tex', 'bib', 'r', 'm', 'swift', 'kt'];
		const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];
		const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif', 'image/bmp'];

		function extensionOf(name) {
			const match = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
			return match ? match[1].toLowerCase() : '';
		}

		function FilePreview(props) {
			const { t, target, dir, onClose, onChanged } = props;
			const [kind, setKind] = useState('loading');
			const [text, setText] = useState('');
			const [dirty, setDirty] = useState(false);
			const [error, setError] = useState('');
			const [busy, setBusy] = useState(false);
			const [meta, setMeta] = useState(null);
			const [url, setUrl] = useState('');

			useEffect(() => {
				let objectUrl = '';
				let cancelled = false;
				(async () => {
					try {
						const file = await target.handle.getFile();
						if (cancelled) return;
						setMeta({ size: file.size, type: file.type });
						const extension = extensionOf(target.name);
						const isImage = IMAGE_TYPES.indexOf(file.type) >= 0 || IMAGE_EXTENSIONS.indexOf(extension) >= 0;
						const isPdf = file.type === 'application/pdf' || extension === 'pdf';
						if (isImage) {
							objectUrl = URL.createObjectURL(file);
							setUrl(objectUrl);
							setKind('image');
							return;
						}
						if (isPdf) {
							objectUrl = URL.createObjectURL(file);
							setUrl(objectUrl);
							setKind('pdf');
							return;
						}
						const isText = TEXT_EXTENSIONS.indexOf(extension) >= 0 || (file.type || '').indexOf('text/') === 0 || (!file.type && file.size <= 1024 * 1024);
						if (isText && file.size <= 2 * 1024 * 1024) {
							const content = await file.text();
							if (cancelled) return;
							setText(content);
							setKind('text');
							return;
						}
						setKind('other');
					} catch (failed) {
						if (!cancelled) {
							setError(messageOf(failed));
							setKind('error');
						}
					}
				})();
				return () => {
					cancelled = true;
					if (objectUrl) URL.revokeObjectURL(objectUrl);
				};
			}, [target]);

			const save = async () => {
				setBusy(true);
				setError('');
				try {
					if (!(await ensurePermission(target.handle, 'readwrite'))) throw new Error('NO_PERMISSION');
					const writable = await target.handle.createWritable();
					await writable.write(text);
					await writable.close();
					setDirty(false);
					if (onChanged) onChanged();
				} catch (failed) {
					setError(messageOf(failed));
				} finally {
					setBusy(false);
				}
			};

			const remove = async () => {
				if (!dir) return;
				setBusy(true);
				setError('');
				try {
					if (!(await ensurePermission(dir, 'readwrite'))) throw new Error('NO_PERMISSION');
					await dir.removeEntry(target.name);
					if (onChanged) onChanged();
					onClose();
				} catch (failed) {
					setError(messageOf(failed));
				} finally {
					setBusy(false);
				}
			};

			const footer = [
				h('button', { key: 'remove', type: 'button', className: 'mc-btn mc-btn-sm mc-btn-danger', style: { marginRight: 'auto' }, onClick: remove, disabled: busy }, t('file.delete')),
				kind === 'text' ? h('button', { key: 'save', type: 'button', className: 'mc-btn mc-btn-sm mc-btn-primary', onClick: save, disabled: busy || !dirty }, t('file.save')) : null,
				kind === 'image' || kind === 'pdf'
					? h('a', { key: 'tab', className: 'mc-btn mc-btn-sm', href: url, target: '_blank', rel: 'noreferrer' }, t('file.openTab'))
					: null,
				h('button', { key: 'close', type: 'button', className: 'mc-btn mc-btn-sm', onClick: onClose }, t('close')),
			];

			const body = [];
			if (error) body.push(h('p', { className: 'mc-error', key: 'error' }, error));
			if (kind === 'loading') body.push(h('span', { key: 'loading', className: 'mc-caption' }, t('file.loading')));
			else if (kind === 'image') body.push(h('img', { key: 'image', className: 'mc-file-image', src: url, alt: target.name }));
			else if (kind === 'pdf') body.push(h('iframe', { key: 'pdf', className: 'mc-file-pdf', src: url, title: target.name }));
			else if (kind === 'text') {
				body.push(h('textarea', {
					key: 'text',
					className: 'mc-input mc-file-text',
					value: text,
					spellCheck: false,
					onChange: (event) => {
						setText(event.target.value);
						setDirty(true);
					},
				}));
				body.push(h('span', { key: 'hint', className: 'mc-caption' }, dirty ? t('file.unsaved') : t('file.saved')));
			} else if (kind === 'other' || kind === 'error') {
				body.push(h('p', { key: 'meta', className: 'mc-caption', style: { margin: 0 } },
					meta ? format(t('file.meta'), { type: meta.type || '—', size: formatSize(meta.size) }) : ''));
				body.push(h('a', { key: 'download', className: 'mc-btn mc-btn-sm', href: url || '#', onClick: (event) => { if (!url) event.preventDefault(); }, download: target.name }, t('file.download')));
			}
			return h(Modal, {
				title: target.name,
				wide: true,
				onClose,
				footer,
			}, h('div', { className: 'mc-file-body' }, body));
		}

		function FolderCard(props) {
			const { t, folder, notify, onRemove } = props;
			const [open, setOpen] = useState(false);
			const [entries, setEntries] = useState(null);
			const [error, setError] = useState('');
			const [needsPermission, setNeedsPermission] = useState(false);
			const [busy, setBusy] = useState(false);
			const [stack, setStack] = useState([]);
			const [creating, setCreating] = useState(false);
			const [draft, setDraft] = useState('');
			const [creatingFile, setCreatingFile] = useState(false);
			const [fileDraft, setFileDraft] = useState('');
			const [viewer, setViewer] = useState(null);
			const [mode, setMode] = useState(HAS_DIRECTORY_ACCESS ? 'handle' : 'path');

			const current = stack.length > 0 ? stack[stack.length - 1].handle : null;

			const read = useCallback(async (handle) => {
				setBusy(true);
				setError('');
				setNeedsPermission(false);
				try {
					setEntries(await listDirectoryEntries(handle));
				} catch (failed) {
					setEntries(null);
					if (failed && failed.name === 'NotAllowedError') setNeedsPermission(true);
					else setError(messageOf(failed));
				} finally {
					setBusy(false);
				}
			}, []);

			const openFolder = useCallback(async () => {
				if (!HAS_DIRECTORY_ACCESS) {
					setMode('path');
					setOpen(true);
					return;
				}
				setBusy(true);
				try {
					const handle = await getHandle(folder.id);
					if (!handle) {
						setMode('path');
						setOpen(true);
						return;
					}
					setMode('handle');
					setStack([{ name: folder.name, handle }]);
					setOpen(true);
					await read(handle);
				} catch (failed) {
					setMode('path');
					setOpen(true);
					setError(messageOf(failed));
				} finally {
					setBusy(false);
				}
			}, [folder.id, folder.name, read]);

			const createSub = async () => {
				const name = draft.trim();
				if (!name || !current) return;
				setBusy(true);
				try {
					await current.getDirectoryHandle(name, { create: true });
					setDraft('');
					setCreating(false);
					await read(current);
				} catch (failed) {
					setError(messageOf(failed));
				} finally {
					setBusy(false);
				}
			};

			const createFile = async () => {
				const name = fileDraft.trim();
				if (!name || !current) return;
				setBusy(true);
				try {
					const handle = await current.getFileHandle(name, { create: true });
					setFileDraft('');
					setCreatingFile(false);
					await read(current);
					setViewer({ handle, name });
				} catch (failed) {
					setError(messageOf(failed));
				} finally {
					setBusy(false);
				}
			};

			const descend = (entry) => {
				setStack((list) => list.concat([{ name: entry.name, handle: entry.handle }]));
				read(entry.handle);
			};

			const levelUp = () => {
				if (stack.length <= 1) return;
				const next = stack.slice(0, -1);
				setStack(next);
				read(next[next.length - 1].handle);
			};

			const canCreate = mode === 'handle' && current !== null;

			return h('div', null,
				h('div', { className: 'mc-card mc-folder' },
				h('div', { className: 'mc-folder-head' },
					h('div', { className: 'mc-folder-title' },
						h('strong', null, folder.name),
						h('span', { className: 'mc-path', title: folder.path }, folder.path)),
					h('div', { className: 'mc-row' },
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => { if (!open) openFolder(); else setOpen(false); } }, open ? t('folder.hide') : t('folder.browse')),
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-btn-danger', onClick: onRemove }, t('folder.remove')))),
				open ? h('div', { className: 'mc-folder' },
					mode === 'path'
						? h('span', { className: 'mc-caption' }, t('folder.pathMode'))
						: h('div', { className: 'mc-row' },
							stack.length > 1 ? h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: levelUp }, ICON_UP, t('folder.up')) : null,
							stack.length > 1 ? h('span', { className: 'mc-caption' }, stack[stack.length - 1].name) : null,
							h('div', { className: 'mc-spacer' }),
							h('button', {
								type: 'button',
								className: 'mc-btn mc-btn-sm',
								disabled: !canCreate,
								onClick: () => { setCreating(!creating); setCreatingFile(false); setDraft(''); },
							}, ICON_PLUS, t('folder.newSub')),
							h('button', {
								type: 'button',
								className: 'mc-btn mc-btn-sm',
								disabled: !canCreate,
								onClick: () => { setCreatingFile(!creatingFile); setCreating(false); setFileDraft(''); },
							}, ICON_FILE, t('folder.newFile'))),
					mode === 'handle' && busy ? h('span', { className: 'mc-caption' }, t('folder.loading')) : null,
					mode === 'handle' && needsPermission ? h('div', { className: 'mc-row' },
						h('span', { className: 'mc-caption' }, t('folder.notAllowed')),
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => read(current) }, t('folder.grant'))) : null,
					mode === 'handle' && error ? h('p', { className: 'mc-error' }, error, ' ', h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => read(current) }, t('retry'))) : null,
					creating ? h('div', { className: 'mc-row' },
						h('input', {
							className: 'mc-input',
							style: { maxWidth: '240px' },
							value: draft,
							placeholder: t('folder.newSub'),
							onChange: (event) => setDraft(event.target.value),
							onKeyDown: (event) => { if (event.key === 'Enter') createSub(); },
						}),
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-btn-primary', disabled: !draft.trim(), onClick: createSub }, t('confirm')),
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => { setCreating(false); setDraft(''); } }, t('cancel'))) : null,
					creatingFile ? h('div', { className: 'mc-row' },
						h('input', {
							className: 'mc-input',
							style: { maxWidth: '240px' },
							value: fileDraft,
							placeholder: 'notes.md',
							onChange: (event) => setFileDraft(event.target.value),
							onKeyDown: (event) => { if (event.key === 'Enter') createFile(); },
						}),
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-btn-primary', disabled: !fileDraft.trim(), onClick: createFile }, t('confirm')),
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => { setCreatingFile(false); setFileDraft(''); } }, t('cancel'))) : null,
					mode === 'handle' && !busy && !needsPermission && !error
						? h('div', { className: 'mc-list' },
							!entries || entries.length === 0
								? h('span', { className: 'mc-caption' }, t('folder.emptyList'))
								: entries.map((entry) => (entry.kind === 'directory'
									? h('button', {
										key: entry.name,
										type: 'button',
										className: 'mc-listrow',
										onClick: () => descend(entry),
									}, h('span', { className: 'mc-glyph' }, ICON_FOLDER), entry.name)
									: h('button', {
										key: entry.name,
										type: 'button',
										className: 'mc-listrow',
										title: t('file.open'),
										onClick: () => setViewer({ handle: entry.handle, name: entry.name }),
									},
										h('span', { className: 'mc-glyph' }, ICON_FILE),
										h('span', { style: { flex: '1', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, entry.name),
										entry.size === undefined ? null : h('span', { className: 'mc-caption', style: { margin: 0 } }, formatSize(entry.size))))),
							entries && entries.length > 0 ? h('span', { className: 'mc-caption' }, format(t('folder.count'), { count: entries.filter((entry) => entry.kind === 'directory').length })) : null) : null)
					: null),
				viewer ? h(FilePreview, {
					key: viewer.name,
					t,
					target: viewer,
					dir: current,
					onClose: () => setViewer(null),
					onChanged: () => { if (current) read(current); },
				}) : null);
		}

		function TagPane(props) {
			const { t, ui, tag, rootHandle, notify, askPrompt, askConfirm, onMutateTag } = props;
			const [busy, setBusy] = useState(false);

			const addFolder = async (id, handle, name) => {
				await putHandle(id, handle);
				onMutateTag((current) => ({
					...current,
					folders: current.folders.concat([{ id, name, path: handle.name || name, createdAt: Date.now() }]),
				}));
			};

			const newFolder = async () => {
				if (!HAS_DIRECTORY_ACCESS || !rootHandle) {
					notify(t('tag.noCreate'), 'error');
					return;
				}
				if (!(await ensurePermission(rootHandle, 'readwrite'))) {
					notify(t('folder.notAllowed'), 'error');
					return;
				}
				const name = await askPrompt({ title: t('tag.newFolder'), label: t('tag.folderName'), initial: tag.name });
				if (!name) return;
				setBusy(true);
				try {
					const child = await rootHandle.getDirectoryHandle(sanitizeName(name), { create: true });
					await addFolder(uid(), child, String(name));
				} catch (failed) {
					notify(messageOf(failed), 'error');
				} finally {
					setBusy(false);
				}
			};

			const linkFolder = async () => {
				if (HAS_DIRECTORY_ACCESS) {
					let handle;
					try {
						handle = await window.showDirectoryPicker({ mode: 'readwrite' });
					} catch (failed) {
						if (failed && failed.name === 'AbortError') return;
						notify(messageOf(failed), 'error');
						return;
					}
					await addFolder(uid(), handle, handle.name);
					return;
				}
				if (!ui) {
					notify(t('folder.noService'), 'error');
					return;
				}
				try {
					const picked = await ui.pickDirectory();
					if (!picked) return;
					const fallback = picked.split(/[\\/]/).filter(Boolean).pop() || tag.name;
					const name = await askPrompt({ title: t('tag.linkFolder'), label: t('tag.folderName'), initial: fallback });
					if (!name) return;
					onMutateTag((current) => ({ ...current, folders: current.folders.concat([{ id: uid(), name: String(name), path: picked, createdAt: Date.now() }]) }));
				} catch (failed) {
					notify(messageOf(failed), 'error');
				}
			};

			const removeFolder = async (folder) => {
				const ok = await askConfirm({ title: t('folder.remove'), message: folder.name + '\n' + folder.path, danger: true });
				if (!ok) return;
				onMutateTag((current) => ({ ...current, folders: current.folders.filter((item) => item.id !== folder.id) }));
				await dropHandle(folder.id);
				notify(t('folder.removed'));
			};

			return h('section', { className: 'mc-tagpane' },
				h('div', { className: 'mc-taghead' },
					h('strong', null, tag.name),
					h('span', { className: 'mc-badge' }, tag.source === 'course' ? t('tab.timetable') : t('tags')),
					h('div', { className: 'mc-spacer' }),
					h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: newFolder, disabled: busy || !HAS_DIRECTORY_ACCESS || !rootHandle }, ICON_PLUS, t('tag.newFolder')),
					h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: linkFolder }, ICON_FOLDER, t('tag.linkFolder'))),
				tag.folders.length === 0
					? h('div', { className: 'mc-card mc-folder', style: { alignItems: 'center', textAlign: 'center', padding: '28px 16px', color: 'var(--dsw-alias-label-tertiary)' } },
						h('p', { style: { margin: 0, fontSize: '13px' } }, t('tag.empty')))
					: tag.folders.map((folder) => h(FolderCard, {
						key: folder.id,
						t,
						folder,
						notify,
						onRemove: () => removeFolder(folder),
					})));
		}

		function FilesWorkbench(props) {
			const { t, ui, notify, askPrompt, askConfirm, focusTag } = props;
			const state = useStore();
			const [selectedTagId, setSelectedTagId] = useState(null);
			const [rootHandle, setRootHandle] = useState(null);
			const [busy, setBusy] = useState(false);
			const booted = useRef(false);

			const linkOnly = !HAS_DIRECTORY_ACCESS;

			const mutateTags = useCallback((producer) => {
				updateWith((current) => ({ ...current, tags: producer(current.tags) }));
			}, []);

			const syncTags = useCallback(() => {
				updateWith((current) => {
					const names = [];
					current.terms.forEach((term) => term.entries.forEach((entry) => {
						if (entry.kind === 'course' && names.indexOf(entry.name) < 0) names.push(entry.name);
					}));
					const known = new Set(current.tags.map((tag) => tag.name));
					const missing = names.filter((name) => !known.has(name));
					if (missing.length === 0) return current;
					return {
						...current,
						tags: current.tags.concat(missing.map((name) => ({ id: uid(), name, source: 'course', folders: [] }))),
					};
				});
			}, []);

			useEffect(() => {
				if (!focusTag) return;
				const match = state.tags.find((tag) => tag.name === focusTag);
				if (match) setSelectedTagId(match.id);
			}, [focusTag]);

			useEffect(() => {
				syncTags();
				if (booted.current) return;
				booted.current = true;
				if (!HAS_DIRECTORY_ACCESS) return;
				(async () => {
					const handle = await getHandle('root');
					if (!handle) return;
					setRootHandle(handle);
					if (!state.filesRoot) update({ filesRoot: handle.name });
				})();
			}, []);

			const createRoot = async () => {
				if (!HAS_DIRECTORY_ACCESS) {
					await pickHostRoot();
					return;
				}
				setBusy(true);
				try {
					const parent = await window.showDirectoryPicker({ mode: 'readwrite' });
					const root = await parent.getDirectoryHandle(ROOT_FOLDER_NAME, { create: true });
					await putHandle('root', root);
					setRootHandle(root);
					update({ filesRoot: root.name });
					notify(format(t('tags.rootCreated'), { name: root.name }));
				} catch (failed) {
					if (failed && failed.name === 'AbortError') return;
					notify(messageOf(failed), 'error');
				} finally {
					setBusy(false);
				}
			};

			const pickExistingRoot = async () => {
				if (!HAS_DIRECTORY_ACCESS) {
					await pickHostRoot();
					return;
				}
				setBusy(true);
				try {
					const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
					await putHandle('root', handle);
					setRootHandle(handle);
					update({ filesRoot: handle.name });
				} catch (failed) {
					if (failed && failed.name === 'AbortError') return;
					notify(messageOf(failed), 'error');
				} finally {
					setBusy(false);
				}
			};

			const pickHostRoot = async () => {
				if (!ui) {
					notify(t('folder.noService'), 'error');
					return;
				}
				try {
					const picked = await ui.pickDirectory();
					if (picked) update({ filesRoot: picked });
				} catch (failed) {
					notify(messageOf(failed), 'error');
				}
			};

			const createTag = async () => {
				const name = await askPrompt({ title: t('tags.new'), label: t('prompt.name'), initial: '' });
				if (!name) return;
				const id = uid();
				mutateTags((tags) => tags.concat([{ id, name: String(name), source: 'manual', folders: [] }]));
				setSelectedTagId(id);
			};

			const renameTag = async (tag) => {
				const name = await askPrompt({ title: t('tag.rename'), label: t('prompt.name'), initial: tag.name });
				if (!name) return;
				mutateTags((tags) => tags.map((item) => (item.id === tag.id ? { ...item, name: String(name) } : item)));
			};

			const removeTag = async (tag) => {
				const ok = await askConfirm({ title: t('tag.remove'), message: format(t('tag.remove.confirm'), { name: tag.name }), danger: true });
				if (!ok) return;
				const ids = tag.folders.map((folder) => folder.id);
				mutateTags((tags) => tags.filter((item) => item.id !== tag.id));
				if (selectedTagId === tag.id) setSelectedTagId(null);
				for (const id of ids) await dropHandle(id);
			};

			const createAllFolders = async () => {
				if (!HAS_DIRECTORY_ACCESS || !rootHandle) {
					notify(t('tag.noCreate'), 'error');
					return;
				}
				if (!(await ensurePermission(rootHandle, 'readwrite'))) {
					notify(t('folder.notAllowed'), 'error');
					return;
				}
				const pending = state.tags.filter((tag) => tag.folders.length === 0);
				if (pending.length === 0) {
					notify(t('tag.allHave'));
					return;
				}
				setBusy(true);
				let created = 0;
				const additions = [];
				for (const tag of pending) {
					try {
						const child = await rootHandle.getDirectoryHandle(sanitizeName(tag.name), { create: true });
						const id = uid();
						await putHandle(id, child);
						additions.push({ tagId: tag.id, folder: { id, name: tag.name, path: child.name, createdAt: Date.now() } });
						created += 1;
					} catch (failed) {
						/* one failure must not stop the rest */
					}
				}
				if (additions.length > 0) {
					mutateTags((tags) => tags.map((tag) => {
						const addition = additions.find((item) => item.tagId === tag.id);
						return addition ? { ...tag, folders: tag.folders.concat([addition.folder]) } : tag;
					}));
				}
				setBusy(false);
				notify(format(t('tag.added'), { count: created }));
			};

			const tags = state.tags;
			const activeTag = tags.find((tag) => tag.id === selectedTagId) || tags[0] || null;
			const hasRoot = Boolean(state.filesRoot) && (linkOnly || rootHandle !== null);

			const rootPanel = hasRoot
				? h('div', { className: 'mc-rootbar' },
					h('span', { className: 'mc-badge' }, t('files.root')),
					h('span', { className: 'mc-path' }, state.filesRoot),
					h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: pickExistingRoot, disabled: busy }, t('files.root.change')))
				: h('div', { className: 'mc-card', style: { marginBottom: '14px' } },
					h('strong', { style: { display: 'block', fontSize: '13px', marginBottom: '4px' } }, t('tags.rootTitle')),
					h('p', { className: 'mc-caption', style: { margin: '0 0 10px' } }, linkOnly ? t('tags.linkOnly') : t('tags.rootCta')),
					h('div', { className: 'mc-row' },
						h('button', { type: 'button', className: 'mc-btn mc-btn-primary mc-btn-sm', onClick: createRoot, disabled: busy }, linkOnly ? t('files.root.choose') : t('tags.createRoot')),
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: pickExistingRoot, disabled: busy }, t('tags.useRoot'))));

			return h('div', null,
				rootPanel,
				hasRoot ? h('div', { className: 'mc-toolbar' },
					h('button', { type: 'button', className: 'mc-btn mc-btn-primary', onClick: createTag }, ICON_PLUS, t('tags.new')),
					h('button', { type: 'button', className: 'mc-btn', onClick: syncTags }, t('tags.sync')),
					h('button', { type: 'button', className: 'mc-btn', onClick: createAllFolders, disabled: tags.length === 0 || busy || linkOnly }, t('tag.autoAll'))) : null,
				tags.length === 0
					? h('div', { className: 'mc-card mc-tagpane', style: { textAlign: 'center', padding: '36px 16px', color: 'var(--dsw-alias-label-tertiary)' } },
						h('p', { style: { margin: 0, fontSize: '13px' } }, t('tags.empty')))
					: h('div', null,
						h('div', { className: 'mc-workbench' },
							h('aside', { className: 'mc-card mc-taglist' },
								h('div', { className: 'mc-taglist-head' },
									h('span', null, t('tags')),
									h('span', { className: 'mc-tagcount' }, String(tags.length))),
								tags.map((tag) => h('button', {
									key: tag.id,
									type: 'button',
									className: 'mc-tagbtn',
									'aria-current': activeTag && tag.id === activeTag.id,
									onClick: () => setSelectedTagId(tag.id),
								},
									h('span', { className: 'mc-taglabel' }, tag.name),
									h('span', { className: 'mc-tagcount' }, String(tag.folders.length))))),
							activeTag ? h(TagPane, {
								key: activeTag.id,
								t,
								ui,
								tag: activeTag,
								rootHandle,
								notify,
								askPrompt,
								askConfirm,
								onMutateTag: (mutator) => mutateTags((current) => current.map((tag) => (tag.id === activeTag.id ? mutator(tag) : tag))),
							}) : null),
						activeTag ? h('div', { className: 'mc-row', style: { marginTop: '10px' } },
							h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => renameTag(activeTag) }, t('tag.rename')),
							h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-btn-danger', onClick: () => removeTag(activeTag) }, t('tag.remove'))) : null));
		}

		/* ------------------------------------------------------------------ */
		/* Page                                                               */
		/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
		/* 批次④：论文工作台（左全文 / 右中文解读 + 实时提问）                  */
		/* 全文只放内存 Map：关闭即释放，避免把几十万字符写进 localStorage。   */
		/* ------------------------------------------------------------------ */

		const paperTexts = new Map();

		function paperFailText(t, code) {
			const raw = String(code || '');
			if (raw === 'NO_SERVICES' || raw === 'NO_MODEL') return t('wb.noModel');
			if (raw === 'NO_TEXT' || raw === 'NO_PAPER_TEXT') return t('wb.noTextBody');
			if (raw === 'PAPER_NO_HTML') return t('wb.noHtml');
			if (raw === 'TIMEOUT' || raw === 'UPSTREAM_TIMEOUT') return t('wb.timeout');
			if (raw === 'ABORTED') return t('wb.aborted');
			if (raw.indexOf('MODEL_max-tokens') === 0) return t('wb.truncated');
			return format(t('wb.failed'), { code: raw || 'ERROR' });
		}

		function PaperWorkbench(props) {
			const { t, paper, onClose, page } = props;
			const panelState = useStore();
			const slice = panelState.paper || {};
			const cell = (slice.items && slice.items[paper.id]) || null;
			const [tab, setTab] = useState(slice.tab === 'chat' ? 'chat' : 'guide');
			const [text, setText] = useState(() => paperTexts.get(paper.id) || null);
			const [textBusy, setTextBusy] = useState(!paperTexts.has(paper.id));
			const [textError, setTextError] = useState('');
			const [status, setStatus] = useState(null);
			const [busyKey, setBusyKey] = useState('');
			const [guideDraft, setGuideDraft] = useState('');
			const [liveSection, setLiveSection] = useState('');
			const [sectionDraft, setSectionDraft] = useState('');
			const [askDraft, setAskDraft] = useState('');
			const [question, setQuestion] = useState('');
			const [notice, setNoticeText] = useState('');
			const [copied, setCopied] = useState(false);
			const [noticeOk, setNoticeOk] = useState(false);
			/* 批次⑥：阅读视图、逐段对照、段落笔记、术语表、提问范围。 */
			const [view, setView] = useState(() => (cell && WB_VIEWS.indexOf(cell.view) >= 0 ? cell.view : 'bi'));
			const [liveMode, setLiveMode] = useState('');
			const [scope, setScope] = useState('all');
			const [activeSec, setActiveSec] = useState('');
			const [noteTarget, setNoteTarget] = useState(null);
			const [noteDraft, setNoteDraft] = useState('');
			const [noteEdit, setNoteEdit] = useState('');
			const [glossDraft, setGlossDraft] = useState(() => glossaryText(panelState.profile && panelState.profile.glossary));
			const [glossOpen, setGlossOpen] = useState(false);
			const abortRef = useRef(null);
			const busyLock = useRef(false);
			const autoRef = useRef(false);
			const leftRef = useRef(null);
			const chatRef = useRef(null);
			const scrollRef = useRef(cell ? cell.anchor || 0 : 0);
			const aliveRef = useRef(true);

			const guide = (cell && cell.guide) || '';
			const sectionsZh = (cell && cell.sectionsZh) || {};
			const chat = (cell && cell.chat) || [];
			const notes = (cell && cell.notes) || [];
			const noModel = Boolean(status && status.llm && status.llm.available === false);
			const sections = text && Array.isArray(text.sections) ? text.sections : [];
			const activeSection = sections.find((section) => section && section.key === activeSec) || sections[0] || null;
			const cursor = h('span', { className: 'mc-wb-cursor', 'aria-hidden': 'true' });

			/* 提示条默认按错误样式显示；成功提示显式改用中性色，别把成功画成红色。 */
			function setNotice(text) {
				setNoticeOk(false);
				setNoticeText(text);
			}

			function setNoticeGood(text) {
				setNoticeOk(true);
				setNoticeText(text);
			}

			/* 术语表每次现算：画像改动后立刻反映到下一次请求里。 */
			function glossaryList() {
				return normalizeGlossary(panelState.profile && panelState.profile.glossary);
			}
			/* 渲染期只读一份：保存后由 store 更新触发重渲染，不在渲染里写状态。 */
			const glossary = glossaryList();

			function lock(key) {
				busyLock.current = true;
				setBusyKey(key);
			}

			function unlock() {
				busyLock.current = false;
				setBusyKey('');
			}

			async function stream(target, payload, onDelta) {
				const controller = typeof AbortController === 'function' ? new AbortController() : null;
				abortRef.current = controller;
				try {
					const res = await fetch(target, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify(payload),
						signal: controller ? controller.signal : undefined,
					});
					const type = String((res.headers && res.headers.get && res.headers.get('content-type')) || '');
					if (type.indexOf('text/event-stream') < 0) {
						let body = null;
						try {
							body = await res.json();
						} catch (error) {
							body = null;
						}
						return { ok: false, error: String((body && body.error) || ('HTTP_' + res.status)), text: '' };
					}
					if (!res.body || typeof res.body.getReader !== 'function') return { ok: false, error: 'NO_STREAM', text: '' };
					const reader = res.body.getReader();
					const decoder = typeof TextDecoder === 'function' ? new TextDecoder() : null;
					let buffer = '';
					let full = '';
					let failure = '';
					let model = '';
					for (;;) {
						const step = await reader.read();
						if (step.done) break;
						buffer += decoder ? decoder.decode(step.value, { stream: true }) : String(step.value || '');
						const parsed = readSseFrames(buffer);
						buffer = parsed.rest;
						for (let index = 0; index < parsed.events.length; index += 1) {
							const frame = parsed.events[index];
							let data = null;
							try {
								data = JSON.parse(frame.data);
							} catch (error) {
								data = null;
							}
							if (!data) continue;
							if (frame.event === 'delta' && typeof data.text === 'string') {
								full += data.text;
								if (onDelta) onDelta(full);
							} else if (frame.event === 'done') {
								model = String(data.model || '');
							} else if (frame.event === 'error') {
								failure = String(data.error || 'ERROR');
							}
						}
					}
					if (failure) return { ok: false, error: failure, text: full };
					return { ok: true, error: '', text: full, model };
				} catch (error) {
					const aborted = Boolean(error) && (error.name === 'AbortError' || String(error).toLowerCase().indexOf('abort') >= 0);
					return { ok: false, error: aborted ? 'ABORTED' : messageOf(error), text: '' };
				} finally {
					abortRef.current = null;
				}
			}

			function describe(code) {
				const raw = String(code || '');
				if (raw === 'PAPER_NO_HTML' || raw === 'NO_HTML') return t('wb.noHtml');
				if (raw === 'PDF_NO_TEXT') return t('wb.pdfNoText');
				if (raw === 'PDF_ENCRYPTED') return t('wb.pdfEncrypted');
				if (raw === 'PDF_TOO_LARGE') return t('wb.pdfTooLarge');
				if (raw === 'PDF_NOT_CACHED') return t('wb.pdfNotCached');
				if (raw === 'PDF_PARSE_FAILED' || raw === 'PDF_BAD_INPUT') return t('wb.pdfParseFailed');
				if (raw.indexOf('UPSTREAM_') === 0) return raw;
				return raw || 'ERROR';
			}

			function paperTitle() {
				return String((text && text.title) || (cell && cell.title) || (paper && paper.title) || '').slice(0, 300);
			}

			/* 导读只吃摘要：先取 abstract 小节，退而取第一节，保证标题+摘要都非空。 */
			function guideSource() {
				const rowsAll = text && Array.isArray(text.sections) ? text.sections : [];
				const pick = rowsAll.find((row) => row && row.key === 'abstract')
					|| rowsAll.find((row) => row && typeof row.heading === 'string' && /abstract|摘要/i.test(row.heading))
					|| rowsAll[0]
					|| null;
				const rows = pick && Array.isArray(pick.paragraphs) ? pick.paragraphs : [];
				return rows.map((row) => String(row || '').trim()).filter((row) => row.length > 0).join('\n').slice(0, 2400);
			}

			/* 偶尔会在 maxTokens 处截断：有部分内容时按成功处理，只加一条提示。 */
			function truncatedOf(result) {
				return Boolean(result) && !result.ok && /^MODEL_max-tokens/i.test(String(result.error || ''));
			}

			async function runGuide(force) {
				if (busyLock.current || noModel) return;
				lock('guide');
				setNotice('');
				setGuideDraft('');
				const guideAbstract = guideSource();
				if (!guideAbstract) {
					unlock();
					setNotice(t('wb.guideNoAbstract'));
					return;
				}
				const result = await stream(WB_EXPLAIN_ROUTE, { id: paper.id, mode: 'guide', title: paperTitle(), abstract: guideAbstract, glossary: glossaryList() }, (full) => setGuideDraft(full));
				unlock();
				if (!aliveRef.current) return;
				if ((result.ok || truncatedOf(result)) && result.text) {
					setNoticeGood(truncatedOf(result) ? t('wb.truncated') : '');
					setGuideDraft('');
					setTab('guide');
					patchPaper(paper.id, {
						guide: result.text,
						title: (text && text.title) || (cell && cell.title) || '',
						url: (itemUrlOf(paper, cell) || ''),
					});
				} else if (result.error !== 'ABORTED') {
					setGuideDraft('');
					setNotice(paperFailText(t, result.error));
				} else if (!force) {
					setGuideDraft('');
				}
			}

			async function runSection(section) {
				if (busyLock.current || noModel) return;
				const body = (section.paragraphs || []).join('\n\n').slice(0, WB_SECTION_INPUT_MAX);
				if (body.trim().length < 40) {
					setNotice(t('wb.sectionShort'));
					return;
				}
				lock('section');
				setNotice('');
				setLiveSection(section.key);
				setLiveMode('section');
				setSectionDraft('');
				const result = await stream(WB_EXPLAIN_ROUTE, { id: paper.id, mode: 'section', title: paperTitle(), heading: section.heading, text: body, glossary: glossaryList() }, (full) => setSectionDraft(full));
				unlock();
				if (!aliveRef.current) return;
				setLiveSection('');
				setLiveMode('');
				setSectionDraft('');
				if ((result.ok || truncatedOf(result)) && result.text) {
					if (truncatedOf(result)) setNoticeGood(t('wb.truncated'));
					patchPaper(paper.id, (current) => ({
						sectionsZh: { ...(current.sectionsZh || {}), [section.key]: { zh: result.text, at: Date.now() } },
					}));
				} else if (result.error !== 'ABORTED') {
					setNotice(paperFailText(t, result.error));
				}
			}

			async function runSentence(section, paragraph) {
				if (busyLock.current || noModel) return;
				const body = String(paragraph || '').slice(0, WB_SENTENCE_INPUT_MAX);
				if (!body.trim()) return;
				lock('section');
				setNotice('');
				setLiveSection(section.key);
				setLiveMode('sentence');
				setSectionDraft('');
				const result = await stream(WB_EXPLAIN_ROUTE, { id: paper.id, mode: 'sentence', title: paperTitle(), heading: section.heading, text: body, glossary: glossaryList() }, (full) => setSectionDraft(full));
				unlock();
				if (!aliveRef.current) return;
				setLiveSection('');
				setLiveMode('');
				setSectionDraft('');
				if ((result.ok || truncatedOf(result)) && result.text) {
					if (truncatedOf(result)) setNoticeGood(t('wb.truncated'));
					patchPaper(paper.id, (current) => ({
						sectionsZh: { ...(current.sectionsZh || {}), [section.key]: { zh: result.text, at: Date.now() } },
					}));
					setScope('section');
					setActiveSec(section.key);
					setTab('guide');
					setPaperTab('guide');
				} else if (result.error !== 'ABORTED') {
					setNotice(paperFailText(t, result.error));
				}
			}

			/* 逐段对照：只发本节的段落数组，前端按 [n] 校验，错位就退回整节译文。 */
			async function runAlign(section) {
				if (busyLock.current || noModel) return;
				const paragraphs = (section.paragraphs || [])
					.map((row) => String(row || '').trim())
					.filter((row) => row.length > 0)
					.slice(0, WB_ALIGN_PARAS_MAX);
				if (paragraphs.length === 0) {
					setNotice(t('wb.sectionShort'));
					return;
				}
				lock('section');
				setNotice('');
				setLiveSection(section.key);
				setLiveMode('align');
				setSectionDraft('');
				const result = await stream(WB_EXPLAIN_ROUTE, {
					id: paper.id,
					mode: 'section',
					title: paperTitle(),
					heading: section.heading,
					paragraphs,
					glossary: glossaryList(),
				}, (full) => setSectionDraft(full));
				unlock();
				if (!aliveRef.current) return;
				setLiveSection('');
				setLiveMode('');
				setSectionDraft('');
				if (result.ok && result.text) {
					const aligned = parseAlignedTranslation(result.text, paragraphs.length);
					patchPaper(paper.id, (current) => ({
						sectionsZh: {
							...(current.sectionsZh || {}),
							[section.key]: aligned
								? { zh: '', aligned, at: Date.now() }
								: { zh: result.text, aligned: [], at: Date.now() },
						},
					}));
					setNotice(aligned ? '' : t('wb.alignFailed'));
				} else if (result.error !== 'ABORTED') {
					setNotice(paperFailText(t, result.error));
				}
			}

			function changeView(next) {
				if (WB_VIEWS.indexOf(next) < 0) return;
				setView(next);
				patchPaper(paper.id, { view: next });
			}

			function beginNote(section, order, paragraph) {
				setNoteEdit('');
				setNoteDraft('');
				setNoteTarget({
					key: section.key,
					heading: section.heading,
					order: order + 1,
					quote: String(paragraph || '').replace(/\s+/g, ' ').trim().slice(0, WB_NOTE_QUOTE_MAX),
				});
			}

			function saveNote() {
				const target = noteTarget;
				const value = String(noteDraft || '').trim().slice(0, WB_NOTE_TEXT_MAX);
				if (!target || !value) return;
				const id = noteEdit || 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
				patchPaper(paper.id, (current) => {
					const list = normalizePaperNotes(current.notes).filter((row) => row.id !== id);
					list.push({
						id,
						sec: target.key,
						para: target.order,
						heading: target.heading,
						quote: target.quote,
						text: value,
						at: Date.now(),
					});
					return { notes: normalizePaperNotes(list) };
				});
				setNoteDraft('');
				setNoteEdit('');
				setNoteTarget(null);
				setTab('notes');
				setPaperTab('notes');
			}

			function editNote(note) {
				setNoteEdit(note.id);
				setNoteDraft(note.text);
				setNoteTarget({ key: note.sec, heading: note.heading, order: note.para, quote: note.quote });
				setTab('notes');
				setPaperTab('notes');
			}

			function removeNote(id) {
				patchPaper(paper.id, (current) => ({
					notes: normalizePaperNotes(current.notes).filter((row) => row.id !== id),
				}));
				if (noteEdit === id) {
					setNoteEdit('');
					setNoteDraft('');
					setNoteTarget(null);
				}
			}

			/* 笔记点击回跳：先定位段落，找不到就退回小节标题。 */
			function jumpToNote(note) {
				const doc = typeof document === 'undefined' ? null : document;
				if (!doc) return;
				const para = note.para ? doc.getElementById(secId(note.sec + '-p' + note.para)) : null;
				const node = para || doc.getElementById(secId(note.sec));
				if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'start', behavior: 'smooth' });
				if (para && para.classList) {
					para.classList.add('mc-wb-flash');
					setTimeout(() => {
						try {
							para.classList.remove('mc-wb-flash');
						} catch (error) {
							/* 节点可能已卸载 */
						}
					}, 1400);
				}
			}

			function saveGlossary() {
				const list = normalizeGlossary(String(glossDraft || '').split(/\r?\n/));
				setGlossary(list);
				setGlossDraft(glossaryText(list));
				setNoticeGood(format(t('wb.glossarySaved'), { count: list.length }));
			}

			/* 导出只用现有数据，不再调模型：没有译文就只导出原文与笔记。 */
			function exportMarkdown() {
				const title = (text && text.title) || (cell && cell.title) || paper.title || paper.id;
				const markdown = buildPaperMarkdown({
					id: paper.id,
					title,
					venue: (cell && cell.venue) || '',
					ccf: (cell && cell.ccf) || '',
					url: itemUrlOf(paper, cell) || '',
					sections,
					sectionsZh,
					guide,
					notes,
				});
				try {
					const name = String(title).replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '').slice(0, WB_EXPORT_NAME_MAX) || 'paper';
					const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
					const url = URL.createObjectURL(blob);
					const anchor = document.createElement('a');
					anchor.href = url;
					anchor.download = name + '.md';
					document.body.appendChild(anchor);
					anchor.click();
					document.body.removeChild(anchor);
					setTimeout(() => URL.revokeObjectURL(url), 4000);
					setNoticeGood(t('wb.exported'));
				} catch (error) {
					setNotice(t('wb.exportFailed'));
				}
			}

			async function sendQuestion() {
				const value = String(question || '').trim();
				if (value.length > 400) {
					setNotice(t('wb.askTooLong'));
					return;
				}
				if (!value) return;
				if (busyLock.current) {
					setNotice(t('wb.busy'));
					return;
				}
				if (!cell) return;
				const history = chat.slice(-4).map((entry) => ({ role: entry.role, text: entry.text }));
				lock('ask');
				setNotice('');
				setQuestion('');
				setAskDraft('');
				patchPaper(paper.id, (current) => ({
					chat: clipPaperChat([].concat(current.chat || [], [{ role: 'user', text: value, at: Date.now() }])),
				}));
				const sectionKey = scope === 'section' && activeSection ? activeSection.key : '';
				const result = await stream(WB_ASK_ROUTE, {
					id: paper.id,
					question: value,
					history,
					scope: sectionKey ? 'section' : 'all',
					sectionKey,
					glossary: glossaryList(),
				}, (full) => setAskDraft(full));
				unlock();
				if (!aliveRef.current) return;
				setAskDraft('');
				if ((result.ok || truncatedOf(result)) && result.text) {
					setNoticeGood(truncatedOf(result) ? t('wb.truncated') : '');
					patchPaper(paper.id, (current) => ({
						chat: clipPaperChat([].concat(current.chat || [], [{ role: 'assistant', text: result.text, at: Date.now() }])),
					}));
				} else if (result.error !== 'ABORTED') {
					patchPaper(paper.id, (current) => ({
						chat: clipPaperChat([].concat(current.chat || [], [{ role: 'assistant', text: paperFailText(t, result.error), at: Date.now() }])),
					}));
				}
			}

			function switchTab(next) {
				const value = next === 'chat' || next === 'notes' ? next : 'guide';
				setTab(value);
				setPaperTab(value);
			}

			function close() {
				if (abortRef.current) {
					try {
						abortRef.current.abort();
					} catch (error) {
						/* 关闭时中止在途请求，失败无妨 */
					}
					abortRef.current = null;
				}
				const anchor = leftRef.current ? leftRef.current.scrollTop : 0;
				if (anchor > 0) rememberPaperAnchor(paper.id, anchor);
				paperTexts.delete(paper.id);
				closePaper(paper.id);
				if (onClose) onClose();
			}

			function copyCite() {
				const title = (text && text.title) || (cell && cell.title) || paper.title;
				const pdfEntry = String(paper.id || '').indexOf('pdf:') === 0;
				const cite = String(title || '').replace(/\s+/g, ' ').trim() + (pdfEntry ? '. PDF:' : '. arXiv:') + paper.id + '. ' + (itemUrlOf(paper, cell) || '');
				const done = () => {
					setCopied(true);
					setTimeout(() => {
						if (aliveRef.current) setCopied(false);
					}, 1600);
				};
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(cite).then(done, () => setNotice(t('wb.copyFailed')));
				} else {
					setNotice(t('wb.copyFailed'));
				}
			}

			useEffect(() => {
				aliveRef.current = true;
				return () => {
					aliveRef.current = false;
					if (abortRef.current) {
						try {
							abortRef.current.abort();
						} catch (error) {
							/* 卸载中止 */
						}
						abortRef.current = null;
					}
					paperTexts.delete(paper.id);
				};
			}, [paper.id]);

			useEffect(() => {
				if (paperTexts.has(paper.id)) {
					setText(paperTexts.get(paper.id));
					setTextBusy(false);
					return undefined;
				}
				let live = true;
				setTextBusy(true);
				setTextError('');
				/* PDF 条目按 id 取服务端缓存；arXiv 条目按 url 现抓 HTML 全文。 */
				const pdfEntry = String(paper.id || '').indexOf('pdf:') === 0;
				fetch(pdfEntry ? WB_PDF_ROUTE : WB_TEXT_ROUTE, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(pdfEntry ? { id: paper.id } : { url: itemUrlOf(paper, cell) }),
				})
					.then((res) => res.json().then((payload) => ({ res, payload }), () => ({ res, payload: null })))
					.then((bundle) => {
						if (!live) return;
						const payload = bundle.payload;
						if (payload && payload.ok) {
							paperTexts.set(paper.id, payload);
							setText(payload);
							setTextError('');
						} else {
							setTextError(String((payload && payload.error) || ('HTTP_' + (bundle.res && bundle.res.status))));
						}
						setTextBusy(false);
					})
					.catch((error) => {
						if (!live) return;
						setTextError(messageOf(error));
						setTextBusy(false);
					});
				return () => {
					live = false;
				};
			}, [paper.id]);

			useEffect(() => {
				let live = true;
				fetch(WB_STATUS_ROUTE, { method: 'GET' })
					.then((res) => res.json())
					.then((payload) => {
						if (live && payload && payload.ok) setStatus(payload);
					})
					.catch(() => {
						/* 状态探测失败就当作可用，交给生成时的错误提示 */
					});
				return () => {
					live = false;
				};
			}, []);

			useEffect(() => {
				const onKey = (event) => {
					if (event.key !== 'Escape' && event.key !== 'Esc') return;
					event.preventDefault();
					event.stopPropagation();
					close();
				};
				document.addEventListener('keydown', onKey, true);
				return () => document.removeEventListener('keydown', onKey, true);
			});

			useEffect(() => {
				const node = leftRef.current;
				if (node && scrollRef.current > 0) node.scrollTop = scrollRef.current;
			}, [text]);

			useEffect(() => {
				const node = chatRef.current;
				if (node) node.scrollTop = node.scrollHeight;
			}, [chat.length, askDraft]);

			useEffect(() => {
				if (!text || guide || autoRef.current) return;
				if (busyLock.current || noModel) return;
				autoRef.current = true;
				runGuide(false);
			}, [text, guide, textError, status]);

			const secId = (key) => 'mc-wb-' + String(paper.id).replace(/[^A-Za-z0-9.-]/g, '_') + '-' + String(key).replace(/[^A-Za-z0-9.-]/g, '_');

			const pdfPaper = String(paper.id || '').indexOf('pdf:') === 0;
			const head = h('div', { className: 'mc-wb-head' },
				page ? h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-wb-back', onClick: close }, '‹ ' + t('wb.tab')) : null,
				h('div', { className: 'mc-wb-title', title: (text && text.title) || paper.title }, (text && text.title) || paper.title),
				h('span', { className: 'mc-wb-id' }, pdfPaper ? t('wb.kindPdf') : 'arXiv:' + paper.id),
				text && text.cached ? h('span', { className: 'mc-wb-chip' }, t('wb.cached')) : null,
				text && text.truncated ? h('span', { className: 'mc-wb-chip' }, t('wb.tooLong')) : null,
				h('span', { className: 'mc-wb-gap' }),
				h('div', { className: 'mc-wb-views', role: 'group', 'aria-label': t('wb.view') },
					WB_VIEWS.map((key) => h('button', {
						key,
						type: 'button',
						className: 'mc-btn mc-btn-sm mc-wb-view',
						'aria-pressed': view === key ? 'true' : 'false',
						onClick: () => changeView(key),
					}, t(WB_VIEW_LABEL[key])))),
				h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: exportMarkdown }, t('wb.export')),
				h('a', {
					className: 'mc-btn mc-btn-sm',
					href: itemUrlOf(paper, cell) || paper.url,
					target: '_blank',
					rel: 'noreferrer noopener',
				}, t('wb.original')),
				h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: copyCite }, copied ? t('wb.copied') : t('wb.copyRef')),
				page ? null : h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: close, 'aria-label': t('wb.close') }, ICON_CLOSE));

			const skeleton = (count) => {
				const rows = [];
				for (let index = 0; index < count; index += 1) rows.push(h('div', { key: index, className: 'mc-wb-skeleton' }));
				return rows;
			};

			const toc = sections.length > 1
				? h('div', { className: 'mc-wb-toc' },
					h('div', { className: 'mc-wb-cap' }, t('wb.toc')),
					sections.map((section) => h('button', {
						key: section.key,
						type: 'button',
						className: 'mc-wb-toc-item',
						'data-level': String(section.level || 1),
						onClick: () => {
							const node = document.getElementById(secId(section.key));
							if (node && node.scrollIntoView) node.scrollIntoView({ block: 'start', behavior: 'smooth' });
						},
					}, section.heading)))
				: null;

			const sectionNode = (section) => {
				const stored = sectionsZh[section.key];
				const live = liveSection === section.key;
				const visible = (section.paragraphs || []).map((row) => String(row || '')).filter((row) => row.trim().length > 0);
				/* 只有段数与译文段数完全一致时才逐段对照，否则整节显示，绝不串段。 */
				const aligned = stored && Array.isArray(stored.aligned) && stored.aligned.length === visible.length ? stored.aligned : null;
				const showEn = view !== 'zh';
				const showZh = view !== 'en';
				const headingRow = h('div', { className: 'mc-wb-h', 'data-level': String(section.level || 1) },
					h('span', { className: 'mc-wb-h-text' }, section.heading),
					h('button', {
						type: 'button',
						className: 'mc-btn mc-btn-sm mc-wb-run',
						disabled: Boolean(busyKey) || noModel,
						onClick: () => runSection(section),
					}, live && liveMode === 'section' ? t('wb.streaming') : t('wb.sectionExplain')),
					h('button', {
						type: 'button',
						className: 'mc-btn mc-btn-sm mc-wb-run',
						disabled: Boolean(busyKey) || noModel || visible.length === 0,
						title: t('wb.alignHint'),
						onClick: () => runAlign(section),
					}, live && liveMode === 'align' ? t('wb.streaming') : aligned ? t('wb.realign') : t('wb.align')));
				const paras = visible.map((paragraph, order) => {
					const paraNotes = notes.filter((note) => note.sec === section.key && note.para === order + 1);
					const tools = h('span', { className: 'mc-wb-ptools' },
						h('button', {
							type: 'button',
							className: 'mc-btn mc-btn-sm mc-wb-ask-para',
							disabled: Boolean(busyKey) || noModel,
							onClick: () => runSentence(section, paragraph),
						}, t('wb.paraExplain')),
						h('button', {
							type: 'button',
							className: 'mc-btn mc-btn-sm mc-wb-ask-para',
							onClick: () => beginNote(section, order, paragraph),
						}, t('wb.noteAdd')));
					const para = showEn
						? h('p', {
							key: 'p' + order,
							className: paraNotes.length > 0 ? 'mc-wb-p mc-wb-has-note' : 'mc-wb-p',
							id: secId(section.key + '-p' + (order + 1)),
						}, paragraph, tools)
						: null;
					const pair = showZh && aligned ? h('div', { key: 'z' + order, className: 'mc-wb-zh mc-wb-pair' }, aligned[order]) : null;
					const marks = paraNotes.length > 0
						? h('div', { key: 'n' + order, className: 'mc-wb-pnotes' },
							paraNotes.map((note) => h('button', {
								key: note.id,
								type: 'button',
								className: 'mc-wb-pnote',
								title: note.text,
								onClick: () => jumpToNote(note),
							}, note.text.slice(0, 60))))
						: null;
					return h('div', { key: 'p' + order, className: 'mc-wb-para' }, para, pair, marks);
				});
				const zhBlock = !aligned && showZh && (live || stored)
					? h('div', { className: 'mc-wb-sec-zh' },
						h('div', { className: 'mc-wb-cap' }, '§ ' + section.heading + (live && liveMode === 'align' ? ' · ' + t('wb.aligning') : '')),
						h('div', { className: 'mc-wb-zh' }, live ? (sectionDraft || '') : (stored && stored.zh) || '', live ? cursor : null))
					: null;
				return h('section', { key: section.key, className: 'mc-wb-sec', id: secId(section.key) }, headingRow, paras, zhBlock);
			};

			function findSectionByHeading(heading) {
				const target = String(heading || '').replace(/\s+/g, ' ').trim();
				if (!target) return null;
				return sections.find((section) => section.heading === target)
					|| sections.find((section) => section.heading.indexOf(target) === 0 || target.indexOf(section.heading) === 0)
					|| null;
			}

			/* 引用角标只做“带我去看”，不保证模型给的段号一定对；找不到就停在节首。 */
			function jumpToCitation(cite) {
				const section = findSectionByHeading(cite && cite.heading);
				const doc = typeof document === 'undefined' ? null : document;
				if (!section || !doc) return;
				const para = cite.para ? doc.getElementById(secId(section.key + '-p' + cite.para)) : null;
				const node = para || doc.getElementById(secId(section.key));
				if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'start', behavior: 'smooth' });
				if (para && para.classList) {
					para.classList.add('mc-wb-flash');
					setTimeout(() => {
						try {
							para.classList.remove('mc-wb-flash');
						} catch (error) {
							/* 已卸载 */
						}
					}, 1400);
				}
			}

			const leftBody = textBusy
				? h('div', { className: 'mc-wb-loading' }, skeleton(10))
				: textError
					? h('div', { className: 'mc-wb-fail' },
						h('div', { className: 'mc-wb-note mc-wb-note-bad' }, format(t('wb.loadFailed'), { code: describe(textError) })),
						h('div', { className: 'mc-wb-note' }, t('wb.loadFailedHint')),
						h('a', { className: 'mc-btn', href: itemUrlOf(paper, cell) || paper.url, target: '_blank', rel: 'noreferrer noopener' }, t('wb.original')))
					: sections.length === 0
						? h('div', { className: 'mc-wb-fail' },
							h('div', { className: 'mc-wb-note' }, t('wb.emptyText')),
							h('a', { className: 'mc-btn', href: itemUrlOf(paper, cell) || paper.url, target: '_blank', rel: 'noreferrer noopener' }, t('wb.original')))
						: h(React.Fragment, null,
							sections.map(sectionNode),
							h('div', { className: 'mc-wb-end' }, '— ' + t('wb.end') + ' —'));

			const leftPane = h('div', { className: 'mc-wb-pane mc-wb-col', ref: leftRef }, toc, h('div', { className: 'mc-wb-paper' }, leftBody));

			const guidePane = h('div', { className: 'mc-wb-pane mc-wb-guide' },
				noModel ? h('div', { className: 'mc-wb-note mc-wb-note-warn' }, t('wb.noModel')) : null,
				h('div', { className: 'mc-wb-cap' }, t('wb.guideTitle')),
				guide || guideDraft
					? h('div', { className: 'mc-wb-zh mc-wb-guide-body' }, guide || guideDraft, busyKey === 'guide' ? cursor : null)
					: busyKey === 'guide'
						? h('div', null, skeleton(4), h('div', { className: 'mc-wb-note' }, t('wb.guideRunning')))
						: h('div', { className: 'mc-wb-note' }, t('wb.guideEmpty')),
				h('div', { className: 'mc-wb-row' },
					h('button', {
						type: 'button',
						className: 'mc-btn mc-btn-sm',
						disabled: Boolean(busyKey) || noModel,
						onClick: () => runGuide(true),
					}, busyKey === 'guide' ? t('wb.streaming') : t('wb.reguide')),
					h('button', {
						type: 'button',
						className: 'mc-btn mc-btn-sm',
						'aria-expanded': glossOpen ? 'true' : 'false',
						onClick: () => setGlossOpen((open) => !open),
					}, t('wb.glossary') + (glossary.length > 0 ? ' · ' + String(glossary.length) : ''))),
				h('div', { className: 'mc-wb-note' }, t('wb.guideHint')),
				glossOpen
					? h('div', { className: 'mc-wb-gloss' },
						h('div', { className: 'mc-wb-cap' }, t('wb.glossaryTitle')),
						h('div', { className: 'mc-wb-note' }, t('wb.glossaryHint')),
						h('textarea', {
							className: 'mc-input mc-wb-gloss-input',
							value: glossDraft,
							rows: 4,
							placeholder: 'attention = 注意力\nlatent space = 隐空间',
							onChange: (event) => setGlossDraft(event.target.value),
						}),
						h('div', { className: 'mc-wb-row' },
							h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-btn-primary', onClick: saveGlossary }, t('wb.glossarySave')),
							glossary.length === 0 ? h('span', { className: 'mc-wb-note' }, t('wb.glossaryEmpty')) : null))
					: null);

			const chatPane = h('div', { className: 'mc-wb-pane mc-wb-chatwrap' },
				noModel ? h('div', { className: 'mc-wb-note mc-wb-note-warn' }, t('wb.noModel')) : null,
				h('div', { className: 'mc-wb-chat', ref: chatRef },
					chat.length === 0 && !askDraft && busyKey !== 'ask'
						? h('div', { className: 'mc-wb-note' }, t('wb.askEmpty'))
						: null,
					chat.map((entry, index) => {
						const cites = entry.role === 'assistant' ? parseCitations(entry.text) : [];
						return h('div', { key: 'm' + index, className: 'mc-wb-msg', 'data-role': entry.role },
							entry.text,
							cites.length > 0
								? h('span', { className: 'mc-wb-cites' },
									cites.map((cite, at) => h('button', {
										key: 'c' + at,
										type: 'button',
										className: 'mc-wb-cite',
										title: t('wb.citeJump'),
										onClick: () => jumpToCitation(cite),
									}, '§' + cite.heading + (cite.para ? ' ¶' + cite.para : ''))))
								: null);
					}),
					busyKey === 'ask'
						? h('div', { className: 'mc-wb-msg', 'data-role': 'assistant' }, askDraft || t('wb.askThinking'), cursor)
						: null),
				h('div', { className: 'mc-wb-scope', role: 'group', 'aria-label': t('wb.askScope') },
					h('span', { className: 'mc-wb-cap' }, t('wb.askScope')),
					h('button', {
						type: 'button',
						className: 'mc-btn mc-btn-sm mc-wb-view',
						'aria-pressed': scope === 'all' ? 'true' : 'false',
						onClick: () => setScope('all'),
					}, t('wb.scopeAll')),
					h('button', {
						type: 'button',
						className: 'mc-btn mc-btn-sm mc-wb-view',
						'aria-pressed': scope === 'section' ? 'true' : 'false',
						disabled: !activeSection,
						title: activeSection ? activeSection.heading : t('wb.scopeNoSection'),
						onClick: () => setScope('section'),
					}, t('wb.scopeSection') + (activeSection ? ' · ' + activeSection.heading.slice(0, 18) : ''))),
				h('div', { className: 'mc-wb-ask' },
					h('textarea', {
						className: 'mc-input mc-wb-input',
						value: question,
						rows: 2,
						placeholder: t('wb.askPlaceholder'),
						disabled: noModel,
						onChange: (event) => setQuestion(event.target.value),
						onKeyDown: (event) => {
							if (event.key === 'Enter' && !event.shiftKey) {
								event.preventDefault();
								sendQuestion();
							}
						},
					}),
					h('button', {
						type: 'button',
						className: 'mc-btn mc-btn-primary mc-wb-send',
						disabled: noModel || Boolean(busyKey) || !String(question || '').trim(),
						onClick: sendQuestion,
					}, t('wb.askSend'))),
				h('div', { className: 'mc-wb-note' }, t('wb.askHint')));

			const notesTargetRow = noteTarget
				? h('div', { className: 'mc-wb-notecard' },
					h('div', { className: 'mc-wb-cap' }, '§ ' + (noteTarget.heading || '') + ' ¶' + noteTarget.order),
					h('div', { className: 'mc-wb-notecard-actions' },
						h('button', {
							type: 'button',
							className: 'mc-btn mc-btn-sm mc-btn-primary',
							disabled: !String(noteDraft || '').trim(),
							onClick: saveNote,
						}, t('wb.noteSave')),
						h('button', {
							type: 'button',
							className: 'mc-btn mc-btn-sm',
							onClick: () => {
								setNoteTarget(null);
								setNoteDraft('');
								setNoteEdit('');
							},
						}, t('wb.noteCancel'))))
				: null;

			const notesPane = h('div', { className: 'mc-wb-pane mc-wb-notes' },
				h('div', { className: 'mc-wb-cap' }, t('wb.tabNotes') + (notes.length > 0 ? ' · ' + String(notes.length) : '')),
				notesTargetRow,
				noteTarget
					? h('textarea', {
						className: 'mc-input mc-wb-note-input',
						value: noteDraft,
						rows: 4,
						placeholder: t('wb.notePlaceholder'),
						onChange: (event) => setNoteDraft(event.target.value),
					})
					: null,
				notes.length === 0 && !noteTarget
					? h('div', { className: 'mc-wb-note' }, t('wb.noteEmpty'))
					: h('div', { className: 'mc-wb-notelist' },
						notes.map((note) => h('div', { key: note.id, className: 'mc-wb-noterow' },
							h('button', {
								type: 'button',
								className: 'mc-wb-notewhere',
								onClick: () => jumpToNote(note),
							}, '§' + (note.heading || note.sec || '') + (note.para ? ' ¶' + note.para : '')),
							note.quote ? h('div', { className: 'mc-wb-notequote' }, note.quote) : null,
							h('div', { className: 'mc-wb-notetext' }, note.text),
							h('div', { className: 'mc-wb-noterow-actions' },
								h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => editNote(note) }, t('wb.noteEditLabel')),
								h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-btn-danger', onClick: () => removeNote(note.id) }, t('wb.noteDelete')))))),
				noteTarget ? null : h('div', { className: 'mc-wb-note' }, t('wb.noteHint')));

			const rightPane = h('div', { className: 'mc-wb-right' },
				h('div', { className: 'mc-wb-tabs' },
					h('button', {
						type: 'button',
						className: 'mc-wb-tab',
						'data-on': tab === 'guide' ? '1' : '0',
						onClick: () => switchTab('guide'),
					}, t('wb.tabGuide')),
					h('button', {
						type: 'button',
						className: 'mc-wb-tab',
						'data-on': tab === 'chat' ? '1' : '0',
						onClick: () => switchTab('chat'),
					}, t('wb.tabChat')),
					h('button', {
						type: 'button',
						className: 'mc-wb-tab',
						'data-on': tab === 'notes' ? '1' : '0',
						onClick: () => switchTab('notes'),
					}, t('wb.tabNotes') + (notes.length > 0 ? ' · ' + String(notes.length) : ''))),
				notice ? h('div', { className: 'mc-wb-note' + (noticeOk ? ' mc-wb-note-good' : ' mc-wb-note-bad') }, notice) : null,
				tab === 'notes' ? notesPane : tab === 'chat' ? chatPane : guidePane);

			const shell = h('div', { className: 'mc-wb-body' }, leftPane, rightPane);
			if (page) {
				return h('div', { className: 'mc-wb mc-wb-inline mc-wb-tab-page', 'aria-label': t('wb.title') }, head, shell);
			}
			return h('div', { className: 'mc-wb', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('wb.title') },
				h('div', { className: 'mc-wb-mask', onClick: close, 'aria-hidden': 'true' }),
				h('div', { className: 'mc-wb-box' }, head, shell));
		}

		/* PDF 导入：把文件读成 base64 交给主进程解析，前端不碰 pdfjs。 */
		function readFileBase64(file) {
			return new Promise((resolve, reject) => {
				const reader = new FileReader();
				reader.onload = () => {
					const text = String(reader.result || '');
					const comma = text.indexOf(',');
					resolve(comma >= 0 ? text.slice(comma + 1) : '');
				};
				reader.onerror = () => reject(new Error('READ_FAILED'));
				reader.readAsDataURL(file);
			});
		}

		function pdfCodeText(t, code) {
			const raw = String(code || '');
			if (raw === 'PDF_NO_TEXT') return t('wb.pdfNoText');
			if (raw === 'PDF_ENCRYPTED') return t('wb.pdfEncrypted');
			if (raw === 'PDF_TOO_LARGE' || raw === 'BODY_TOO_LARGE') return t('wb.pdfTooLarge');
			if (raw === 'PDF_NOT_CACHED') return t('wb.pdfNotCached');
			return t('wb.pdfParseFailed');
		}

		function dayText(ms) {
			const stamp = Number(ms) || 0;
			return stamp ? new Date(stamp).toLocaleDateString() : '';
		}

		/* 工作台整页：资料库（导入 / 继续阅读 / 移除）与全文+中文解读两栏阅读器。 */
		function WorkbenchPane(props) {
			const { t } = props;
			const panelState = useStore();
			const slice = panelState.paper || {};
			const library = slice.items || {};
			const openId = String(slice.open || '');
			const active = openId && library[openId] ? library[openId] : null;
			const inputRef = useRef(null);
			const [busy, setBusy] = useState(false);
			const [notice, setNotice] = useState('');
			const rows = Object.keys(library)
				.map((key) => library[key])
				.filter((cell) => cell && cell.id)
				.sort((left, right) => (Number(right.openedAt || right.at) || 0) - (Number(left.openedAt || left.at) || 0));

			const openEntry = (id) => {
				const target = String(id || '');
				if (!target) return;
				setNotice('');
				patchPaper(target, { openedAt: Date.now() }, { open: target, tab: 'guide' });
			};

			const removeEntry = (id) => {
				const target = String(id || '');
				if (!target) return;
				paperTexts.delete(target);
				updateWith((current) => {
					const base = current.paper || {};
					const items = { ...(base.items || {}) };
					delete items[target];
					return { ...current, paper: normalizePaperState({ ...base, items, open: base.open === target ? '' : base.open }) };
				});
				setNotice(t('wb.libRemoved'));
			};

			const importFiles = async (list) => {
				const files = Array.prototype.slice.call(list || []).slice(0, WB_IMPORT_FILES_MAX);
				if (files.length === 0) return;
				setBusy(true);
				setNotice('');
				let done = 0;
				const skipped = [];
				for (const file of files) {
					if (Number(file.size) > WB_IMPORT_BYTES_MAX) {
						skipped.push(t('wb.pdfTooLarge'));
						continue;
					}
					let payload = null;
					try {
						const data = await readFileBase64(file);
						const res = await fetch(WB_PDF_ROUTE, {
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({ name: String(file.name || ''), size: Number(file.size) || 0, data }),
						});
						payload = await res.json().catch(() => null);
					} catch (error) {
						skipped.push(messageOf(error));
						continue;
					}
					if (!payload || payload.ok !== true) {
						skipped.push(pdfCodeText(t, payload && payload.error));
						continue;
					}
					paperTexts.set(payload.id, payload);
					await patchPaper(payload.id, {
						kind: 'pdf',
						title: String(payload.title || ''),
						url: '',
						at: Date.now(),
						openedAt: Date.now(),
					}, { open: payload.id, tab: 'guide' });
					done += 1;
				}
				if (inputRef.current) inputRef.current.value = '';
				setBusy(false);
				const parts = [];
				if (done > 0) parts.push(format(t('wb.importDone'), { n: done }));
				if (skipped.length > 0) parts.push(format(t('wb.importSkipped'), { n: skipped.length, reason: skipped[0] }));
				setNotice(parts.join(' · '));
			};

			if (active) {
				return h(PaperWorkbench, {
					key: 'wb-page-' + active.id,
					t,
					paper: active,
					page: true,
					onClose: () => closePaper(active.id),
				});
			}

			const row = (cell) => h('div', { key: cell.id, className: 'mc-wb-lib-row' },
				h('div', { className: 'mc-wb-lib-main' },
					h('div', { className: 'mc-wb-lib-title', title: String(cell.title || '') }, cell.title || t('wb.untitled')),
					h('div', { className: 'mc-wb-lib-meta' },
						h('span', { className: 'mc-wb-chip' }, cell.kind === 'pdf' ? t('wb.kindPdf') : t('wb.kindArxiv')),
						cell.ccf ? h('span', { className: 'mc-ccf-badge', 'data-level': cell.ccf }, 'CCF-' + cell.ccf) : null,
						cell.venue ? h('span', { className: 'mc-wb-lib-venue', title: String(cell.venue) }, cell.venue) : null,
						dayText(cell.openedAt || cell.at) ? h('span', { className: 'mc-wb-lib-time' }, dayText(cell.openedAt || cell.at)) : null)),
				h('div', { className: 'mc-wb-lib-acts' },
					h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-wb-lib-open', onClick: () => openEntry(cell.id) }, t('wb.libOpen')),
					h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-btn-danger mc-wb-lib-remove', onClick: () => removeEntry(cell.id) }, t('wb.libRemove'))));

			return h('div', { className: 'mc-wb-lib-page' },
				h('div', { className: 'mc-wb-lib-head' },
					h('div', null,
						h('strong', { className: 'mc-wb-lib-h' }, t('wb.libTitle')),
						h('div', { className: 'mc-muted' }, t('wb.libHint'))),
					h('div', { className: 'mc-spacer' }),
					h('button', {
						type: 'button',
						className: 'mc-btn mc-btn-primary mc-wb-import',
						disabled: busy,
						onClick: () => inputRef.current && inputRef.current.click(),
					}, ICON_PLUS, busy ? t('wb.importing') : t('wb.import')),
					h('input', {
						ref: inputRef,
						type: 'file',
						accept: 'application/pdf,.pdf',
						multiple: true,
						className: 'mc-wb-file',
						onChange: (event) => {
							const files = event.target && event.target.files;
							if (files && files.length > 0) importFiles(files);
						},
					})),
				notice ? h('div', { className: 'mc-wb-lib-notice' }, notice) : null,
				rows.length === 0
					? h('div', { className: 'mc-wb-lib-empty' }, h('div', { className: 'mc-wb-note' }, t('wb.libEmpty')))
					: h('div', { className: 'mc-wb-lib-list' }, rows.map(row)),
				h('div', { className: 'mc-wb-note mc-wb-lib-hint' }, t('wb.importHint')));
		}

		function itemUrlOf(paper, cell) {
			const text = String((paper && paper.url) || (cell && cell.url) || '');
			return text || (paper && paper.id ? 'https://arxiv.org/abs/' + paper.id : '');
		}

		function Page(props) {
			const t = makeT(props);
			const ui = props.ui || null;
			const state = useStore();
			const [tab, setTab] = useState('timetable');
			const [entryModal, setEntryModal] = useState(null);
			const [periodsModal, setPeriodsModal] = useState(null);
			const [termModal, setTermModal] = useState(null);
			const [courseModal, setCourseModal] = useState(null);
			const [taskModal, setTaskModal] = useState(null);
			const [competitionModal, setCompetitionModal] = useState(null);
			const [aiModal, setAiModal] = useState(null);
			const [lightbox, setLightbox] = useState(false);
			const [promptConfig, setPromptConfig] = useState(null);
			const [toast, setToast] = useState(null);
			const [extracting, setExtracting] = useState(false);
			const [papersBusy, setPapersBusy] = useState(false);
			const [pushBusy, setPushBusy] = useState(false);
			const pushLive = useRef({ state: null, profile: null, run: null });
			const [focusTag, setFocusTag] = useState(null);
			const [now, setNow] = useState(() => new Date());
			const promptResolve = useRef(null);
			const fileInput = useRef(null);

			useEffect(() => {
				const timer = setInterval(() => setNow(new Date()), 30000);
				return () => clearInterval(timer);
			}, []);

			const notify = useCallback((message, tone) => setToast({ message, tone: tone || 'info' }), []);
			useEffect(() => {
				if (!toast) return undefined;
				const timer = setTimeout(() => setToast(null), 4200);
				return () => clearTimeout(timer);
			}, [toast]);

			const openWorkbench = useCallback((item) => {
				if (!item) return;
				const id = arxivIdOf(item.url);
				if (!id) return;
				const venue = String(item.venue || item.journalRef || '');
				const level = paperCcfLevel({ venue, comment: item.comment, journalRef: item.journalRef });
				patchPaper(id, {
					kind: 'arxiv',
					title: String(item.title || ''),
					url: String(item.url || ''),
					venue,
					ccf: level,
					at: Date.now(),
					openedAt: Date.now(),
				}, { open: id, tab: 'guide' });
				setTab('workbench');
			}, []);

			const askPrompt = useCallback((config) => new Promise((resolve) => {
				promptResolve.current = resolve;
				setPromptConfig(config);
			}), []);
			const settlePrompt = useCallback((value) => {
				const resolve = promptResolve.current;
				promptResolve.current = null;
				setPromptConfig(null);
				if (resolve) resolve(value);
			}, []);
			const askConfirm = useCallback((config) => new Promise((resolve) => {
				promptResolve.current = resolve;
				setPromptConfig({ ...config, confirm: true });
			}), []);

			const term = activeTermOf(state);
			const totalWeeks = term ? term.weekCount : 20;
			const currentWeek = term ? weekIndexOf(term, now) : 1;
			const week = Math.min(Math.max(state.ui.weekOverride || currentWeek, 1), totalWeeks);
			const entries = term ? term.entries : [];
			const visible = useMemo(() => entries.filter((entry) => entryInWeek(entry, week)), [entries, week]);
			const hiddenCount = entries.length - visible.length;
			const courses = term ? term.courses : [];
			const tasks = term ? term.tasks : [];
			const openTasks = tasks.filter((task) => !task.done);
			const urgentTasks = openTasks.filter((task) => taskState(task, now) === 'overdue' || taskState(task, now) === 'today');

			const goWeek = useCallback((next) => {
				updateWith((current) => ({ ...current, ui: { ...current.ui, weekOverride: Math.min(Math.max(next, 1), totalWeeks) } }));
			}, [totalWeeks]);

			const goNow = useCallback(() => {
				updateWith((current) => ({ ...current, ui: { ...current.ui, weekOverride: null } }));
			}, []);

			const selectTerm = useCallback((id) => {
				updateWith((current) => ({ ...current, activeTermId: id, ui: { ...current.ui, weekOverride: null } }));
			}, []);

			const openNewEntry = useCallback((day, periodId) => {
				setEntryModal({
					id: null,
					kind: 'course',
					day: typeof day === 'number' ? day : 0,
					periodIds: periodId ? [periodId] : [],
					weeks: { start: 1, end: totalWeeks, parity: 'all' },
				});
			}, [totalWeeks]);

			const saveEntry = useCallback((draft) => {
				updateWith((current) => {
					const target = activeTermOf(current);
					if (!target) return current;
					const list = target.entries;
					const nextList = entryModal && entryModal.id
						? list.map((entry) => (entry.id === entryModal.id ? { ...entry, ...draft } : entry))
						: list.concat([{ id: uid(), ...draft }]);
					return {
						...current,
						terms: current.terms.map((item) => (item.id === target.id ? withCourses({ ...item, entries: nextList }) : item)),
					};
				});
				setEntryModal(null);
			}, [entryModal]);

			const deleteEntry = useCallback(async () => {
				if (!entryModal || !entryModal.id) return;
				const ok = await askConfirm({ title: t('delete'), message: t('entry.delete.confirm'), danger: true });
				if (!ok) return;
				updateWith((current) => ({
					...current,
					terms: current.terms.map((item) => (item.id === (activeTermOf(current) || {}).id
						? { ...item, entries: item.entries.filter((entry) => entry.id !== entryModal.id) }
						: item)),
				}));
				setEntryModal(null);
			}, [entryModal, askConfirm, t]);

			const savePeriods = useCallback((rows) => {
				const periods = rows.map((row, index) => ({
					id: row.id || 'p' + (index + 1),
					label: String(row.label || '第' + (index + 1) + '节').trim(),
					start: String(row.start || '').trim(),
					end: String(row.end || '').trim(),
				}));
				const known = new Set(periods.map((period) => period.id));
				updateWith((current) => ({
					...current,
					periods,
					terms: current.terms.map((item) => ({
						...item,
						entries: item.entries
							.map((entry) => ({ ...entry, periodIds: entry.periodIds.filter((id) => known.has(id)) }))
							.filter((entry) => entry.periodIds.length > 0),
					})),
				}));
				setPeriodsModal(null);
			}, []);

			const applyImported = useCallback((imported, replace) => {
				updateWith((current) => {
					const target = activeTermOf(current);
					if (!target) return current;
					const prepared = imported.map((entry) => ({
						...entry,
						weeks: entry.weeks || { start: 1, end: target.weekCount, parity: 'all' },
					}));
					const nextList = replace ? prepared : target.entries.concat(prepared);
					return {
						...current,
						terms: current.terms.map((item) => (item.id === target.id ? withCourses({ ...item, entries: nextList }) : item)),
					};
				});
				setAiModal(null);
				notify(format(t('ai.done'), { count: imported.length }));
			}, [notify, t]);

			const extractFromImage = useCallback(async (image) => {
				setExtracting(true);
				try {
					const text = await requestExtraction(image.dataUrl);
					const imported = parseTimetable(text, state.periods);
					updateWith((current) => {
						const target = activeTermOf(current);
						if (!target) return current;
						const prepared = imported.map((entry) => ({ ...entry, weeks: { start: 1, end: target.weekCount, parity: 'all' } }));
						return {
							...current,
							terms: current.terms.map((item) => (item.id === target.id ? withCourses({ ...item, entries: prepared }) : item)),
						};
					});
					notify(format(t('extract.done'), { count: imported.length }));
					return true;
				} catch (failed) {
					const code = failed && failed.code ? String(failed.code) : '';
					if (code === 'MODEL_NO_VISION') notify(t('extract.noVision'), 'error');
					else if (code === 'NO_SERVICES') notify(t('extract.noServices'), 'error');
					else if (code === 'HTTP 404') notify(t('extract.unavailable'), 'error');
					else notify(format(t('extract.failed'), { message: messageOf(failed) }), 'error');
					setAiModal({ error: code ? format(t('extract.failed'), { message: code }) : '' });
					return false;
				} finally {
					setExtracting(false);
				}
			}, [state.periods, notify, t]);

			const importImage = useCallback(async (file) => {
				if (!file) return;
				try {
					const image = await readImageFile(file);
					update({ image });
					notify(t('image.imported'));
					await extractFromImage(image);
				} catch (failed) {
					notify(t('image.failed'), 'error');
				}
			}, [extractFromImage, notify, t]);

			const exportJson = useCallback(() => {
				try {
					const blob = new Blob([JSON.stringify(exportPayload(state, term), null, 2)], { type: 'application/json' });
					const url = URL.createObjectURL(blob);
					const anchor = document.createElement('a');
					anchor.href = url;
					anchor.download = 'my-courses-timetable.json';
					document.body.appendChild(anchor);
					anchor.click();
					document.body.removeChild(anchor);
					setTimeout(() => URL.revokeObjectURL(url), 1000);
				} catch (failed) {
					notify(messageOf(failed), 'error');
				}
			}, [state, term, notify]);

			const clearTimetable = useCallback(async () => {
				const ok = await askConfirm({ title: t('clear'), message: t('clear.confirm'), danger: true });
				if (!ok) return;
				updateWith((current) => ({
					...current,
					terms: current.terms.map((item) => (item.id === (activeTermOf(current) || {}).id ? { ...item, entries: [] } : item)),
				}));
			}, [askConfirm, t]);

			const saveTerm = useCallback((draft) => {
				updateWith((current) => {
					if (termModal && termModal.id) {
						return {
							...current,
							terms: current.terms.map((item) => (item.id === termModal.id
								? { ...item, name: draft.name, startDate: draft.startDate, weekCount: draft.weekCount }
								: item)),
						};
					}
					const created = { id: uid(), name: draft.name, startDate: draft.startDate, weekCount: draft.weekCount, entries: [], courses: [], tasks: [] };
					return {
						...current,
						terms: current.terms.concat([created]),
						activeTermId: created.id,
						ui: { ...current.ui, weekOverride: null },
					};
				});
				setTermModal(null);
			}, [termModal]);

			const deleteTerm = useCallback(async () => {
				if (!termModal || !termModal.id) return;
				if (state.terms.length <= 1) {
					notify(t('term.needOne'), 'error');
					return;
				}
				const ok = await askConfirm({ title: t('term.delete'), message: format(t('term.delete.confirm'), { name: termModal.name }), danger: true });
				if (!ok) return;
				updateWith((current) => {
					const remaining = current.terms.filter((item) => item.id !== termModal.id);
					return {
						...current,
						terms: remaining,
						activeTermId: current.activeTermId === termModal.id ? remaining[0].id : current.activeTermId,
						ui: { ...current.ui, weekOverride: null },
					};
				});
				setTermModal(null);
			}, [termModal, state.terms.length, askConfirm, notify, t]);

			const saveCourse = useCallback((draft) => {
				updateWith((current) => {
					const target = activeTermOf(current);
					if (!target || !courseModal) return current;
					return {
						...current,
						terms: current.terms.map((item) => (item.id === target.id
							? { ...item, courses: item.courses.map((course) => (course.id === courseModal.id ? { ...course, ...draft } : course)) }
							: item)),
					};
				});
				setCourseModal(null);
			}, [courseModal]);

			const newTask = useCallback((course) => {
				setTaskModal({
					id: null,
					title: '',
					courseName: course && course.name ? course.name : '',
					due: '',
					note: '',
				});
			}, []);

			const saveTask = useCallback((draft) => {
				updateWith((current) => {
					const target = activeTermOf(current);
					if (!target) return current;
					const nextTasks = taskModal && taskModal.id
						? target.tasks.map((task) => (task.id === taskModal.id ? { ...task, ...draft } : task))
						: target.tasks.concat([{ id: uid(), done: false, ...draft }]);
					return {
						...current,
						terms: current.terms.map((item) => (item.id === target.id ? { ...item, tasks: nextTasks } : item)),
					};
				});
				setTaskModal(null);
			}, [taskModal]);

			const toggleTask = useCallback((task) => {
				updateWith((current) => {
					const target = activeTermOf(current);
					if (!target) return current;
					return {
						...current,
						terms: current.terms.map((item) => (item.id === target.id
							? { ...item, tasks: item.tasks.map((row) => (row.id === task.id ? { ...row, done: !row.done } : row)) }
							: item)),
					};
				});
			}, []);

			const deleteTask = useCallback(async (task) => {
				const ok = await askConfirm({ title: t('delete'), message: task.title, danger: true });
				if (!ok) return;
				updateWith((current) => {
					const target = activeTermOf(current);
					if (!target) return current;
					return {
						...current,
						terms: current.terms.map((item) => (item.id === target.id ? { ...item, tasks: item.tasks.filter((row) => row.id !== task.id) } : item)),
					};
				});
				setTaskModal(null);
			}, [askConfirm, t]);

			const openCourseFiles = useCallback((course) => {
				setFocusTag(course.name);
				setTab('files');
			}, []);

			const toggleDirection = useCallback((code) => {
				const selected = state.profile.directions || [];
				const next = selected.indexOf(code) >= 0 ? selected.filter((item) => item !== code) : selected.concat([code]);
				if (next.length === 0) {
					notify(format(t('profile.limit'), { count: 1 }), 'error');
					return;
				}
				setDirections(next);
			}, [state.profile.directions, notify, t]);

			const setKeywords = useCallback((value) => {
				updateWith((current) => ({ ...current, research: { ...current.research, keywords: String(value || '') } }));
			}, []);

			const refreshPapers = useCallback(async (keywordDraft) => {
				const research = state.research;
				const directions = research.directions || [];
				const keywords = typeof keywordDraft === 'string' ? keywordDraft.trim() : research.keywords || '';
				if (directions.length === 0 && !keywords) {
					notify(t('paper.needFilter'), 'error');
					return;
				}
				setPapersBusy(true);
				try {
					const params = new URLSearchParams({ cats: directions.join(','), q: keywords, max: '20' });
					const response = await fetch('/my-courses/papers?' + params.toString());
					if (!response.ok) throw new Error('HTTP ' + response.status);
					const payload = await response.json();
					if (!payload || payload.ok !== true) throw new Error(payload && payload.error ? String(payload.error) : 'FAILED');
					const items = Array.isArray(payload.items) ? payload.items : [];
					updateWith((current) => ({
						...current,
						research: { ...current.research, keywords, items, fetchedAt: Date.now() },
					}));
					notify(format(t('paper.done'), { count: items.length }));
				} catch (failed) {
					notify(format(t('paper.failed'), { message: messageOf(failed) }), 'error');
				} finally {
					setPapersBusy(false);
				}
			}, [state.research, notify, t]);

			/* 推送：一次只在「今天还没跑过」时读取三个免密来源，统一成 PushItem 后确定性排序。 */
			const runPush = useCallback(async (manual, only) => {
				const profile = state.profile;
				const push = state.push;
				if (!profile || !profile.updatedAt) return;
				/* §2.2：only 给定时只重跑这些源（失败源重试），否则三源全跑。 */
				const scope = Array.isArray(only) && only.length > 0
					? SOURCE_KEYS.filter((kind) => only.indexOf(kind) >= 0)
					: SOURCE_KEYS.slice();
				const scoped = scope.length !== SOURCE_KEYS.length;
				if (scope.length === 0) return;
				const stamp = new Date();
				const nowMs = stamp.getTime();
				const rolledBack = push.lastRunAt > 0 && nowMs < push.lastRunAt - PUSH_CLOCK_SLACK_MS;
				if (!manual) {
					if (!rolledBack && push.retryAfter > nowMs) return;
					if (!rolledBack && !pushIsDue(push, stamp)) return;
				}
				if (pushLive.current.busy) return;
				pushLive.current.busy = true;
				setPushBusy(true);
				const feeds = pushDirectionFeeds(profile);
				const collected = [];
				const cells = {};
				/* 只重试失败源时，未参与本次的源沿用上一次状态（§2.2 重试语义）。 */
				const priorCells = push && push.sourceState && typeof push.sourceState === 'object' ? push.sourceState : {};
				SOURCE_KEYS.forEach((kind) => {
					const old = priorCells[kind];
					cells[kind] = scope.indexOf(kind) < 0 && old
						? { ok: Boolean(old.ok), at: Number(old.at) || 0, error: String(old.error || '') }
						: { ok: false, at: 0, error: '' };
				});
				const askFeed = async (path) => {
					const abort = new AbortController();
					const timer = setTimeout(() => abort.abort(), PUSH_FEED_TIMEOUT_MS);
					try {
						const response = await fetch(path, { signal: abort.signal });
						let payload = null;
						try { payload = await response.json(); } catch (parseError) { payload = null; }
						if (!response.ok) return { ok: false, error: 'HTTP_' + response.status, items: [] };
						if (!payload || payload.ok !== true) return { ok: false, error: String((payload && payload.error) || 'FEED_SHAPE'), items: [] };
						return { ok: true, error: '', items: Array.isArray(payload.items) ? payload.items : [] };
					} catch (failed) {
						return { ok: false, error: messageOf(failed), items: [] };
					} finally {
						clearTimeout(timer);
					}
				};
				const absorb = (kind, result, mapRow) => {
					/* §2.2：同一源可能请求多次，任一次失败即算该源失败；错误保留第一条。 */
					const prev = cells[kind];
					cells[kind] = {
						ok: (prev.at > 0 ? prev.ok : true) && Boolean(result.ok),
						at: Date.now(),
						error: result.ok ? (prev.ok ? '' : prev.error) : (prev.error || result.error),
					};
					if (!result.ok) return;
					result.items.forEach((row) => {
						const item = mapRow(row);
						if (item) collected.push(item);
					});
				};
				try {
					const paperFeeds = feeds.filter((feed) => feed.arxiv).slice(0, 6);
					const newsFeeds = feeds.slice(0, 3);
					/* §3.5：GitHub 最多 2 次 = 主方向 + 自定义方向；没有自定义时退化为前两个方向。 */
					const customFeed = feeds.filter((feed) => !feed.arxiv)[0];
					/* 主方向必须是预置方向（有 arxiv 码），否则自定义方向会把自己挤成唯一一次请求。 */
					const primaryFeed = feeds.filter((feed) => feed.arxiv)[0] || feeds[0];
					const repoFeeds = (customFeed ? [primaryFeed, customFeed] : feeds.slice(0, 2))
						.filter((feed, index, list) => Boolean(feed) && list.indexOf(feed) === index);
					const tasks = [];
					if (scope.indexOf('paper') >= 0 && (paperFeeds.length > 0 || String(profile.keywords || '').trim())) {
						tasks.push((async () => {
							const params = new URLSearchParams({
								cats: paperFeeds.map((feed) => feed.arxiv).join(','),
								q: String(profile.keywords || '').trim(),
								max: '20',
							});
							const result = await askFeed('/my-courses/papers?' + params.toString());
							absorb('paper', result, (row) => {
								const primary = String(row.primaryCategory || row.category || '');
								const codes = feeds.filter((feed) => feed.arxiv && primary && primary.indexOf(feed.arxiv) === 0).map((feed) => feed.code);
								return {
									id: 'paper:' + String(row.arxivIdBase || row.id || ''),
									source: 'paper',
									title: row.title,
									summary: row.summary,
									url: row.url,
									publishedAt: Date.parse(String(row.published || '')) || 0,
									tags: row.category ? [String(row.category)] : [],
									directions: codes,
									metrics: { hot: 0 },
								};
							});
						})());
					}
					if (scope.indexOf('news') >= 0) newsFeeds.forEach((feed) => {
						const query = String(feed.news || feed.repo || '').trim();
						if (!query) return;
						tasks.push((async () => {
							const params = new URLSearchParams({ q: query, max: '10' });
							const result = await askFeed('/my-courses/news?' + params.toString());
							absorb('news', result, (row) => ({
								id: String(row.id || ''),
								source: 'news',
								title: row.title,
								summary: row.summary,
								url: row.url,
								publishedAt: Number(row.publishedAt) || 0,
								tags: [],
								directions: [feed.code],
								metrics: { hot: Number(row.hot) || 0 },
							}));
						})());
					});
					await Promise.allSettled(tasks);
					for (let index = 0; scope.indexOf('github') >= 0 && index < repoFeeds.length; index += 1) {
						const feed = repoFeeds[index];
						const query = String(feed.repo || feed.news || '').trim();
						if (!query) continue;
						const params = new URLSearchParams({ q: query, max: '10' });
						const result = await askFeed('/my-courses/repos?' + params.toString());
						absorb('github', result, (row) => ({
							id: String(row.id || ''),
							source: 'github',
							title: row.title,
							summary: row.summary,
							url: row.url,
							publishedAt: Number(row.publishedAt) || 0,
							tags: Array.isArray(row.tags) ? row.tags.slice(0, 4) : [],
							directions: [feed.code],
							metrics: { hot: Number(row.hot) || 0 },
						}));
						if (index < repoFeeds.length - 1) await new Promise((resolve) => setTimeout(resolve, PUSH_REPO_GAP_MS));
					}
					const attempted = scope.filter((kind) => cells[kind].at > 0);
					const failedKinds = attempted.filter((kind) => !cells[kind].ok);
					const okKinds = attempted.filter((kind) => cells[kind].ok);
					/* 整轮三源全灭才算「全失败」；只重试失败源时不算。 */
					const allFailed = !scoped && attempted.length > 0 && okKinds.length === 0;
					const untouched = attempted.length === 0 || okKinds.length === 0;
					const previous = Array.isArray(push.items) ? push.items : [];
					/* 只替换「本轮确实刷新成功」的源的条目；失败源与未参与的源保留上一轮（§2.2 / §5.5）。 */
					const retained = previous.filter((item) => item && okKinds.indexOf(item.source) < 0);
					const ranked = rankPushItems(retained.concat(collected), profile, stamp);
					const day = pushDayOf(stamp);
					const sourceNames = failedKinds.map((kind) => t('push.source.' + kind)).join(' / ');
					updateWith((current) => ({
						...current,
						push: {
							...current.push,
							/* 验收硬点：失败不落 lastRunDay，只有本轮没有失败源才推进「今天已跑」。 */
							lastRunDay: failedKinds.length > 0 || okKinds.length === 0 ? current.push.lastRunDay : day,
							lastRunAt: Date.now(),
							retryAfter: failedKinds.length > 0 ? Date.now() + PUSH_RETRY_MS : 0,
							/* 全失败时清单原样不动（§5.5：不能被清空，分值/顺序也不改写）。 */
							items: untouched ? previous : ranked,
							sourceState: { ...(current.push.sourceState || {}), ...cells },
							lastError: allFailed ? 'ALL_SOURCES_FAILED' : '',
						},
					}));
					if (allFailed) notify(format(t('push.failed'), { error: t('push.allFailed') }), 'error');
					else if (failedKinds.length > 0) notify(format(t('push.partial'), { count: ranked.length, source: sourceNames }), 'error');
					else if (manual) notify(format(t('push.done'), { count: ranked.length }));
				} catch (failed) {
					/* §2.2：合并/渲染异常不得冒泡成 unhandled rejection；错误落到 lastError 供页面展示。 */
					const reason = messageOf(failed) || 'PUSH_FAILED';
					updateWith((current) => ({ ...current, push: { ...current.push, lastError: reason } }));
					notify(format(t('push.failed'), { error: reason }), 'error');
				} finally {
					pushLive.current.busy = false;
					setPushBusy(false);
				}
			}, [state.profile, state.push, notify, t]);

			pushLive.current.run = runPush;

			useEffect(() => {
				const timer = setInterval(() => {
					void pushLive.current.run(false).catch(() => {});
				}, 30000);
				return () => clearInterval(timer);
			}, []);

			useEffect(() => {
				void pushLive.current.run(false).catch(() => {});
			}, []);

			useEffect(() => {
				/* 画像第一次保存（updatedAt 从 0 变为时间戳）后立刻跑一次，不等 30s 心跳（验收 10.2 #3）。 */
				if (state.profile.updatedAt > 0 && pushLive.current.run) void pushLive.current.run(false).catch(() => {});
			}, [state.profile.updatedAt]);

			const markPushSeen = useCallback(() => {
				updateWith((current) => {
					const seen = (Array.isArray(current.push.seenIds) ? current.push.seenIds : []).slice();
					(current.push.items || []).forEach((item) => {
						if (item && seen.indexOf(item.id) < 0) seen.push(item.id);
					});
					return { ...current, push: { ...current.push, seenIds: seen.slice(Math.max(0, seen.length - PUSH_SEEN_MAX)) } };
				});
			}, []);

			const applyPushProfile = useCallback((draft) => {
				/* 写盘失败时 updatedAt 仍是 0，不能谎报「已保存」让用户以为推送会开始。 */
				if (saveProfile(draft) === false) notify(t('profile.failed'), 'error');
				else notify(t('profile.saved'));
			}, [notify, t]);

			const toggleSave = useCallback((item) => {
				updateWith((current) => {
					const saved = current.research.saved || [];
					const exists = saved.some((entry) => entry.id === item.id);
					return {
						...current,
						research: { ...current.research, saved: exists ? saved.filter((entry) => entry.id !== item.id) : saved.concat([item]) },
					};
				});
			}, []);

			const saveCompetition = useCallback((draft) => {
				updateWith((current) => {
					const list = current.competitions || [];
					const next = competitionModal && competitionModal.id
						? list.map((item) => (item.id === competitionModal.id ? { ...item, ...draft } : item))
						: list.concat([{ id: uid(), ...draft }]);
					return { ...current, competitions: next };
				});
				setCompetitionModal(null);
			}, [competitionModal]);

			const deleteCompetition = useCallback(async (item) => {
				const ok = await askConfirm({ title: t('delete'), message: item.name, danger: true });
				if (!ok) return;
				updateWith((current) => ({ ...current, competitions: (current.competitions || []).filter((row) => row.id !== item.id) }));
				setCompetitionModal(null);
			}, [askConfirm, t]);

			const saveFolder = useCallback((draft) => {
				updateWith((current) => {
					const list = current.competitionFolders || [];
					if (draft.id) {
						return { ...current, competitionFolders: list.map((folder) => (folder.id === draft.id ? { ...folder, name: draft.name } : folder)) };
					}
					const maxOrder = list.reduce((acc, folder) => (folder.order > acc ? folder.order : acc), -1);
					const created = { id: uid(), name: draft.name, order: maxOrder + 1, createdAt: Date.now(), plan: { items: [], timeline: [] } };
					return { ...current, competitionFolders: list.concat([created]) };
				});
			}, []);

			const deleteFolder = useCallback(async (folder) => {
				const count = (state.competitions || []).filter((item) => item.folderId === folder.id).length;
				const ok = await askConfirm({
					title: t('delete'),
					message: format(t('competition.folder.deleteConfirm'), { name: folder.name, count }),
					danger: true,
				});
				if (!ok) return;
				updateWith((current) => {
					const kept = (current.competitionFolders || []).filter((row) => row.id !== folder.id);
					const renumbered = kept.slice().sort(byFolder).map((row, index) => ({ ...row, order: index }));
					return {
						...current,
						competitionFolders: renumbered,
						competitions: (current.competitions || []).map((item) => (item.folderId === folder.id ? { ...item, folderId: '' } : item)),
					};
				});
			}, [askConfirm, t, state.competitions]);

			const reorderFolder = useCallback((id, delta) => {
				updateWith((current) => {
					const list = (current.competitionFolders || []).slice().sort(byFolder);
					const from = list.findIndex((folder) => folder.id === id);
					const to = from + delta;
					if (from < 0 || to < 0 || to >= list.length) return current;
					const moved = list.slice();
					const [item] = moved.splice(from, 1);
					moved.splice(to, 0, item);
					return { ...current, competitionFolders: moved.map((folder, index) => ({ ...folder, order: index })) };
				});
			}, []);

			const editPlan = useCallback((folderId, producer) => {
				updateWith((current) => ({
					...current,
					competitionFolders: (current.competitionFolders || []).map((folder) => (folder.id === folderId
						? { ...folder, plan: producer(folder.plan || { items: [], timeline: [] }) }
						: folder)),
				}));
			}, []);

			const addPlanItem = useCallback((folderId, text) => {
				editPlan(folderId, (plan) => ({ ...plan, items: plan.items.concat([{ id: uid(), text, done: false, createdAt: Date.now() }]).slice(0, PLAN_ITEM_MAX) }));
			}, [editPlan]);

			const updatePlanItem = useCallback((folderId, item, text) => {
				const next = String(text || '').trim();
				if (!next) return;
				editPlan(folderId, (plan) => ({ ...plan, items: plan.items.map((row) => (row.id === item.id ? { ...row, text: next } : row)) }));
			}, [editPlan]);

			const togglePlanItem = useCallback((folderId, item) => {
				editPlan(folderId, (plan) => ({ ...plan, items: plan.items.map((row) => (row.id === item.id ? { ...row, done: !row.done } : row)) }));
			}, [editPlan]);

			const deletePlanItem = useCallback((folderId, item) => {
				editPlan(folderId, (plan) => ({ ...plan, items: plan.items.filter((row) => row.id !== item.id) }));
			}, [editPlan]);

			const addTimeline = useCallback((folderId, title, date, kind) => {
				editPlan(folderId, (plan) => ({
					...plan,
					timeline: plan.timeline.concat([{ id: uid(), kind: kind || 'step', title, date: date || '', done: false, competitionId: '', createdAt: Date.now() }]).slice(0, PLAN_TIMELINE_MAX),
				}));
			}, [editPlan]);

			const updateTimeline = useCallback((folderId, entry, patch) => {
				const title = String((patch && patch.title) || '').trim();
				if (!title) return;
				const kind = TIMELINE_KINDS.indexOf(patch && patch.kind) >= 0 ? patch.kind : entry.kind;
				const date = dateOfText(String((patch && patch.date) || '')) ? String(patch.date) : '';
				editPlan(folderId, (plan) => ({
					...plan,
					timeline: plan.timeline.map((row) => (row.id === entry.id ? { ...row, title, kind, date } : row)),
				}));
			}, [editPlan]);

			const toggleTimeline = useCallback((folderId, entry) => {
				editPlan(folderId, (plan) => ({ ...plan, timeline: plan.timeline.map((row) => (row.id === entry.id ? { ...row, done: !row.done } : row)) }));
			}, [editPlan]);

			const deleteTimeline = useCallback((folderId, entry) => {
				editPlan(folderId, (plan) => ({ ...plan, timeline: plan.timeline.filter((row) => row.id !== entry.id) }));
			}, [editPlan]);

			const pushUnread = pushUnreadCount(state.push);

			const filePicker = h('input', {
				ref: fileInput,
				type: 'file',
				accept: 'image/*',
				style: { display: 'none' },
				onChange: (event) => {
					const file = event.target.files && event.target.files[0];
					event.target.value = '';
					if (file) importImage(file);
				},
			});

			const header = h('div', { className: 'mc-head' },
				h('h1', null, t('title')),
				h('div', { className: 'mc-row' },
					h('select', {
						className: 'mc-input mc-select',
						value: term ? term.id : '',
						'aria-label': t('term.select'),
						onChange: (event) => selectTerm(event.target.value),
					}, state.terms.map((item) => h('option', { key: item.id, value: item.id }, item.name))),
					h('button', {
						type: 'button',
						className: 'mc-btn mc-btn-sm',
						onClick: () => setTermModal(term ? { id: term.id, name: term.name, startDate: term.startDate, weekCount: term.weekCount } : { id: null, name: '', startDate: isoDate(mondayOf(new Date())), weekCount: 20 }),
					}, t('term.edit')),
					h('button', {
						type: 'button',
						className: 'mc-btn mc-btn-sm',
						onClick: () => setTermModal({ id: null, name: '', startDate: isoDate(mondayOf(new Date())), weekCount: 20 }),
					}, t('term.new'))));

			const summary = h('div', { className: 'mc-summary', style: { marginBottom: '10px' } },
				h('span', null, format(t('courses.total'), { count: entries.length })),
				h('span', null, format(t('course.total'), { count: courses.length })),
				h('span', null, format(t('folders.total'), { count: state.tags.reduce((sum, tag) => sum + tag.folders.length, 0) })),
				term ? h('span', null, format(t('term.range'), { start: term.startDate, weeks: term.weekCount })) : null);

			const tabs = h('div', { className: 'mc-tabs', role: 'tablist' },
				h('button', { type: 'button', role: 'tab', className: 'mc-tab', 'aria-selected': tab === 'timetable', onClick: () => setTab('timetable') }, t('tab.timetable')),
				h('button', { type: 'button', role: 'tab', className: 'mc-tab', 'aria-selected': tab === 'courses', onClick: () => setTab('courses') }, t('course.tab')),
				h('button', { type: 'button', role: 'tab', className: 'mc-tab', 'aria-selected': tab === 'tasks', onClick: () => setTab('tasks') }, urgentTasks.length > 0 ? t('task.tab') + ' (' + urgentTasks.length + ')' : t('task.tab')),
				h('button', { type: 'button', role: 'tab', className: 'mc-tab', 'aria-selected': tab === 'papers', onClick: () => setTab('papers') }, t('paper.tab')),
				h('button', { type: 'button', role: 'tab', className: 'mc-tab', 'aria-selected': tab === 'competitions', onClick: () => setTab('competitions') }, t('competition.tab')),
				h('button', { type: 'button', role: 'tab', className: 'mc-tab', 'aria-selected': tab === 'files', onClick: () => setTab('files') }, t('tab.files')),
				h('button', { type: 'button', role: 'tab', className: 'mc-tab', 'aria-selected': tab === 'push', onClick: () => setTab('push') }, pushUnread > 0 ? t('push.tab') + ' (' + pushUnread + ')' : t('push.tab')),
				h('button', { type: 'button', role: 'tab', className: 'mc-tab mc-tab-wb', 'aria-selected': tab === 'workbench', onClick: () => setTab('workbench') }, t('wb.tab')));

			const timetable = h('div', null,
				state.image ? h('div', { className: 'mc-card mc-imagecard' },
					h('img', { className: 'mc-thumb', src: state.image.dataUrl, alt: t('image.title'), onClick: () => setLightbox(true) }),
					h('div', { className: 'mc-imageinfo' },
						h('strong', { title: state.image.name }, state.image.name),
						h('span', { className: 'mc-muted' }, new Date(state.image.addedAt).toLocaleString()),
						h('div', { className: 'mc-row' },
							h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => setLightbox(true) }, t('image.view')),
							h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => fileInput.current && fileInput.current.click() }, t('image.replace')),
							h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => extractFromImage(state.image), disabled: extracting }, t('extract.retry')),
							h('button', { type: 'button', className: 'mc-btn mc-btn-sm mc-btn-danger', onClick: () => update({ image: null }) }, t('image.remove'))))) : null,
				h(TodayCard, { t, entries, periods: state.periods, week, now, tasks }),
				h('div', { className: 'mc-toolbar', style: { marginTop: '12px' } },
					h('button', { type: 'button', className: 'mc-btn mc-btn-primary', onClick: () => fileInput.current && fileInput.current.click(), disabled: extracting }, ICON_PLUS, t('import.image')),
					h('button', { type: 'button', className: 'mc-btn', onClick: () => openNewEntry(0, null) }, t('add.entry')),
					h('div', { className: 'mc-spacer' }),
					h('div', { className: 'mc-weeknav' },
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm', disabled: week <= 1, 'aria-label': t('week.prev'), onClick: () => goWeek(week - 1) }, '‹'),
						h('span', { className: 'mc-weeklabel' }, format(t('week.label'), { week })),
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm', disabled: week >= totalWeeks, 'aria-label': t('week.next'), onClick: () => goWeek(week + 1) }, '›'),
						week !== currentWeek
							? h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: goNow }, t('week.now'))
							: h('span', { className: 'mc-badge' }, t('week.current'))),
					h('label', { className: 'mc-row', style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } },
						h('input', {
							type: 'checkbox',
							checked: state.ui.showWeekend,
							onChange: (event) => updateWith((current) => ({ ...current, ui: { ...current.ui, showWeekend: event.target.checked } })),
						}),
						t('weekend.show')),
					h('button', { type: 'button', className: 'mc-btn', onClick: () => setPeriodsModal(state.periods.map((period) => ({ ...period }))) }, t('periods')),
					h('button', { type: 'button', className: 'mc-btn', onClick: exportJson, disabled: entries.length === 0 }, t('export')),
					h('button', { type: 'button', className: 'mc-btn', onClick: () => setAiModal({}), disabled: extracting }, t('ai.open')),
					h('button', { type: 'button', className: 'mc-btn mc-btn-danger', onClick: clearTimetable, disabled: entries.length === 0 }, t('clear'))),
				extracting ? h('div', { className: 'mc-busy' }, t('extracting')) : null,
				visible.length === 0 ? h('div', { className: 'mc-banner' }, t('grid.empty')) : null,
				h(TimetableGrid, {
					t,
					periods: state.periods,
					entries: visible,
					week,
					showWeekend: state.ui.showWeekend,
					onSlotClick: openNewEntry,
					onEntryClick: (entry) => setEntryModal({
						id: entry.id,
						kind: entry.kind,
						name: entry.name,
						room: entry.room,
						teacher: entry.teacher,
						note: entry.note,
						day: entry.day,
						periodIds: entry.periodIds.slice(),
						weeks: { ...entry.weeks },
					}),
					onEditTimes: () => setPeriodsModal(state.periods.map((period) => ({ ...period }))),
				}),
				hiddenCount > 0 ? h('div', { className: 'mc-caption', style: { marginTop: '8px' } }, format(t('week.hidden'), { count: hiddenCount })) : null,
				h('div', { className: 'mc-hint' }, t('grid.hint')));

			const coursesView = courses.length === 0
				? h('div', { className: 'mc-card', style: { textAlign: 'center', padding: '36px 16px', color: 'var(--dsw-alias-label-tertiary)' } },
					h('p', { style: { margin: 0, fontSize: '13px' } }, t('course.empty')))
				: h('div', null, courses.map((course) => h(CourseCard, {
					key: course.id,
					t,
					course,
					entries,
					tasks: tasks.filter((task) => task.courseName === course.name),
					periods: state.periods,
					week,
					now,
					folders: (state.tags.find((tag) => tag.name === course.name) || { folders: [] }).folders,
					notify,
					onEdit: setCourseModal,
					onAddTask: newTask,
					onToggleTask: toggleTask,
					onEditTask: setTaskModal,
					onDeleteTask: deleteTask,
					onOpenFiles: openCourseFiles,
				})));

			const tasksView = h(TasksPane, {
				t,
				tasks,
				courses,
				now,
				onNew: newTask,
				onToggle: toggleTask,
				onEdit: setTaskModal,
				onDelete: deleteTask,
			});

			const papersView = h(PapersPane, {
				t,
				research: state.research,
				busy: papersBusy,
				onRefresh: refreshPapers,
				onToggleDirection: toggleDirection,
				onKeywords: setKeywords,
				onToggleSave: toggleSave,
				onOpenWorkbench: openWorkbench,
			});

			const workbenchView = h(WorkbenchPane, { t });

			const competitionsView = h(CompetitionsPane, {
				t,
				competitions: state.competitions,
				folders: state.competitionFolders,
				now,
				onNew: (folderId) => setCompetitionModal({ id: null, name: '', level: COMPETITION_LEVELS[0], status: COMPETITION_STATUS[0], folderId: folderId || '', deadline: '', link: '', note: '' }),
				onEdit: setCompetitionModal,
				onDelete: deleteCompetition,
				onSaveFolder: saveFolder,
				onDeleteFolder: deleteFolder,
				onReorderFolder: reorderFolder,
				planProps: {
					onAddItem: addPlanItem,
					onUpdateItem: updatePlanItem,
					onToggleItem: togglePlanItem,
					onDeleteItem: deletePlanItem,
					onAddTimeline: addTimeline,
					onUpdateTimeline: updateTimeline,
					onToggleTimeline: toggleTimeline,
					onDeleteTimeline: deleteTimeline,
				},
			});

			const files = h(FilesWorkbench, { t, ui, notify, askPrompt, askConfirm, focusTag });

			const pushView = h(PushPane, {
				t,
				push: state.push,
				profile: state.profile,
				busy: pushBusy,
				now,
				onRefresh: () => runPush(true),
				onRetry: (kinds) => runPush(true, kinds),
				onMarkSeen: markPushSeen,
				onSaveProfile: applyPushProfile,
				onOpenPaper: openWorkbench,
			});

			const dialogs = [];
			if (entryModal) {
				dialogs.push(h(EntryDialog, {
					key: 'entry',
					t,
					value: entryModal,
					periods: state.periods,
					weekCount: totalWeeks,
					onCancel: () => setEntryModal(null),
					onSave: saveEntry,
					onDelete: entryModal.id ? deleteEntry : null,
				}));
			}
			if (periodsModal) {
				dialogs.push(h(PeriodsDialog, {
					key: 'periods',
					t,
					periods: periodsModal,
					onCancel: () => setPeriodsModal(null),
					onSave: savePeriods,
				}));
			}
			if (termModal) {
				dialogs.push(h(TermDialog, {
					key: 'term',
					t,
					value: termModal,
					onCancel: () => setTermModal(null),
					onSave: saveTerm,
					onDelete: termModal.id && state.terms.length > 1 ? deleteTerm : null,
				}));
			}
			if (courseModal) {
				dialogs.push(h(CourseDialog, {
					key: 'course',
					t,
					value: courseModal,
					onCancel: () => setCourseModal(null),
					onSave: saveCourse,
				}));
			}
			if (taskModal) {
				dialogs.push(h(TaskDialog, {
					key: 'task',
					t,
					value: taskModal,
					courses,
					onCancel: () => setTaskModal(null),
					onSave: saveTask,
					onDelete: taskModal.id ? () => deleteTask(taskModal) : null,
				}));
			}
			if (competitionModal) {
				dialogs.push(h(CompetitionDialog, {
					key: 'competition',
					t,
					value: competitionModal,
					folders: state.competitionFolders,
					onCancel: () => setCompetitionModal(null),
					onSave: saveCompetition,
				}));
			}
			if (aiModal) {
				dialogs.push(h(AiDialog, {
					key: 'ai',
					t,
					periods: state.periods,
					notify,
					initialError: aiModal.error || '',
					initialText: aiModal.text || '',
					onCancel: () => setAiModal(null),
					onImport: applyImported,
				}));
			}
			if (promptConfig) {
				dialogs.push(h(PromptDialog, {
					key: 'prompt',
					t,
					config: promptConfig,
					onCancel: () => settlePrompt(null),
					onSubmit: (value) => settlePrompt(value),
				}));
			}
			if (lightbox && state.image) {
				dialogs.push(h('div', { key: 'lightbox', className: 'mc-lightbox', onClick: () => setLightbox(false) },
					h('img', { src: state.image.dataUrl, alt: t('image.title') })));
			}

			return h('section', { className: 'mc-page', 'aria-label': t('title') },
				h('style', null, CSS),
				filePicker,
				h('div', { className: 'mc-scroll' },
					h('div', { className: 'mc-content' },
						header,
						summary,
						tabs,
						tab === 'timetable' ? timetable
							: tab === 'courses' ? coursesView
								: tab === 'tasks' ? tasksView
									: tab === 'papers' ? papersView
										: tab === 'competitions' ? competitionsView
										: tab === 'push' ? pushView
											: tab === 'workbench' ? workbenchView
												: files)),
				dialogs,
				toast ? h('div', { className: 'mc-toast', 'data-tone': toast.tone, role: 'status' }, toast.message) : null);
		}

		/* 画像卡：专业 + 方向 + 自定义方向 + 追加关键词，保存后立即成为推送的筛选条件。 */
		function ProfileCard(props) {
			const { t, profile, onSaveProfile } = props;
			const [draft, setDraft] = useState(null);
			const [customText, setCustomText] = useState('');
			const [hint, setHint] = useState('');
			const savedProfile = Boolean(profile && profile.updatedAt);
			/* 从未保存过：chips 不预选（否则用户既不能保存也不能取消，卡在引导态，§6.4）。 */
			const current = draft || (savedProfile ? profile : Object.assign({}, profile, { directions: [] }));
			const selected = Array.isArray(current.directions) ? current.directions : [];
			const custom = Array.isArray(current.custom) ? current.custom : [];
			const major = MAJOR_IDS.indexOf(current.major) >= 0 ? current.major : 'cs';
			const patch = (change) => {
				setHint('');
				setDraft({ ...current, ...change });
			};
			const toggleDirection = (code) => {
				if (selected.indexOf(code) >= 0) {
					const next = selected.filter((entry) => entry !== code);
					if (next.length === 0) return;
					patch({ directions: next });
					return;
				}
				if (selected.length >= PROFILE_DIRECTION_MAX) {
					setHint(format(t('profile.limit'), { count: PROFILE_DIRECTION_MAX }));
					return;
				}
				patch({ directions: selected.concat([code]) });
			};
			const addCustom = () => {
				const label = customText.trim().slice(0, PROFILE_LABEL_MAX);
				const slug = label.replace(/[^\w\u4e00-\u9fa5-]/g, '').slice(0, 32);
				if (!slug) return;
				const id = 'c:' + slug;
				if (custom.some((entry) => entry.id === id)) {
					setCustomText('');
					return;
				}
				if (custom.length >= PROFILE_CUSTOM_MAX) {
					setHint(format(t('profile.limit'), { count: PROFILE_CUSTOM_MAX }));
					return;
				}
				setCustomText('');
				patch({
					custom: custom.concat([{ id, label: label || slug }]),
					directions: selected.length < PROFILE_DIRECTION_MAX ? selected.concat([id]) : selected,
				});
			};
			const removeCustom = (id) => {
				patch({
					custom: custom.filter((entry) => entry.id !== id),
					directions: selected.filter((entry) => entry !== id),
				});
			};
			const chips = DIRECTION_CODES.map((code) => ({ id: code, label: t('dir.' + code) }))
				.concat(custom.map((entry) => ({ id: entry.id, label: String(entry.label || entry.id) })));
			return h('div', { className: 'mc-profile', id: 'mc-profile-card' },
				h('div', { className: 'mc-row' },
					h('div', null,
						h('strong', null, t('profile.title')),
						h('div', { className: 'mc-muted' }, t('profile.hint'))),
					h('div', { className: 'mc-spacer' }),
					draft ? h('button', {
						type: 'button',
						className: 'mc-btn mc-btn-sm',
						onClick: () => { setDraft(null); setHint(''); setCustomText(''); },
					}, t('profile.reset')) : null),
				h('div', { className: 'mc-row' },
					h('span', { className: 'mc-muted', style: { minWidth: '64px' } }, t('profile.major')),
					h('select', {
						className: 'mc-input',
						value: major,
						onChange: (event) => patch({ major: event.target.value }),
					}, MAJORS.map((entry) => h('option', { key: entry.id, value: entry.id }, t('major.' + entry.id)))),
					major === 'custom' ? h('input', {
						className: 'mc-input',
						value: String(current.majorCustom || ''),
						placeholder: t('profile.majorCustom'),
						maxLength: PROFILE_TEXT_MAX,
						onChange: (event) => patch({ majorCustom: event.target.value.slice(0, PROFILE_TEXT_MAX) }),
					}) : null),
				h('div', null,
					h('div', { className: 'mc-row' },
						h('span', { className: 'mc-muted' }, t('profile.directions')),
						h('span', { className: 'mc-muted' }, t('profile.directionsHint'))),
					h('div', { className: 'mc-profile-chips' }, chips.map((chip) => h('button', {
						key: chip.id,
						type: 'button',
						className: 'mc-profile-chip',
						'data-on': selected.indexOf(chip.id) >= 0 ? '1' : '0',
						'aria-pressed': selected.indexOf(chip.id) >= 0,
						onClick: () => toggleDirection(chip.id),
					}, chip.label, chip.id.charAt(0) === 'c'
						? h('span', { role: 'presentation', style: { marginLeft: '4px' }, onClick: (event) => { event.stopPropagation(); removeCustom(chip.id); } }, '×')
						: null)))),
				h('div', { className: 'mc-row' },
					h('span', { className: 'mc-muted', style: { minWidth: '64px' } }, t('profile.custom')),
					h('input', {
						className: 'mc-input',
						value: customText,
						placeholder: t('profile.custom'),
						maxLength: PROFILE_LABEL_MAX,
						onChange: (event) => setCustomText(event.target.value),
						onKeyDown: (event) => { if (event.key === 'Enter') addCustom(); },
					}),
					h('button', { type: 'button', className: 'mc-btn', onClick: addCustom }, t('profile.customAdd'))),
				h('div', null,
					h('div', { className: 'mc-row' },
						h('span', { className: 'mc-muted' }, t('profile.keywords')),
						h('span', { className: 'mc-muted' }, t('profile.keywordsHint'))),
					h('input', {
						className: 'mc-input',
						value: String(current.keywords || ''),
						placeholder: 'LLM agent',
						maxLength: PROFILE_KEYWORD_MAX,
						onChange: (event) => patch({ keywords: event.target.value.slice(0, PROFILE_KEYWORD_MAX) }),
					})),
				hint ? h('div', { className: 'mc-note', 'data-tone': 'info' }, hint) : null,
				h('div', { className: 'mc-row' },
					h('div', { className: 'mc-spacer' }),
					h('button', {
						type: 'button',
						className: 'mc-btn mc-btn-primary',
						disabled: !draft && savedProfile,
						onClick: () => onSaveProfile(draft),
					}, t('profile.save'))));
		}

		/* 推送面板：画像卡 + 三来源状态 + 今日条目（论文 / 新闻 / 仓库统一成一张卡）。 */
		function PushPane(props) {
			const { t, profile, busy, onRefresh, onRetry, onMarkSeen, onSaveProfile, onOpenPaper } = props;
			/* 防御：正常路径下 push 一定是对象，异常时也不能整块 TypeError（页面无 error boundary）。 */
			const push = props.push && typeof props.push === 'object' ? props.push : {};
			const items = Array.isArray(push.items) ? push.items : [];
			const unread = pushUnreadCount(push);
			const ready = Boolean(profile && profile.updatedAt);
			const describeError = (raw) => {
				const code = String(raw || '');
				if (code === 'GITHUB_RATE') return t('push.rateLimited');
				if (code === 'ALL_SOURCES_FAILED') return t('push.allFailed');
				return code;
			};
			const sourceState = push.sourceState && typeof push.sourceState === 'object' ? push.sourceState : {};
			/* §2.2：失败源在推送页顶部逐条提示，重试只重跑这些源。 */
			const failedSourceKinds = SOURCE_KEYS.filter((kind) => {
				const cell = sourceState[kind] || {};
				return cell.at > 0 && !cell.ok;
			});
			const sourceCells = SOURCE_KEYS.map((kind) => {
				const cell = sourceState[kind] || { ok: false, at: 0, error: '' };
				let text = t('push.neverRun');
				if (cell.at) {
					text = cell.ok ? format(t('push.lastRun'), { day: pushDayOf(new Date(cell.at)) }) : describeError(cell.error);
				}
				return h('div', { key: kind, className: 'mc-push-source' },
					h('span', null, t('push.source.' + kind)),
					h('span', { className: 'mc-push-src' }, text));
			});
			const cards = items.map((item) => h('div', { key: item.id, className: 'mc-push-card' },
				h('div', { className: 'mc-push-card-head' },
					h('a', {
						className: 'mc-push-title',
						href: item.url,
						target: '_blank',
						rel: 'noreferrer noopener',
						title: item.title,
					}, item.title),
					h('span', { className: 'mc-push-src', title: t('push.score') }, String(item.score))),
				h('div', { className: 'mc-push-meta' },
					h('span', null, t('push.source.' + item.source)),
					item.publishedAt > 0 ? h('span', null, new Date(item.publishedAt).toLocaleDateString()) : null,
					(item.tags || []).slice(0, 3).map((tag) => h('span', { key: tag }, tag))),
				(item.reasons || []).length > 0
					? h('div', { className: 'mc-push-reasons' }, item.reasons.map((key) => h('span', { key, className: 'mc-reason' }, t(key))))
					: null,
				item.summary
					? h('p', { style: { margin: '6px 0 0', fontSize: '12px', lineHeight: '1.55', color: 'var(--dsw-alias-label-secondary, #6b7280)' } }, item.summary)
					: null,
				item.source === 'paper' && arxivIdOf(item.url)
					? h('div', { className: 'mc-push-actions' },
						h('button', {
							type: 'button',
							className: 'mc-btn mc-btn-sm mc-wb-open',
							title: t('wb.openTitle'),
							onClick: () => (onOpenPaper ? onOpenPaper(item) : null),
						}, t('wb.open')))
					: null));
			const gotoProfile = () => {
				const node = typeof document === 'undefined' ? null : document.getElementById('mc-profile-card');
				if (node && node.scrollIntoView) node.scrollIntoView({ block: 'start', behavior: 'smooth' });
			};
			const body = !ready
				? h('div', { className: 'mc-card' },
					h('div', { className: 'mc-note', 'data-tone': 'info' }, t('push.needProfile')),
					h('div', { className: 'mc-row', style: { marginTop: '8px' } },
						h('button', { type: 'button', className: 'mc-btn mc-btn-primary', onClick: gotoProfile }, t('push.gotoProfile'))))
				: busy && items.length === 0
					? h('div', { className: 'mc-push-list' }, [0, 1, 2].map((key) => h('div', { key, className: 'mc-push-skeleton' })))
					: items.length === 0
						? h('div', { className: 'mc-card' },
							h('div', { className: 'mc-note', 'data-tone': 'info' }, t('push.empty')),
							h('div', { className: 'mc-muted', style: { marginTop: '4px' } }, t('push.emptyHint')))
						: h('div', { className: 'mc-push-list' }, cards);
			return h('div', { className: 'mc-push' },
				h(ProfileCard, { t, profile, onSaveProfile }),
				h('div', { className: 'mc-push-sources' }, sourceCells),
				h('div', { className: 'mc-card' },
					h('div', { className: 'mc-row' },
						h('div', null,
							h('strong', null, t('push.title')),
							h('div', { className: 'mc-muted' }, t('push.subtitle'))),
						h('div', { className: 'mc-spacer' }),
						unread > 0
							? h('span', { className: 'mc-push-src', 'data-mc-unread': String(unread) }, format(t('push.unread'), { count: unread }))
							: null,
						unread > 0 ? h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: onMarkSeen }, t('push.markSeen')) : null,
						h('button', {
							type: 'button',
							className: 'mc-btn mc-btn-primary',
							disabled: busy || !ready,
							onClick: onRefresh,
						}, busy ? t('push.running') : t('push.refresh')))),
				failedSourceKinds.length > 0
					? h('div', { className: 'mc-note', 'data-tone': 'error' },
						failedSourceKinds.map((kind) => h('div', { key: kind },
							format(t('push.sourceFailed'), { source: t('push.source.' + kind), error: describeError((sourceState[kind] || {}).error) }))),
						h('button', { type: 'button', className: 'mc-btn mc-btn-sm', onClick: () => onRetry(failedSourceKinds) }, t('push.retry')))
					: null,
				push.lastError
					? h('div', { className: 'mc-note', 'data-tone': 'error' }, format(t('push.failed'), { error: describeError(push.lastError) }))
					: null,
				body);
		}

		function PromptDialog(props) {
			const { t, config, onCancel, onSubmit } = props;
			const [value, setValue] = useState(config.initial || '');
			const submit = () => {
				if (config.confirm) onSubmit(true);
				else if (value.trim()) onSubmit(value.trim());
			};
			return h(Modal, {
				title: config.title,
				onClose: onCancel,
				footer: [
					h('button', { key: 'cancel', type: 'button', className: 'mc-btn', onClick: onCancel }, t('cancel')),
					h('button', { key: 'ok', type: 'button', className: 'mc-btn mc-btn-primary', onClick: submit }, config.confirm ? t('confirm') : t('save')),
				],
			},
				config.message ? h('p', { style: { margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '13px' } }, config.message) : null,
				config.confirm ? null : h('div', { className: 'mc-field' },
					h('span', null, config.label || t('prompt.name')),
					h('input', {
						className: 'mc-input',
						value,
						onChange: (event) => setValue(event.target.value),
						onKeyDown: (event) => { if (event.key === 'Enter') submit(); },
					})));
		}

		function PanelIcon({ size }) {
			const edge = typeof size === 'number' && size > 0 ? size : 16;
			const state = useStore();
			const unread = pushUnreadCount(state.push);
			const svg = h('svg', { viewBox: '0 0 24 24', width: edge, height: edge, fill: 'none', 'aria-hidden': true, style: { display: 'block' } },
				h('rect', { x: 3.4, y: 5.4, width: 17.2, height: 15.2, rx: 3.2, stroke: 'currentColor', strokeWidth: 1.6 }),
				h('path', { d: 'M3.4 10.1h17.2', stroke: 'currentColor', strokeWidth: 1.6 }),
				h('path', { d: 'M8.2 3.4v3.4M15.8 3.4v3.4', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
				h('circle', { cx: 8.5, cy: 13.9, r: 1.15, fill: 'currentColor' }),
				h('circle', { cx: 12, cy: 13.9, r: 1.15, fill: 'currentColor' }),
				h('circle', { cx: 15.5, cy: 13.9, r: 1.15, fill: 'currentColor' }),
				h('circle', { cx: 8.5, cy: 17.5, r: 1.15, fill: 'currentColor' }),
				h('circle', { cx: 12, cy: 17.5, r: 1.15, fill: 'currentColor' }));
			if (unread <= 0) return svg;
			/* 侧边栏常驻、页面 CSS 未挂载时也要可见，因此红点只用内联样式。 */
			return h('span', {
				'data-mc-dot': 'push',
				'data-mc-unread': String(unread),
				style: {
					position: 'relative',
					display: 'inline-flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: edge + 'px',
					height: edge + 'px',
				},
			}, svg, h('span', {
				'aria-hidden': true,
				style: {
					position: 'absolute',
					top: '-2px',
					right: '-4px',
					width: '8px',
					height: '8px',
					borderRadius: '50%',
					pointerEvents: 'none',
					background: 'var(--dsw-alias-state-business-primary, var(--dsw-alias-state-error-primary, #4d6bfe))',
					/* 用侧栏底色描一圈，红点压在图标上也不糊（验收 10.2 #12）。 */
				},
			}));
		}

		/* ------------------------------------------------------------------ */
		/* Registration                                                       */
		/* ------------------------------------------------------------------ */

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'my-courses: dictionaries');
			const t = ctx.locale.bind(NS);
			const ui = ctx.uiWorkspace || (typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined);
			ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
				name: 'sidebar.panellist',
				id: PANEL_ID,
				order: 15,
				locale: NS,
				label: () => t('panel'),
			}, PanelIcon));
			ctx.slots.inject('main', () => ctx.slots.register({
				name: 'main',
				key: PANEL_ID,
				locale: NS,
				inject: () => ({ ui, t }),
			}, Page));
		}

		return {
			inject: ['slots', 'locale', 'uiWorkspace'],
			apply,
		};
	},
});
