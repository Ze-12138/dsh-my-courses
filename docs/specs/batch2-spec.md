# 批次② 施工规格：竞赛「文件夹 + 学习规划」+ R2/R3 修复 + v6→v7

> 状态：architect2 / t1（第 3 次执行）。本文件是**实现者的唯一设计输入**——读到判定表就能直接写代码，不需要再问设计问题。
> 代码基线：`my-courses/client.js`（sha256 `b323431c…`，3726 行）。行号均以该基线为准，实现时若行号漂移请按函数名定位。
> 术语：**文件夹**（competition folder）只用于「竞赛归类」；与批次① 已有的 `folder.*` i18n（`filesRoot` 磁盘目录浏览器）**无关**，新增 key 一律用 `competition.folder.*` / `competition.plan.*` 前缀，避免与 `folder.browse` 那组撞车。

---

## 0. 改动点速查（锚点总表）

| # | 锚点（基线行号） | 现状 | 批次② 动作 |
| --- | --- | --- | --- |
| A1 | `client.js:722-723` | `COMPETITION_LEVELS` / `COMPETITION_STATUS` 两个枚举数组 | 不动。新增 `TIMELINE_KINDS` / `PLAN_ITEM_MAX` 等常量紧邻其后 |
| A2 | `client.js:791-803` | `normalizeCompetition`：6 字段，`id/name/level/status/deadline/link/note` | 追加第 7 字段 `folderId`；其余字段规则不动 |
| A3 | `client.js:839-901` | 顶层 `normalize()`，`version: 6`（第 879 行），`competitions` 在第 883 行映射 | `version: 7`；第 883 行改为先归一化 `competitionFolders` 再映射竞赛（顺序敏感，见 §5.3）；新增 `competitionFolders` 返回字段 |
| A4 | `client.js:910-914` | `readState()`：读 `STORAGE_KEY` 后立即 `normalize(JSON.parse(raw))` | 不动。迁移只发生在 `normalize()` 内，读路径天然覆盖 |
| A5 | `client.js:1782-1800` | `taskCountdown(task, now)`：`overdue/today/tomorrow/daysLeft/dueDate` 五种文案 | 不动。时间轴倒计时**复用同一套 key**，只新增一个包装函数（§3.2） |
| A6 | `client.js:2038-2042` | `daysUntil(deadline, now)`：`dateOfText` → `startOfDay` 差值取整 | 不动。文件夹卡片/时间轴/里程碑的「距今天数」全部经它 |
| A7 | `client.js:2061` | `const venue = item.venue \|\| (item.arxivId ? t('paper.preprint') : '');` | **R2 修复**：降级条件收窄为「无 venue **且** 无 doi 且有 arxivId」（§6.1） |
| A8 | `client.js:2064` | `venue ? h('span', { className: 'mc-paper-venue', title: t('paper.venue') }, venue) : null` | **R2 修复**：`title` 跟随文本来源，不再恒为「发表」（§6.1） |
| A9 | `client.js:1808-1809` | `const tier = task.done ? 'normal' : …`；`const countdown = taskCountdown(task, now);` | **R3 修复**：`done` 时不走 `taskCountdown`，改走 `taskDueLabel`（§6.2） |
| A10 | `client.js:1836` | `countdown ? h('span', { className: 'mc-task-due' + tone }, format(t(countdown.key), countdown.params)) : null` | **R3 修复**：保持这一行结构，仅让 `countdown` 在 `done` 时指向「已完成 · 绝对日期」 |
| A11 | `client.js:2129-2168` | `CompetitionsPane`：单层平铺列表 + 工具栏 + `competition.count` 计数 | 重写为**文件夹列表视图**（§4.1），原平铺卡片下移到「文件夹详情」视图（§4.3） |
| A12 | `client.js:2170-2200` | `CompetitionDialog`：name/level/status/deadline/link/note 六个字段 | 追加「所属文件夹」下拉（§4.4）；`onSave` draft 带 `folderId` |
| A13 | `client.js:3377-3385` | `saveCompetition`：`competitionModal.id ? map : concat` | 不动。`folderId` 随 draft 一起落库需保证 draft 一定含该键（§4.4 表单兜底） |
| A14 | `client.js:3388-3392` | `deleteCompetition`：按 id 过滤 | 不动 |
| A15 | `client.js:3545-3552` | `competitionsView` 传参 `competitions/now/onNew/onEdit/onDelete` | 追加 `folders`、`onNewFolder/onEditFolder/onDeleteFolder/onMoveCompetition` 等（§4.5） |
| A16 | `client.js:1301-1308` | 竞赛 CSS（`.mc-competition*`） | 复用不动；新增 `.mc-cf-*`（文件夹）与 `.mc-plan-*`（规划）两组类名（§4.6） |
| A17 | `client.js:270-283` / `514-527` | zh / en 竞赛字典 | 成对追加 §7 表格里的全部 key |

**锚点纪律**：新增机构函数（`normalizeCompetitionFolder` / `normalizePlan` / `milestonesOf` / `planCountdown`）放在 `normalizeCompetition` 之后（A2 下方），保持「常量 → normalize* → normalize → Store」的既有顺序。

---

## 1. 文件夹模型与竞赛归属

### 1.1 存储形态（v7 顶层新增两个键）

```js
{
  version: 7,
  competitionFolders: [ /* 见 §1.2 字段表 */ ],
  competitions: [ /* 旧 7 字段 + folderId，见 §1.3 */ ],
  periods, terms, research, activeTermId, tags, filesRoot, image, ui,   // 全部原样不动
}
```

### 1.2 `competitionFolders[]` 字段表（逐字段：类型 / 默认值 / 非法值回落 / 是否持久化）

| 字段 | 类型 | 默认值 | 非法值回落规则 | 持久化 |
| --- | --- | --- | --- | --- |
| `id` | `string` | 无 → `uid()` | 非字符串或空串 → `uid()`；**与已出现 id 重复 → 丢弃该条**（保留首次出现的，保证 §5.3 幂等） | 是 |
| `name` | `string` | `'未命名文件夹'` | 非字符串 → `String(v \|\| '')` 后 `trim()`；trim 后为空 → `'未命名文件夹'`（与 `normalizeCompetition` 的 `'未命名竞赛'` 同一风格）；**不截断长度**：超过 40 字符由 CSS `text-overflow` 处理，不在数据层裁剪 | 是 |
| `order` | `number`（非负整数） | 该文件夹在输入数组中的下标 | `Number.isFinite` 为假 / 负数 / 非整数 → 该文件夹下标；归一化末尾按 `order` 升序排序后**重编号为 0..n-1**（稠密化），保证删除中间项后不出现空洞 | 是 |
| `createdAt` | `number`（毫秒时间戳） | `Date.now()` | `Number(v)` 为 `NaN` 或 ≤0 → `Date.now()` | 是 |
| `plan` | `object` | `{ items: [], timeline: [] }` | 非对象 / `null` → 默认值；对象则按 §2.2/§2.3 逐字段归一化，**永不为 `null`** | 是 |

**排序规则（唯一实现）**：`folders.slice().sort((a,b) => a.order - b.order || a.createdAt - b.createdAt || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))`。四段比较保证**任意输入下顺序唯一确定**（幂等与快照断言依赖这一点）。

### 1.3 `competitions[].folderId` 字段

| 字段 | 类型 | 默认值 | 非法值回落 | 持久化 |
| --- | --- | --- | --- | --- |
| `folderId` | `string` | `''`（= 未分组） | 非字符串 → `''`；字符串但**不存在于归一化后的 `competitionFolders`**（悬空引用，含文件夹已删除、导入脏数据）→ `''` | 是（空串也写盘，保证形状稳定） |

其余 6 个字段规则**逐字沿用** `client.js:791-803`，不新增校验、不改 `deadline` 正则、不改默认名。

### 1.4 「未分组」的语义（关键：它是虚拟桶，不是一条记录）

- `folderId === ''` 表示未分组；`competitionFolders` 中**不存在** `id === ''` 或 `id === 'ungrouped'` 的文件夹。禁止为它造记录（否则删除/重命名/schema 都要特判）。
- 未分组只在**渲染层**合成一张卡片（§4.1），数据层永远只是一个空串。
- 未分组卡片的计数 = `competitions.filter(c => c.folderId === '').length`；为 0 时不渲染该卡片（无文件夹且无未分组竞赛 = §4.2 全局空态）。

### 1.5 删除文件夹时其内竞赛的去向（唯一正确解：降级为未分组）

`deleteFolder(folder)`：

1. 弹确认框，`message` 用 `competition.folder.deleteConfirm`，参数 `{ name, count }`（`count = 该文件夹内竞赛数`）——**必须在确认文案里说清后果**，不做静默处理。
2. 确认后一次 `updateWith`：`competitionFolders` 过滤掉该 `id`；同时 `competitions.map(c => c.folderId === id ? { ...c, folderId: '' } : c)`。
3. **竞赛数据永不删除**（`name/level/status/deadline/link/note` 原样保留），只把归属打回未分组。
4. 该文件夹的 `plan` **随之删除**（规划挂在文件夹上，文件夹没了规划无处可挂）。这是本批唯一的「随删除而丢数据」，因此必须在确认文案里点名「竞赛会移入未分组，学习规划会一并删除」。
5. 重编号 `order`（§1.2 的稠密化在下次 normalize 时自然发生；本次内存更新也应显式重排，避免 UI 抖动）。

### 1.6 竞赛跨文件夹移动

- 入口：编辑对话框的「所属文件夹」下拉（§4.4）。
- 结果：只改 `folderId`，其余字段不动；**不搬迁 plan 数据**（规划属于文件夹，不属于竞赛）。
- 未分组视为下拉里的一个选项（值为 `''`）。

---

## 2. 学习规划模型（清单 / 里程碑 / 时间线）

### 2.1 一句话结构

一个文件夹挂**一份**规划，规划里只有**两个数组**：

```js
plan = {
  items:    [ { id, text, done, createdAt } ],                    // 清单：无日期
  timeline: [ { id, kind, title, date, done, competitionId, createdAt } ], // 时间轴：有日期
}
```

三个视图 = 两个数组的三种读法：

| 视图 | 数据来源 | 语义 |
| --- | --- | --- |
| 清单 | `plan.items` 原样 | 「要做什么」的勾选列表，不排时间 |
| 时间线 | `plan.timeline` 按 `date` 升序 | 「什么时候做什么」，唯一的时间真值源 |
| 里程碑 | `milestonesOf(plan)` = `plan.timeline.filter(e => e.kind === 'milestone')` | **派生视图，零存储** |

### 2.2 `plan.items[]`（清单项）字段表

| 字段 | 类型 | 默认值 | 非法值回落 | 持久化 |
| --- | --- | --- | --- | --- |
| `id` | `string` | 无 → `uid()` | 空/非字符串 → `uid()`；重复 id 丢弃该条（保首条） | 是 |
| `text` | `string` | `''` | 非字符串 → `String(v \|\| '')`；`trim()` 后为空 → **整条丢弃**（空清单项无意义，且会让渲染出现空行） | 是 |
| `done` | `boolean` | `false` | 仅 `v === true` 为真（同 `normalizeTask` 的 `done` 口径，避免 `"true"` 字符串污染） | 是 |
| `createdAt` | `number` | `Date.now()` | `NaN`/≤0 → `Date.now()` | 是 |

`text` 长度上限：不截断（同 `note` 的现有做法）。

### 2.3 `plan.timeline[]`（时间轴条目）字段表

| 字段 | 类型 | 默认值 | 非法值回落 | 持久化 |
| --- | --- | --- | --- | --- |
| `id` | `string` | 无 → `uid()` | 空/非字符串 → `uid()`；重复 id 丢弃该条（保首条） | 是 |
| `kind` | `string` 枚举 | `'step'` | 不在 `TIMELINE_KINDS = ['milestone','step']` 内 → `'step'` | 是 |
| `title` | `string` | `''` | 同 `items.text`：trim 后为空 → **整条丢弃** | 是 |
| `date` | `string` `YYYY-MM-DD` | `''` | 不匹配 `/^\d{4}-\d{2}-\d{2}$/` 或 `dateOfText()` 解析失败 → **保留 `''`，不丢弃该条**（丢弃=用户输入凭空消失）；`''` 条目在时间线视图末尾按「未定日期」组渲染（§3.4） | 是 |
| `done` | `boolean` | `false` | 仅 `=== true` 为真 | 是 |
| `competitionId` | `string` | `''` | 非字符串 → `''`；字符串但指向的竞赛不存在 → `''`（**只降级不删条目**） | 是 |
| `createdAt` | `number` | `Date.now()` | `NaN`/≤0 → `Date.now()` | 是 |

排序：`date` 升序（`dateOfText` 为 `null` 的排最后）→ `createdAt` 升序 → `id` 字典序。同 `byDue` 的既有思路（`client.js:1797-1800`），但把 `Number.MAX_SAFE_INTEGER` 换成 `null`-last，且补两层 tiebreaker 保证顺序唯一。

### 2.4 为什么里程碑**禁止**独立存储（规格强制条款，实现者不得偏离）

**强制否定**：`plan` 上不存在 `milestones` 字段；`competitionFolders[i].plan.milestones` 不允许出现；任何「里程碑数组 + 时间轴数组」的双份设计一律视为**未按规格实现**，review 直接判 `needs_revision`。

理由（四条，按严重度）：

1. **同一件事两个日期必然漂移**。里程碑和时间轴条目描述的是同一个事件（「报名截止」「校赛答辩」）。存两份就要存两个 `date`；改一处忘另一处，界面就会显示「里程碑 11-20 · 时间线 11-22」。这是数据模型级缺陷，不是 bug 修补能兜住的。
2. **完成态会分裂**。`done` 同样要存两份：时间线勾了、里程碑没勾，同一条事件在两个视图里进度不一致，用户无法判断哪个是真的。
3. **排序/计数要写两套并保持一致**。里程碑数、进度分母、下一个里程碑日期、逾期判断——每个派生量都要在两个数组上重复实现一次，且每当排序规则调整就要改两处。
4. **迁移与幂等成本翻倍**。双份数据在 normalize 时还要做「哪份更新」的合并，合并规则本身又是一处漂移源；而单真值源下幂等性是结构性的（§5.3），不需要「谁赢」的策略。

**派生契约**（实现者照抄，签名固定）：

```js
// 里程碑 = 时间轴上 kind === 'milestone' 的条目，按时间线同一排序规则排列
function milestonesOf(plan) {
  const timeline = plan && Array.isArray(plan.timeline) ? plan.timeline : [];
  return timeline.filter((entry) => entry.kind === 'milestone').sort(byTimeline);
}
// 进度：分子分母都从同一数组来，因此天然自洽
function planProgress(plan) {
  const list = milestonesOf(plan);
  return { done: list.filter((e) => e.done).length, total: list.length };
}
```

三个视图的读法固定为：清单读 `plan.items`、时间线读 `plan.timeline`、里程碑读 `milestonesOf(plan)`。**没有第四个数据来源。**

### 2.5 兼容旧输入的 `plan.milestones`（唯一的单向入口，不是新增字段）

若某次输入里出现 `plan.milestones`（例如实现者误写了双份、或用户从别处导入），normalize **一次性**把它并入 `plan.timeline`：

- 每条补 `kind = 'milestone'`（原本有合法 `kind` 则尊重原值），`id` 缺失则 `uid()`；
- 按 §2.3 规则归一化后 concat 到 `timeline` 末尾，再按 timeline 规则排序；
- 同 `id` 与既有 timeline 条目重复 → 丢弃里程碑那份（timeline 为准）；
- **输出对象不含 `milestones` 键**。

效果：脏输入不丢数据，输出永远是单真值源；且因为输出没有该字段，第二次 normalize 不会再次触发补齐 → 幂等成立（§5.3）。

### 2.6 容量上限

- `plan.items` 最多 200 条（超出 `slice(0,200)`，保留前 200，按输入顺序）。
- `plan.timeline` 最多 200 条（同上）。
- 理由：与 `research.items` 的 `slice(0, 60)`（`client.js:785`）同一防御思路，避免 localStorage 被单次粘贴灌爆；上限不影响正常使用（200 条时间轴远超一个竞赛周期的规划量）。


## 3. 倒计时 / 时间轴：「距今天数」只允许一套算法

### 3.1 唯一算术来源

- 「距今天数」= `daysUntil(text, now)`（`client.js:2038-2042`）。**禁止**在批次② 新增任何 `Math.round((date - now)/86400000)` 之类的第二份实现；文件夹卡片、时间线、里程碑、下一里程碑提示四处都调它。
- 日期解析 = `dateOfText()` + `startOfDay()`（既有）；`isoDate()` 只用于回显。
- `now` 由上层统一传入（与 `CompetitionsPane`/`TaskRow` 现有一致），机构函数不自己 `new Date()`，否则渲染结果不可断言。

### 3.2 `planCountdown(entry, now)`（新增，20 行以内，只管时间轴条目）

```js
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
```

判定表（可直接逐行对拍）：

| `date` | `done` | `days` | `key` | 渲染示例（zh） | tone |
| --- | --- | --- | --- | --- | --- |
| `''` | 任意 | — | `plan.noDate` | 未定日期 | `''` |
| 合法 | `true` | — | `plan.doneOn` | 已完成 · 2026-11-20 | `''`（**不再出现「已逾期 N 天」**） |
| 合法 | `false` | `-3` | `competition.overdue` | 已过期 3 天 | ` mc-task-late` |
| 合法 | `false` | `0` | `task.dueToday` | 今天到期 | ` mc-task-today` |
| 合法 | `false` | `1` | `task.dueTomorrow` | 明天到期 | ` mc-task-today` |
| 合法 | `false` | `2..7` | `competition.left` | 还有 5 天 | ` mc-task-today` |
| 合法 | `false` | `>7` | `competition.left` | 还有 23 天 | `''` |

**复用而非新造**：`competition.overdue` / `competition.left` / `task.dueToday` / `task.dueTomorrow` 都是**已有** key（`client.js:182-193`、`426-437`、`273,278`），批次② 只为「未定日期」「已完成日期」新增 2 个 key（`plan.noDate`、`plan.doneOn`）。理由：同一种「距离某天还有几天」的语义在三个 tab 里必须同一种说法，否则用户要在脑内做三套换算。

### 3.3 时间线的排序与分组（渲染层，不落盘）

1. 排序：`byTimeline`（§2.3）：有日期的升序在前，`date === ''` 的排最后。
2. 分组头：仅在有日期条目之间渲染**月份**标题（`YYYY-MM`，直接由 `date.slice(0,7)` 得到，**不新造 i18n 文案**，不做本地化月名）；`date === ''` 的条目归入最后一个分组，组标题用 `plan.noDate`。
3. 里程碑视图不分月，平铺；视图头部显示 `planProgress` → `format(t('plan.progress'), { done, total })`。
4. 时间线条目右侧倒计时用 `planCountdown`；左侧圆点用 `kind` 区分（`milestone` 实心、`step` 空心），**不用新颜色 token**，实心用 `--dsw-alias-label-primary`，空心用 `border:1px solid var(--dsw-alias-label-tertiary)`。

### 3.4 与竞赛卡片的沿用关系

- 文件夹内的竞赛卡片：**原样复用** `client.js:2150-2167` 的标记结构与 `daysUntil` 判定（`state = none/over/soon/open`），只把外层容器换成文件夹详情里的列表容器（§4.3）。不重写卡片。
- 文件夹列表卡片上的「最近截止」= 该文件夹内竞赛的 `daysUntil` 最小值（无截止则显示 `competition.noDeadline`）。
- 「下一里程碑」= `milestonesOf(plan)` 中第一个 `done === false` 且 `date >= 今天` 的条目；没有则显示 `plan.noUpcoming`。

---

## 4. UI 分层、交互与空态

### 4.1 层级总览（三层，不许再多）

```
竞赛 tab
└─ L1 文件夹列表  CompetitionsPane            ← 改造 client.js:2129-2168
   ├─ 工具栏：新建文件夹 / 共 N 个文件夹 · M 项竞赛
   ├─ 文件夹卡 × N（order 序）
   └─ 未分组卡（虚拟，仅当未分组竞赛数 > 0）
      └─ 点击进入 → L2 文件夹详情  CompetitionFolderView   ← 新组件
         ├─ 面包屑：竞赛 › 文件夹名（返回 L1）
         ├─ 左/上：竞赛列表（复用 .mc-competition 卡片）+ 新建/编辑/移动/删除
         └─ 右/下：学习规划  PlanPane  ← 新组件，内含三视图 tab
            ├─ 清单   PlanItemsView    ← plan.items
            ├─ 里程碑 PlanMilestonesView ← milestonesOf(plan)（派生）
            └─ 时间线 PlanTimelineView  ← plan.timeline
```

- **视图切换状态**：`openFolderId` 用 `CompetitionsPane` 内的 `useState`（`null` = 列表层）。**不持久化**到 `state.ui`——理由：打开态属于瞬时导航，跨刷新恢复会把用户困在上次的子页面；且批次① `PapersPane.activeTag` 有同类待定项（backlog「标签选中态跨刷新策略」），两处应同批处理，不在批次② 单点引入。
- **未分组不是文件夹**：未分组视图只渲染竞赛列表，**不渲染规划区**，位置显示 `competition.folder.ungroupedPlanHint`（§4.2 E6）。理由：§1.4 未分组是空串虚拟桶，给它挂 plan 就要么造假文件夹、要么在 `plan` 上做特判分支，两者都会破坏「文件夹 ↔ 规划」的一对一契约。

### 4.2 空态（六种，逐条给 key 与 CTA）

| # | 触发条件 | 渲染 | 文案 key | CTA |
| --- | --- | --- | --- | --- |
| E1 | `folders.length === 0 && competitions.length === 0` | 居中空态卡（沿用现有 `client.js:2140-2142` 那块的样式与结构） | `competition.empty` | 「新建竞赛」+「新建文件夹」 |
| E2 | `folders.length === 0` 但 `competitions.length > 0` | 列表层只出现「未分组」卡，卡上方一行提示 | `competition.folder.none` | 「新建文件夹」 |
| E3 | 进入文件夹且该文件夹 `competitions.length === 0` | 竞赛列区块内空态卡（不隐藏区块头） | `competition.folder.noCompetition` | 「新建竞赛」（预填 `folderId = 当前文件夹`） |
| E4 | 进入文件夹，有竞赛，`plan.items.length === 0 && plan.timeline.length === 0` | 规划区**整体**一张空态卡；**不**渲染三视图 tab | `plan.empty` | 「新建清单项」「新建里程碑」 |
| E5 | 规划有数据，但当前视图为空 | 该视图内空态行（tab 保持可见可切） | 清单 → `plan.items.empty`；里程碑 → `plan.milestones.empty`；时间线 → `plan.timeline.empty` | 当前视图对应的新建按钮 |
| E6 | 进入「未分组」视图 | 规划区位置显示提示行，不渲染 PlanPane | `competition.folder.ungroupedPlanHint` | 无（提示「归入文件夹后即可添加规划」） |

**E4 vs E5 的分界**必须严格按上表判定（前者是「规划整体为空」，后者是「有数据但这一格为空」），否则用户会看到三个空视图而不是一句「先建一条」。

### 4.3 文件夹详情布局与 640px 断点

| 区域 | ≥ 640px（宽） | < 640px（窄） |
| --- | --- | --- |
| 面包屑 | 单行，左箭头 + 路径 | 单行，文件夹名 `text-overflow: ellipsis` |
| 竞赛列表 / 规划区 | 两栏：竞赛左、规划右（`display:flex`，规划 `flex:1`，最小宽度用现有卡片宽度量级，**不写像素值**） | 单列堆叠：竞赛在上、规划在下 |
| 三视图 tab | 单行 | 单行，`overflow-x:auto` 可横滑，不换行不截断文案 |
| 工具栏按钮 | 行内右对齐 | 换行，主按钮仍在前 |

- 断点值**只用 `640px`**（与批次① 一致）；不新增 768/1024 断点。
- 暗色：全部沿用 `--dsw-alias-*` 变量（现有 `body[data-ds-dark-theme]` 机制已覆盖）；本批**不新增**任何颜色 token。唯一的淡染需求（里程碑进度条底槽）用 `color-mix(in srgb, var(--dsw-alias-bg-layer-1) 70%, transparent)`，与批次① 的浅染做法同源。

### 4.4 竞赛对话框新增「所属文件夹」下拉（改 `client.js:2170-2200`）

- 位置：紧跟 `status` 之后、`deadline` 之前。
- 控件：原生 `<select className="mc-input">`，选项 = `t('competition.folder.ungrouped')`（value `''`）+ 每个文件夹（value `id`）。**不引入新组件库**。
- 状态：`const [folderId, setFolderId] = useState(value.folderId || '')`。
- `submit()` 的对象**必须显式带 `folderId`**（即使为 `''`）：`saveCompetition`（`client.js:3377-3385`）用 `{...item, ...draft}`，draft 缺键会保留旧值——显式带键才符合「用户在下拉里选了什么就存什么」。
- 新建时默认值：从文件夹详情页新建则预填当前 `folderId`；从列表层新建则为 `''`。

### 4.5 新增回调（挂在 `competitionsView`，`client.js:3545-3552`）

| 回调 | 签名 | 行为 |
| --- | --- | --- |
| `onSaveFolder` | `(draft) => void` | `draft = { id?, name, order? }`；无 id → `concat`（`order = 现有最大 order + 1`）；有 id → `map` 覆盖 name |
| `onDeleteFolder` | `(folder) => Promise` | §1.5 五步 |
| `onReorderFolder` | `(id, delta) => void` | 上移/下移一位：交换相邻两项 `order` 后重排稠密化；越界则无操作 |
| `onAddPlanItem` / `onTogglePlanItem` / `onDeletePlanItem` | `(folderId, …)` | 作用于 `folder.plan.items` |
| `onAddTimeline` / `onToggleTimeline` / `onDeleteTimeline` | `(folderId, …)` | 作用于 `folder.plan.timeline`；`kind` 由当前视图决定（里程碑视图新建 → `kind='milestone'`，时间线视图新建 → `kind='step'`，用户可在表单里改） |
| `onMoveCompetition` | `(competition, folderId)` | 只改归属（§1.6）。实现上可复用 `onSaveFolder` 之外的独立 `updateWith`；若不新增回调，则由编辑对话框的 `folderId` 覆盖完成——**二选一，实现者选后者即可，不强制新增回调** |

所有写操作统一走现有 `updateWith`，**不新增持久化路径**、不改 `localStorage` 读写函数。

### 4.6 类名与 CSS 增量

新增两组类名，全部新加在现有 CSS 字符串数组里（`client.js:1301-1308` 附近），不改已有规则：

- 文件夹层：`.mc-cf-list` `.mc-cf-card` `.mc-cf-head` `.mc-cf-name` `.mc-cf-meta` `.mc-cf-progress` `.mc-cf-progress-bar` `.mc-cf-ungrouped`
- 规划层：`.mc-plan` `.mc-plan-tabs` `.mc-plan-tab` `.mc-plan-items` `.mc-plan-item` `.mc-plan-tl` `.mc-plan-tl-group` `.mc-plan-tl-row` `.mc-plan-tl-dot` `.mc-plan-tl-dot[data-kind=milestone]` `.mc-plan-empty`

命名不与既有 `.mc-competition*` / `.mc-folder*`（磁盘目录浏览器用 `.mc-folder*`，见 `folder.*` 那组）冲突；**禁止**复用 `.mc-folder*`，那是另一个功能。


## 5. v6→v7 迁移与幂等

### 5.1 版本与写盘

- `normalize()` 返回对象的 `version` **硬编码为 `7`**（`client.js:879` 的 `6` 改成 `7`）。
- **不读取入参 `raw.version`**（现状即如此）。理由：读入参会让「v6 数据 → 归一化 → 又看到 6 → 再迁移」的逻辑分叉；硬编码后的规则是「只要从 `normalize()` 出来就一定是 v7 形状」，迁移是幂等的形状收敛，而不是一次性的分支。
- `STORAGE_KEY` 不变、`localStorage` 不变、不新增存储介质、不新增路由。迁移发生在 `readState()` → `normalize()` 里（`client.js:910-914`），第一次读旧数据即完成。

### 5.2 迁移规则（逐条，顺序敏感）

| # | 规则 | 实现位置 |
| --- | --- | --- |
| M1 | `raw.competitionFolders` 非数组/缺失 → `[]`（v6 数据天然走这条） | 新 `normalizeCompetitionFolders(raw)` |
| M2 | 每个文件夹按 §1.2 归一化；重复 `id` 丢后者；`order` 稠密化为 `0..n-1` | 同上 |
| M3 | 每个文件夹的 `plan` 按 §2.2/§2.3 归一化，缺失 → `{items:[],timeline:[]}` | 新 `normalizePlan(raw)` |
| M4 | **先 folders 后 competitions**：`normalizeCompetition(item)` 输出后，`folderId` 必须二次校验：仅当该 id 存在于**归一化后的** folders 里才保留，否则 `''` | `client.js:883` 的 map 链末尾 |
| M5 | v6 竞赛（无 `folderId` 键）→ `folderId: ''` → 落入「未分组」 | M4 的自然结果，无需专门分支 |
| M6 | 竞赛的 6 个旧字段**逐字保留**（`name/level/status/deadline/link/note` 不改写、不裁剪、不默认覆盖已有值） | 沿用 `client.js:791-803` |
| M7 | 若输入带 `plan.milestones`（非本规格字段）→ 一次性并入 `timeline` 并删键（§2.5） | `normalizePlan` |
| M8 | 其余顶层字段（`periods/terms/research/activeTermId/tags/filesRoot/image/ui`）**一个都不动** | 现状 |

**迁移不丢数据的口径（严格）**：对任一 v6 存档，迁移后 `competitions.length` 与其逐项 6 字段的值必须完全不变；新增的只有 `folderId: ''` 与顶层 `competitionFolders: []`。不做「未知字段透传」——这是现状既有行为（`normalize` 本来就会丢弃未声明字段），本批不改变该口径，也不对未知字段作承诺。

### 5.3 幂等性论证（两次 normalize 逐字节一致）

断言形式：设 `A = normalize(x)`，`B = normalize(A)`，则 `JSON.stringify(A) === JSON.stringify(B)`（键序也一致，因为两次都由同一处对象字面量产出）。

逐条消解「第二轮可能产生差异」的来源：

| 漂移源 | 为什么第二轮不会变 |
| --- | --- |
| `uid()` 生成 id | 第一轮已把 `id` 写成合法非空字符串，第二轮 `typeof id === 'string' && id` 命中，不再生成 |
| `Date.now()` 生成 `createdAt` | 第一轮已写入 `>0` 的有限数，第二轮原值保留 |
| `order` 重排 | 第一轮输出为稠密 `0..n-1` 且**互不相同**，排序仅按 `order` 即唯一确定；第二轮排序结果与输入同序，重编号仍是 `0..n-1` |
| 重复 `id` 去重 | 第一轮已去掉重复项，第二轮无重复可去 |
| `plan.milestones` 合并 | 第一轮输出对象**不含** `milestones` 键，第二轮不触发合并 |
| 里程碑派生 | 里程碑**不落盘**（§2.4），第一轮输出里根本没有可漂移的第二份数据 |
| 空 `text/title` 丢弃 | 第一轮已丢弃，第二轮的输入里不存在空项 |
| 悬空 `folderId` / `competitionId` | 第一轮已降级为 `''`，第二轮 `''` 不在 folders 里但 `''` 是合法值，保持 |
| 字段默认值 | 都是字面量（`'未命名文件夹'`、`'未命名竞赛'`、`COMPETITION_LEVELS[0]` 等），确定性 |

唯一非确定的是**对原始 v6 输入**的第一次调用（会生成 uid/时间戳），这正是迁移的语义；幂等承诺的对象是「归一化后的 v7 文档」，与批次① §5.3 的口径一致。

### 5.4 回归保护

迁移不得触碰既有三个 tab 的状态形状：`terms/periods/research/ui` 的字段集合与本批前完全一致；`competitionFolders` 是**新增**键，不重命名任何旧键（不做 `folders → competitionFolders` 的改名冒险——顶层 `folders` 这个键历史上已被 `legacyFolders` 分支读过，命名冲突风险高，故用新名字）。

---

## 6. R2 / R3 修复判定表（可直接照抄进代码）

### 6.1 R2：预印本降级条件过宽 + tooltip 恒为「发表」

**现状代码（`client.js:2061` / `2064`，`PapersPane.renderMeta`）**

```js
const venue = item.venue || (item.arxivId ? t('paper.preprint') : '');   // 2061
…
venue ? h('span', { className: 'mc-paper-venue', title: t('paper.venue') }, venue) : null,  // 2064
```

**缺陷**：`venue` 为空但 `arxivId` 存在就一律显示「arXiv 预印本」。arXiv 条目如果带 DOI（已正式发表、只是没解析出 `journal_ref`）同样会显示 `venue === ''`，于是**已发表论文被标成预印本**；同时 tooltip 恒为 `t('paper.venue')`（「发表」），连自己标的是预印本都说反了。

**修复（照抄）**

```js
const hasVenue = String(item.venue || '').trim().length > 0;
const hasDoi = String(item.doi || item.doiUrl || '').trim().length > 0;
const hasArxiv = String(item.arxivId || '').trim().length > 0;
const preprint = !hasVenue && !hasDoi && hasArxiv;
const venueText = hasVenue ? item.venue : preprint ? t('paper.preprint') : '';
const venueTitle = hasVenue ? t('paper.venue') : preprint ? t('paper.preprint') : '';
```

判定表（`venue` / `doi`（含仅有 `doiUrl`）/ `arxivId` 三种来源的组合）：

| # | `venue` | `doi` 或 `doiUrl` | `arxivId` | `venueText` | `title`（tooltip） | 是否渲染 `.mc-paper-venue` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 有 | 任意 | 任意 | `venue` 原文 | `paper.venue`（发表） | 渲染 |
| 2 | 无 | 有 | 有 | `''` | — | **不渲染**（这是本次修复的核心：有 DOI 即视为已发表，不得标预印本） |
| 3 | 无 | 有 | 无 | `''` | — | 不渲染 |
| 4 | 无 | 无 | 有 | `paper.preprint`（arXiv 预印本） | `paper.preprint` | 渲染 |
| 5 | 无 | 无 | 无 | `''` | — | 不渲染 |

补充约束：

- `paper.preprint` 与 `paper.venue` **两个 key 都已存在**（zh `264`/`265`，en `508`/`509`），本修复**不新增** i18n key，只改「什么时候用哪一个」。
- 判定 `hasDoi` 必须同时看 `doi` 与 `doiUrl`：`normalizePaper`（`client.js:739-740`）把它们当两个独立字段保留，现实中存在只有 `doiUrl` 的条目。
- 空白串按「无」处理（`trim()`），与 `normalizePaper` 的 `String(v || '')` 口径一致。
- 判定逻辑放在 `renderMeta` 内、`venue` 那一行之前；**不要**把 `preprint` 写进 `normalizePaper`（这是渲染判定，不是数据归一化；写进数据层会让存量已保存论文无法受益）。
- **必须抽成纯函数以便断言**（验收项 V15 依赖它，写在 `normalizePaper` 附近，不依赖 DOM）：
  ```js
  function paperVenueMeta(item, t) {
    const hasVenue = String(item.venue || '').trim().length > 0;
    const hasDoi = String(item.doi || item.doiUrl || '').trim().length > 0;
    const hasArxiv = String(item.arxivId || '').trim().length > 0;
    const preprint = !hasVenue && !hasDoi && hasArxiv;
    return {
      text: hasVenue ? item.venue : preprint ? t('paper.preprint') : '',
      title: hasVenue ? t('paper.venue') : preprint ? t('paper.preprint') : '',
    };
  }
  ```
  第 2061/2064 行改为 `const { text: venue, title: venueTitle } = paperVenueMeta(item, t);` 与 `venue ? h('span', { className: 'mc-paper-venue', title: venueTitle }, venue) : null`。

### 6.2 R3：已完成任务仍显示「已逾期 N 天」

**现状代码（`client.js:1808-1809` / `1836`，`TaskRow`）**

```js
const tier = task.done ? 'normal' : kind === 'overdue' ? 'overdue' : …;   // 1808
const countdown = taskCountdown(task, now);                               // 1809 ← 缺陷
…
countdown ? h('span', { className: 'mc-task-due' + tone }, format(t(countdown.key), countdown.params)) : null  // 1836
```

**缺陷链**（两处，必须一起修，只修一处仍会显示红色）：

1. `taskState()`（`1762-1771`）对「今天之前」一律返回 `'overdue'`，**完全不看 `done`**；`taskCountdown` 于是为已完成任务返回 `{key:'task.daysOverdue'}` → 第 1836 行渲染「已逾期 N 天」。
2. 同一 `done` 任务仍带 `data-state={kind}` = `'overdue'`（第 1824 行），命中 CSS `.mc-task[data-state=overdue] .mc-task-title{color:var(--dsw-alias-state-error-primary)}`（`1271`），压过 `.mc-task[data-done=true] .mc-task-title{…tertiary}`（`1263`）→ 标题仍是错误红。

**修复（照抄）**

```js
const dueLabel = taskDueLabel(task);                     // 复用 client.js:1774-1780
const countdown = task.done
  ? (dueLabel ? { key: 'task.doneOn', params: { date: dueLabel }, tone: '' } : null)
  : taskCountdown(task, now);
```

配套：第 1824 行的 `'data-state'` 改为 `task.done ? 'done' : kind`。

**必须抽成纯函数以便断言**（验收项 V17/V18 依赖它，与 `taskCountdown` 并列放置、不碰 DOM）：

```js
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
```

第 1809 行与第 1810 行的 `tone` 合并进去：`const countdown = taskCountdownFor(task, now);`，第 1836 行改用 `countdown.tone`（`tone` 的来源从「局部变量」变成「同一函数的返回值」，仍然只有一处判定）。

判定表（截止区=第 1836 行那个 span）：

| # | `done` | `due` | 截止区显示 | tone | `data-state` |
| --- | --- | --- | --- | --- | --- |
| 1 | `false` | 逾期 | `已逾期 N 天`（现有 `task.daysOverdue`） | ` mc-task-late` | `overdue` |
| 2 | `false` | 今天/明天/7 天内/更远 | 现有四种文案（不变） | 按现状 | `today`/`tomorrow`/`week`/`later` |
| 3 | `false` | 无 | 不渲染 | — | `none` |
| 4 | **`true`** | 有（任意日期，含**已过**） | **`已完成 · 2026-11-20`**（`task.doneOn`，日期用 `taskDueLabel` 的绝对日期，带时间时含 `HH:mm`） | `''`（黑/灰，**不得为红**） | **`done`** |
| 5 | `true` | 无 | **不渲染**（`countdown === null`） | — | `done` |

补充约束：

- 新增 1 个 key `task.doneOn`（§7）。不复用 `task.dueDate`：「截止 X」与「已完成 · X」语义相反，复用会把已完成的活显示成还欠着。
- `done` 时不调用 `taskCountdown` 这一条是**可断言的硬指标**：单测里把 `now` 调到截止后 30 天、`done: true`，断言渲染文本不含「逾期」/`overdue`。
- 不改 `taskState()` 的返回值：它表达「相对今天的时间位置」，被今天页徽标（`1551`）等复用；改用 `done` 在渲染层分流，影响面最小。
- 竞赛卡片不适用本条（竞赛没有 `done` 概念），保持现状。


## 7. i18n key 清单（zh / en 成对，集合完全相同）

规则：全部新增 key 只用两个前缀 `competition.folder.*` 与 `plan.*`；**不新增** `folder.*`（已被磁盘目录浏览器占用）、不新增 `timeline.*`。已存在的通用 key（`save` / `cancel` / `delete` / `course.edit` / `task.dueToday` / `task.dueTomorrow` / `competition.*` 各条）一律复用，不复制同义新 key。

| key | zh（插到 `270-283` 那组内） | en（插到 `514-527` 那组内） |
| --- | --- | --- |
| `competition.folder.new` | 新建文件夹 | New folder |
| `competition.folder.edit` | 重命名文件夹 | Rename folder |
| `competition.folder.name` | 文件夹名称 | Folder name |
| `competition.folder.moveTo` | 所属文件夹 | Folder |
| `competition.folder.ungrouped` | 未分组 | Ungrouped |
| `competition.folder.count` | 共 {count} 个文件夹 | {count} folders |
| `competition.folder.competitions` | {count} 项竞赛 | {count} competitions |
| `competition.folder.none` | 还没有文件夹。新建一个，把竞赛归类后就能给每个文件夹挂学习规划。 | No folder yet. Create one to group competitions and attach a study plan to each. |
| `competition.folder.noCompetition` | 这个文件夹还没有竞赛。点「新建竞赛」，它会自动归到当前文件夹。 | No competition in this folder yet. Create one and it lands here. |
| `competition.folder.ungroupedPlanHint` | 未分组不是文件夹。把竞赛归入某个文件夹后，就可以添加学习规划。 | Ungrouped is not a folder. Move the competition into one to attach a study plan. |
| `competition.folder.deleteConfirm` | 「{name}」里的 {count} 项竞赛会移入未分组，这个文件夹的学习规划会一并删除。 | The {count} competition(s) in "{name}" move to Ungrouped, and this folder's study plan is deleted. |
| `competition.folder.up` | 上移 | Move up |
| `competition.folder.down` | 下移 | Move down |
| `competition.folder.nextMilestone` | 下一里程碑 | Next milestone |
| `plan.tab` | 学习规划 | Study plan |
| `plan.view.items` | 清单 | Checklist |
| `plan.view.milestones` | 里程碑 | Milestones |
| `plan.view.timeline` | 时间线 | Timeline |
| `plan.empty` | 这个文件夹还没有学习规划。先写一条清单，或者定一个里程碑。 | No study plan yet. Add a checklist item or set a milestone. |
| `plan.items.empty` | 清单还是空的。把要做的事一条条写下来。 | The checklist is empty. Write down what needs doing. |
| `plan.timeline.empty` | 时间线还是空的。加一条带上日期的安排。 | The timeline is empty. Add an entry with a date. |
| `plan.milestones.empty` | 还没有里程碑。在时间线里把类型选成「里程碑」即可，不用另外维护一份。 | No milestone yet. Set an entry's type to milestone on the timeline — there is no second copy to maintain. |
| `plan.newItem` | 新建清单项 | New checklist item |
| `plan.itemPlaceholder` | 例如：整理近三年真题 | e.g. collect past papers |
| `plan.newEntry` | 新建时间轴条目 | New timeline entry |
| `plan.newMilestone` | 新建里程碑 | New milestone |
| `plan.field.title` | 标题 | Title |
| `plan.field.date` | 日期 | Date |
| `plan.field.kind` | 类型 | Type |
| `plan.kind.milestone` | 里程碑 | Milestone |
| `plan.kind.step` | 步骤 | Step |
| `plan.noDate` | 未定日期 | No date |
| `plan.doneOn` | 已完成 · {date} | Done · {date} |
| `plan.progress` | 里程碑 {done}/{total} | Milestones {done}/{total} |
| `plan.noUpcoming` | 暂无待办里程碑 | No upcoming milestone |
| `plan.singleSource` | 里程碑来自时间线，改时间线就够 | Milestones come from the timeline — edit it there |
| `plan.linkedCompetition` | 关联竞赛 | Linked competition |
| `plan.none` | 未关联 | Unlinked |
| `task.doneOn` | 已完成 · {date} | Done · {date} |

补充约束：

- `task.doneOn` 属**既有 `task.*` 前缀**（R3 用），插在 `task.dueDate` 之后；§6.2 只用这一个新 key。
- `{date}` / `{count}` / `{name}` 占位符写法与现有 `format(t(key), params)` 完全一致，**不要**引入 ICU 复数。
- zh 与 en 的 key **集合**必须严格相等（不含顺序）：断言 `Object.keys(zh).filter(k=>/^(competition\.folder|plan)\.|^task\.doneOn$/).sort()` 与 en 侧逐项相等。
- 中文标点用全角、英文用半角；「」引号仅出现在中文串里。

---

## 8. 验收清单（每条都能被一个断言或一段肉眼检查判真假）

### 8.1 数据层（node 断言，可直接写进 `check-client.mjs` 的扩展或新 `check-batch2.mjs`）

| # | 断言 | 判定方式 | 覆盖 |
| --- | --- | --- | --- |
| V1 | `normalize({}).version === 7`，且 `normalize({}).competitionFolders` 深等于 `[]` | `assert.equal` / `deepEqual` | §5.1 M1 |
| V2 | 对 v6 fixture（2 项竞赛、6 字段全非空、无 `folderId`）：迁移后 `competitions.length === 2`，逐项 6 字段与输入**逐字相等**，且 `folderId === ''` | 逐字段 `assert.equal` + `deepEqual` 切片比较 | §5.2 M4/M5/M6 |
| V3 | 幂等：`const A = normalize(v6); const B = normalize(A); assert.equal(JSON.stringify(B), JSON.stringify(A))`（键序也一致） | 字符串比较 | §5.3 |
| V4 | 悬空引用：`normalize({competitionFolders:[{id:'f1',name:'A'}], competitions:[{id:'c1',name:'X',folderId:'nope'}]})` → 该竞赛 `folderId === ''` | `assert.equal` | §1.3 |
| V5 | 重复文件夹 id：输入两条 `id:'f1'` → 输出 `length === 1` 且保留首条 `name` | `assert.equal` + `assert.equal` | §1.2 |
| V6 | `order` 稠密化：输入 order `[5, 0, 9]` → 输出按 `[第2条, 第1条, 第3条]` 排序且 `order === [0,1,2]`；再 normalize 一次结果不变 | `deepEqual` 两次 | §1.2 |
| V7 | 未分组不是记录：任何输入的输出里都不存在 `id === ''` 或 `name === '未分组'` / `'Ungrouped'` 的文件夹 | `assert.ok(!folders.some(...))` | §1.4 |
| V8 | 删除文件夹不丢竞赛：取 V2 的迁移结果，构造 `folders=[{id:'f1'}]` 且两项竞赛分别 `folderId:'f1'` / `''`，按 §1.5 过滤并改写后 `competitions.length === 2` 且原 `folderId:'f1'` 的变 `''` | `assert.equal` ×2 | §1.5 |
| V9 | 里程碑零存储：`Object.keys(normalizePlan({items:[],timeline:[]})).sort()` 恰为 `['items','timeline']` | `deepEqual` | §2.4 |
| V10 | `milestonesOf` 派生：构造 3 条 timeline（2 条 `kind:'milestone'`、1 条 `step`）→ `milestonesOf(plan).length === 2`，且这 2 条 `date` 升序；把其中一条 `kind` 改成 `'step'` 后长度变 1（**未改动任何其它字段**） | `assert.equal` ×3 | §2.4 |
| V11 | 旧 `plan.milestones` 兜底：输入 `plan:{timeline:[], milestones:[{id:'m1',title:'答辩',date:'2026-12-01'}]}` → 输出 `timeline.length === 1`、该条 `kind === 'milestone'`、`'milestones' in output === false`，且再 normalize 一次字节一致 | 三条断言 + 字符串比较 | §2.5 |
| V12 | 容量：`items` 输入 250 条 → 输出 200 条；`timeline` 同 | `assert.equal` | §2.6 |
| V13 | 空文本丢弃：`items:[{text:'   '},{text:'写真题'}]` → 输出 1 条；`timeline` 空 `title` 同理丢弃，但 `date:''` **不**丢弃 | `assert.equal` ×2 | §2.2/§2.3 |
| V14 | `planCountdown` 判定表 7 行全覆盖：固定 `now = new Date('2026-11-03T10:00:00')`，逐行 `assert.equal(planCountdown(entry, now).key, 期望)`；`done:true` 时断言 `key === 'plan.doneOn'` 且 `tone === ''` | 7 × `assert.equal` | §3.2 |

### 8.2 缺陷修复（node 断言，需先把判定收成纯函数）

| # | 断言 | 判定方式 | 覆盖 |
| --- | --- | --- | --- |
| V15 | R2：`paperVenueMeta()`（§6.1 抽取的纯函数）对 5 行组合的 `{text, title}` 逐行相等；特别是「无 venue + 有 doi + 有 arxivId」→ `text === ''`、`title === ''`（**不得**等于 `paper.preprint`），「无 venue + 无 doi + 有 arxivId」→ `text === paper.preprint` | 5 × `deepEqual` | §6.1 |
| V16 | R2：`venue` 为 `'   '`（纯空白）+ 有 doi → 同 V15 第 2 行行为 | `assert.equal` | §6.1 |
| V17 | R3：`done:true, due:'2026-10-01'`（`now` = 2026-11-03）→ 渲染文本含 `已完成 · 2026-10-01`、**不含** `逾期`；`data-state === 'done'`；`data-tier === 'normal'` | 提取 `taskCountdownFor(task, now)` 后 `assert.ok(!/逾期/.test(text))` | §6.2 |
| V18 | R3：`done:true, due:''` → `countdown === null`（不渲染）；`done:false, due:'2026-10-01'` → 仍为 `task.daysOverdue` 且 tone 含 `mc-task-late`（**不得回归**未完成任务的逾期提示） | `assert.equal` ×3 | §6.2 |

### 8.3 i18n / 工程约束（node 断言）

| # | 断言 | 判定方式 | 覆盖 |
| --- | --- | --- | --- |
| V19 | zh 与 en 字典 key 集合相等（整表，不只新增项） | `deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())` | §7 |
| V20 | §7 表里每个 key 在 zh 与 en 中都存在且非空字符串 | 遍历表 → `assert.ok` | §7 |
| V21 | 依赖零新增：`package.json` 的 `dependencies`/`devDependencies` 与本批前一致 | 快照 diff | §9 |
| V22 | 无硬编码颜色：新增 CSS 片段中 `/#[0-9a-fA-F]{3,8}\b/` 与 `/rgb\(/` 命中数 0（只允许 `var(--dsw-alias-*)` / `color-mix`） | 正则计数 | §4.3 |
| V23 | 断点唯一：新增 CSS 中出现的 `@media` 断点值集合 ⊆ `{640px}` | 正则收集后 `deepEqual` | §4.3 |
| V24 | 竞态安全（幂等二次调用）：连续两次 `updateWith` 添加同一清单项文本不产生重复 id（`new Set(ids).size === items.length`） | `assert.equal` | §4.5 |

### 8.4 肉眼检查（人工逐条勾）

| # | 检查项 | 通过标准 |
| --- | --- | --- |
| M1 | L1 文件夹列表 | 有 ≥2 个文件夹时按 order 排列；未分组卡固定最后；卡片显示「N 项竞赛」「里程碑 x/y」「下一里程碑 · 还有 N 天」 |
| M2 | 空态 E1 | 全新存档（无文件夹无竞赛）显示一句引导 + 两个按钮，不出现空白区块 |
| M3 | 空态 E2 | 只有未分组竞赛时，列表有未分组卡且顶部有 `competition.folder.none` 提示 |
| M4 | 空态 E3/E4/E5 | 三种「空」在视觉上可区分：区块内空态 / 规划整体空态（无 tab）/ 单视图空态（tab 仍在） |
| M5 | 空态 E6 | 未分组视图里没有规划按钮，只有一行提示 |
| M6 | 里程碑派生可感知 | 在时间线里把一条改成「里程碑」，切到里程碑视图立刻出现该条（**页面上没有任何「另存里程碑」的入口**） |
| M7 | R2 观感 | 任选一篇有 DOI 的 arXiv 论文，卡片不显示「arXiv 预印本」；纯预印本论文显示该标签，hover 提示也是「arXiv 预印本」 |
| M8 | R3 观感 | 勾选一个已过期任务：红色消失、标题删除线、「已逾期」变「已完成 · 日期」 |
| M9 | 640px 断点 | 窗口宽度 639px 时竞赛/规划上下堆叠、三视图 tab 可横滑；641px 时左右两栏、tab 单行不滚动 |
| M10 | 暗色 | `body[data-ds-dark-theme]` 下文件夹卡、进度条底槽、里程碑圆点均可辨，无死黑/死白块 |

---

## 9. 本批明确不做的事（越界即 review 失败）

1. **不做磁盘目录**：不创建/扫描任何真实文件夹，不使用 `filesRoot`，不复用 `.mc-folder*` 那套浏览器组件。竞赛文件夹纯 localStorage 记录。
2. **不做云同步 / 不做账号**：仍然只写 `localStorage`（`STORAGE_KEY` 不变），不新增网络请求。
3. **不改存储介质**：不引入 IndexedDB / 文件系统 / 服务端；不改 `readState`/`updateWith` 的持久化路径。
4. **不改已有 HTTP 路由**：`my-courses/index.js` 一行不动（本批无宿主侧改动；竞赛数据本来就不经过宿主）。
5. **不新增依赖**：`package.json` 不变；不引入日期库（`date-fns`/`dayjs` 一律不用，继续手写 `daysUntil`）。
6. **不动批次① 已定的视觉 token**：`--mc-note-*`、三档便利贴尺寸、`--dsw-alias-*` 的既有映射一律不修改；新 UI 只消费，不增删 token。
7. **不改论文/课表/文件三个 tab 的行为**（R2 之外）：`PapersPane` 只改 §6.1 那两行判定；`activeTag` 持久化问题继续留在 backlog，不在本批顺手做。
8. **不做竞赛模板/批量导入/导出**：不进本批。
9. **不改 `taskState()` 语义**（§6.2 只在渲染层分流），不动今天页徽标等既有消费方。
10. **不改 `version` 之外的存档键名**：不重命名 `folders`/`tags`/`research` 等任何既有键。

---

## 10. 实现顺序建议（供实现者，不是验收项）

1. 常量与 normalize：`TIMELINE_KINDS` → `normalizePlan`（含 §2.5 兜底）→ `normalizeCompetitionFolders` → `normalizeCompetition` 加 `folderId` → `normalize()` version 7 + M4 校验。**此步完成后先跑 V1–V13**，数据层不绿不要碰 UI。
2. 派生与倒计时：`byTimeline` / `milestonesOf` / `planProgress` / `planCountdown` → 跑 V14。
3. 缺陷修复（小、独立，先摘掉）：`paperVenueMeta` 抽取 + R2 接入 → 跑 V15/V16；`TaskRow` 的 `countdown`/`data-state` → 跑 V17/V18。
4. i18n：一次性把 §7 全表插进 zh/en → 跑 V19/V20（此时 UI 还没写，key 已就位，后面不会漏）。
5. UI：`CompetitionsPane` 改 L1 + `CompetitionFolderView` + `PlanPane` 三视图 → 空态 E1–E6 → 断点与暗色。
6. 收尾：V21–V24 + M1–M10 肉眼清单；`node check-client.mjs` 与既有门槛必须仍为通过。

**上下文纪律（给实现者）**：按上表**分五次改文件**，每次只读对应行段（`sed -n "A,Bp"`，单次 ≤80 行），落一处跑一处断言；不要一次读完 3726 行再动手。