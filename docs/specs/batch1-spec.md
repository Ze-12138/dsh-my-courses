# 批次①「我的课程 → 学业工作台」施工规格

> 范围：便利贴待办视觉、论文卡片「来历」字段、右侧标签栏、规则级质量门槛、v5→v6 数据迁移。
> 本文是规格，不写实现代码。每个改动点都带现有文件 + 行号锚点；行号以本次读取的
> `my-courses/client.js`（共 3589 行）与 `my-courses/index.js`（共 387 行）为准。

## 0. 改动点速查（锚点总表）

| 改动 | 文件 | 锚点（行号） |
|---|---|---|
| 便利贴 CSS 常量与 token | `my-courses/client.js` | `1140`–`1203`（`CSS` 数组，任务样式在 `1192`–`1203`） |
| 任务行渲染 | `my-courses/client.js` | `1702`–`1734`（`TaskRow`） |
| 任务状态判定 / 截止标签 / 排序 | `my-courses/client.js` | `1675`–`1700`（`taskState` / `taskDueLabel` / `byDue`） |
| 任务列表容器 | `my-courses/client.js` | `1902`–`1931`（`TasksPane`） |
| 中文文案 | `my-courses/client.js` | `56`–`258`（`ZH`），任务键 `172`–`189`，论文键 `240`–`258` |
| 英文文案 | `my-courses/client.js` | `395`–`491`（`EN`），任务键 `405`–`422`，论文键 `473`–`491` |
| 论文记录归一化 | `my-courses/client.js` | `694`–`708`（`normalizePaper`） |
| research 归一化 | `my-courses/client.js` | `710`–`722`（`normalizeResearch`） |
| 整库归一化 / version | `my-courses/client.js` | `772`–`834`（`normalize`，`version: 5` 在 `812`） |
| 读取 / 写入 / 存储键 | `my-courses/client.js` | `34`–`35`（键）、`843`–`857`（`readState`）、`859`–`875`（`writeState`） |
| 论文列表渲染 | `my-courses/client.js` | `1940`–`1990`（`PapersPane`） |
| 论文刷新 / 过滤（客户端） | `my-courses/client.js` | `3189`–`3227`（`toggleDirection` / `refreshPapers`） |
| 论文列表容器（加右侧标签栏） | `my-courses/client.js` | `1977`–`1988`（列表循环）与 `1949`（`mc-papers` 根） |
| 论文 Atom 解析（Host） | `my-courses/index.js` | `321`–`359`（`parseAtom`） |
| 论文代理路由（Host） | `my-courses/index.js` | `257`–`314`（`handlePapers`），常量 `19`–`21` |
| 响应式断点（现有） | `my-courses/client.js` | `1308`（`@media (width<=820px)`） |

---

## 1. 便利贴待办视觉（§1 → 验收项①）

### 1.1 三档尺寸与配色 token

采用「主题安全」做法：新增自定义属性 token，配 `prefers-color-scheme` 亮/暗两套，
而不是硬编码十六进制；这样既有明快便利贴色，又不会破坏现有 `--dsw-alias-*` 主题体系。

在 `CSS` 数组（`client.js:1140` 起）最前面、`.mc-page{...}`（`1141`）之前，追加下列 token 规则：

```text
:root{
  --mc-note-normal-bg:#fff6d8;        --mc-note-normal-edge:#e8d38a;   --mc-note-normal-tape:rgba(0,0,0,.14);
  --mc-note-due-bg:#ffe6c7;           --mc-note-due-edge:#f2a94a;      --mc-note-due-tape:rgba(0,0,0,.14);
  --mc-note-overdue-bg:#fde3e3;       --mc-note-overdue-edge:#e06a6a;  --mc-note-overdue-tape:rgba(0,0,0,.16);
}
@media (prefers-color-scheme: dark){
  :root{
    --mc-note-normal-bg:#3a3523;      --mc-note-normal-edge:#8a7a3a;
    --mc-note-due-bg:#40301d;         --mc-note-due-edge:#a5712c;
    --mc-note-overdue-bg:#3d2424;     --mc-note-overdue-edge:#a14a4a;
  }
}
```

三档尺寸（容器 min-height，不做固定高）：

| 档 | 命中条件（沿用现有 `taskState`，`client.js:1675`–`1685`） | 尺寸（min-height） | 背景/边框 token | 语义 |
|---|---|---|---|---|
| 普通 | `later` / `week`（7 天以上 & 未到期） | `64px` | normal | 默认 |
| 临近截止 | `today` / `tomorrow`（≤1 天，含今天） | `80px` | due | 强调 |
| 逾期 | `overdue`（`now >= due`） | `88px` | overdue | 最高优先 |

- 无截止日期（`taskState` 返回 `none`）归入「普通」档。
- 已完成（`task.done === true`）统一回落到普通档背景并整卡降透明度 `opacity:.55`。

### 1.2 信息层级（自上而下）

每个便利贴是一张 `article` 卡片，`data-tier` 取值 `normal|due|overdue`。层级顺序固定为：

1. **勾选态**：左上角复选框（复用 `ICON_CHECK` + `.mc-check`，`client.js:1719`–`1725`），完成后整卡压灰。
2. **任务名**：加粗主行（现有 `.mc-task-title`，`client.js:1727`）。
3. **课程名**：次要行（现有 `.mc-task-course`，`client.js:1729`，沿用 `showCourse` 开关）。
4. **截止倒计时**：标签 + 剩余天数/已逾期天数（`client.js:1730`–`1732`）。倒计时文案规则见 §1.3。
5. 右上角保留删除按钮（现有 `.mc-btn-danger`，`client.js:1733`）。

### 1.3 截止倒计时文案（新增 i18n 键）

在 `taskDueLabel`（`client.js:1687`–`1693`）旁新增 `taskCountdown(task, now)`，返回：

| 状态 | 文案键 | 中文 | 英文 |
|---|---|---|---|
| 逾期 | `task.daysOverdue` | `已逾期 {days} 天` | `{days}d overdue` |
| 今天 | `task.dueToday`（已有，`182`） | `今天到期` | `Due today` |
| 明天 | `task.dueTomorrow`（新增） | `明天到期` | `Due tomorrow` |
| ≤7 天 | `task.daysLeft`（新增） | `剩 {days} 天` | `{days}d left` |
| >7 天 | `task.dueDate`（新增） | `截止 {date}` | `Due {date}`（用 `isoDate(due)` 结果） |

- 新增键追加在 `ZH` 的 `task.hint`（`client.js:189`）之后、`EN` 的 `task.hint`（`422`）之后。
- 逾期天数 = `ceil((startOfDay(now) - startOfDay(due))/86400000)`，最小 1。

### 1.4 640px 窄屏与亮/暗主题回落

- 断点：在现有 `@media (width<=820px)`（`client.js:1308`）之后，新增
  `@media (width<=640px)` 块：
  - `.mc-task-list` 与便利贴卡片 `grid` 改为单列（`grid-template-columns:minmax(0,1fr)`），取消多列；
  - `.mc-task` 内部由 `flex` 改为 `flex-wrap:wrap`，勾选框与标题占首行，课程名/倒计时折到第二行；
  - 便利贴 `.mc-note` 的 `min-height` 回落到 `auto`，避免窄屏高度虚占；
  - 删除按钮移到标题行末（`margin-left:auto`）。
- 亮/暗主题：颜色只经 §1.1 token 与现有 `--dsw-alias-*` 走，不新增裸色值；`prefers-color-scheme` 由浏览器自动切换，无需 JS。
- 任务卡片底色 token 的 `--mc-note-*-tape` 用于可选「胶带条」装饰（顶部一条 4px 半透明渐变条），实现时用 `background-image` 或 `border-top` 二选一即可，规格不强制胶带视觉，只要求三档底色与边框可区分。

### 1.5 渲染结构变更（`TaskRow`，`client.js:1702`–`1734`）

- 外层 `div.mc-task` 保留 `data-state`、`data-done`（`1718`），追加 `data-tier`（§1.2 三档）。
- 将 `.mc-task` 的 className 额外叠加 `.mc-note`；`data-tier` 由 `task.done ? 'normal' : (kind==='overdue'?'overdue':kind==='today'||kind==='tomorrow'?'due':'normal')` 决定。
- CSS 在 `1192`–`1203` 增加 `.mc-note`、`.mc-note[data-tier=due]`、`.mc-note[data-tier=overdue]`、`.mc-task[data-done=true]` 四条规则，引用 §1.1 token。

---

## 2. 论文卡片「来历」字段（§2 → 验收项②）

### 2.1 字段来源表（arXiv Atom `entry` 子元素 → UI 字段）

来源规范以 [arXiv API User's Manual](https://info.arxiv.org/help/api/user-manual.html) 为准
（`<arxiv:journal_ref>`、`<arxiv:doi>`、`<arxiv:primary_category>`、`<link title="doi">`、`<published>`、`<author>`）。
Host 端 `parseAtom`（`index.js:321`–`359`）负责抽取，浏览器端 `normalizePaper`（`client.js:694`–`708`）负责归一化。

| UI 字段 | Atom 来源元素 | 抽取方式 | 缺失降级文案 / 行为 |
|---|---|---|---|
| `venue`（会议/期刊引用） | `<arxiv:journal_ref>` | `extractTag(body,'arxiv:journal_ref')` 后 `cleanText` | 空 → 卡片不渲染该行（不显示占位） |
| `primaryCategory`（主分类） | `<arxiv:primary_category term="...">` | 现有正则 `client.js/index.js:335` 已取 | 空 → 沿用旧 `category`；仍空则不显示 |
| `arxivId`（arXiv 编号，含版本） | `<id>`（形如 `http://arxiv.org/abs/hep-ex/0307015v1`） | 取 `id` 文本末段（最后 `/` 之后）；**保留版本号 `vN`** | 无法解析 → 用去掉 `v` 后的 `id`；仍空则该条丢弃（已有逻辑） |
| `arxivIdBase`（去版本编号） | `<id>` 去掉 `v\d+$` | 现有 `id.replace(/v\d+$/,'')`（`index.js:326`） | 与 `arxivId` 一致 |
| `doi` | `<arxiv:doi>`（首选）；缺失时用 `<link rel="related" title="doi" href>` | `extractTag(body,'arxiv:doi')`；fallback 用现有 `linkHref('title','doi')` | 空 → 不渲染 DOI 链接 |
| `doiUrl` | `doi` 字段拼接 | `'https://doi.org/' + doi` | 无 `doi` 则无此链接 |
| `submitted`（提交日期） | `<published>`（首版提交日） | 现有 `cleanText(extractTag(body,'published')).slice(0,10)`（`index.js:351`） | 空 → 不显示日期 |
| `authors`（前 3 位 + 等） | `<author><name>` 序列 | 现有循环（`index.js:329`–`334`）已取前 6；**展示层只取前 3** | `<3` 位显示实际数；`>3` 显示 `前3位 + "等 N 人"`；`0` 位不显示 |

### 2.2 Host 端 `parseAtom` 输出扩展（`index.js:347`–`356`）

在返回对象里新增字段，同时保留旧字段以兼容：

```text
items.push({
  id,                            // 现有：去版本号
  arxivId,                       // 新增：含版本，如 "hep-ex/0307015v1"
  arxivIdBase: id,               // 新增：去版本号（= id）
  title, authors, published, summary, url, pdf, category,   // 现有
  venue,                         // 新增：<arxiv:journal_ref> 清理后文本
  doi,                           // 新增：<arxiv:doi> 文本；无则 ''
  doiUrl,                        // 新增：doi ? 'https://doi.org/'+doi : ''
  primaryCategory,               // 新增：<arxiv:primary_category term>，无则 category
});
```

抽取新增元素时新增一个 `extractPrefixedTag(xml, 'arxiv:journal_ref')` 辅助（`extractTag` 现只匹配无前缀标签，
`index.js:367`–`370`）：正则 `<arxiv:journal_ref[^>]*>([\s\S]*?)</arxiv:journal_ref>`；`arxiv:doi` 同理。
`arxiv:primary_category` 沿用现有正则（`index.js:335`），但把它与 `category` 分别保存。

### 2.3 浏览器端 `normalizePaper` 扩展（`client.js:694`–`708`）

`normalizePaper` 返回对象新增字段，全部带默认值（空串/空数组），保证旧数据可归一化：

```text
venue: String(source.venue || ''),
doi: String(source.doi || ''),
doiUrl: String(source.doiUrl || ''),
arxivId: String(source.arxivId || ''),
arxivIdBase: String(source.arxivIdBase || id),   // 缺省回落到 id
primaryCategory: String(source.primaryCategory || source.category || ''),
```

- 作者展示「前 3 + 等」在渲染层做（§2.4），不改变存储的 `authors`（仍存前 6）。
- `normalizeResearch`（`710`–`722`）的 `.map(normalizePaper)` 自动带上新字段，无需改该函数体。

### 2.4 卡片渲染变更（`PapersPane`，`client.js:1977`–`1988`）

在现有 `mc-paper-meta` 行（`1983`–`1986`）里新增/重排，顺序固定：

1. `submitted`（`published`，现有 `1984`）
2. `venue`（新增，仅 `item.venue` 非空时渲染 `span.mc-paper-venue`）
3. `primaryCategory` 徽标（复用 `.mc-badge`，取代旧 `item.category`，`1985`）
4. `arxivId`（新增 `a` 链接到 `item.url`，文案为 `item.arxivId`）
5. `doiUrl`（新增 `a` 链接 `target=_blank rel=noreferrer`，文案 `DOI`）
6. 作者（前 3 + 等，改写 `1986`：`first3 = authors.slice(0,3)`，`authors.length>3` 时追加 `等 N 人`/`et al.`）

缺失降级：`venue`/`doiUrl`/`arxivId`/作者任一项为空 → 该子元素返回 `null` 不渲染，整卡不出现空占位。

### 2.5 新增 i18n 键

`paper.venue`（`发表`/`Published in`）、`paper.doi`（`DOI`，可复用字面量）、`paper.authorsMore`
（`等 {count} 人`/`+{count} more`）。追加在 `ZH` 论文键末（`client.js:258` 后）与 `EN`（`491` 后）。

---

## 3. 右侧标签栏（§3 → 验收项③）

### 3.1 标签来源

在 `PapersPane`（`client.js:1940`–`1990`）里，由当前 `items`（`research.items`，或 `savedOnly` 时的 `saved`）派生：

1. **分类标签**：每篇 `primaryCategory`（缺省 `category`）作为一个标签，原文展示（如 `cs.CL`）。
2. **规则命中标签**（方法/任务关键词）：用固定关键词表对 `title + ' ' + summary` 做不区分大小写的子串匹配，命中即打该标签：

   ```text
   LLM / 大模型      → 匹配: llm, large language model, gpt, transformer, pretrain, 大模型
   RL / 强化学习     → 匹配: reinforcement learning, rl, policy gradient, 强化学习
   ......
   ```

   实现为常量数组 `PAPER_TAG_RULES = [{label:'LLM', match:['llm','gpt','transformer',...]}, ...]`，放在
   `DIRECTIONS`（`client.js:676`–`689`）之后。规则表完整内容见附录 A（实现者照抄，不自行增删）。

### 3.2 数量上限与排序

- 每篇论文最多产出标签：分类 1 个 + 规则命中至多 2 个（取命中规则中按定义顺序前 2 个）。
- 右侧栏展示的是「全部标签计数汇总」：按出现次数降序，同次数按字母序，截断到 **最多 12 个**。
- 每个标签按钮显示 `label` + 计数徽标（复用 `.mc-badge`）。

### 3.3 点击过滤行为

- 右侧栏是单选过滤（`aria-pressed` 表达选中态）：点击标签 → 只显示含该标签的论文；再点同一标签 → 取消过滤回全量。
- 过滤与现有「方向 chips」（`1952`–`1958`）和「收藏切换」（`1971`–`1972`）**取交集**，不改动它们各自语义。
- 过滤状态放在 `PapersPane` 本地 `useState`（`activeTag`），与 `savedOnly` 并列；不写入全局 store。

### 3.4 无标签占位文案

- 当右侧栏标签列表为空（无任何可派生的标签）时，显示占位：`paper.tagEmpty`（`刷新后按分类与主题生成标签` / `Tags appear after refresh`）。
- 当选中某标签后列表为空，主体空态文案改用 `paper.emptyFiltered`（`没有命中该标签的论文` / `No papers match this tag`）。

### 3.5 布局

- `PapersPane` 根 `mc-papers`（`1949`）改为 `display:grid;grid-template-columns:minmax(0,1fr) 176px;gap:16px;align-items:start`：
  左列 = 现有过滤器 + 列表；右列 = 新增 `aside.mc-paper-tags`（sticky top，`align-self:start`）。
- 复用现有 `.mc-taglist` / `.mc-tagbtn` 样式（`1286`–`1292`）或新建 `.mc-paper-tags` 等价样式；标签按钮复刻 `.mc-chip` 语义。
- 在 `@media (width<=820px)`（`1308`）内，`mc-papers` 回落单列、右侧栏移到列表下方（或 `640px` 断点内隐藏为顶部横排 chips）。

### 3.6 新增 i18n 键

`paper.tagEmpty`、`paper.emptyFiltered`（§3.4）、`paper.tags`（`标签`/`Tags`）。追加位置同 §2.5。

---

## 4. 规则级质量门槛（§4 → 验收项④）

质量门槛全部在 **Host 端 `handlePapers`（`index.js:257`–`314`）与 `parseAtom`（`321`–`359`）** 落地，
浏览器端只消费结果，不重复实现过滤。

| # | 门槛 | 阈值 | 落地位置 | 理由 |
|---|---|---|---|---|
| 1 | 分类白名单 | 只接受 `/^[a-z-]+\.[A-Z]{2}$/` 且该分类属于现有 `DIRECTIONS` 12 类（`client.js:676`–`689`，含 `stat.ML`）；`handlePapers` 的 `CATEGORY_PATTERN`（`index.js:21`）仅做格式校验，白名单在客户端 `toggleDirection` 天然受 `DIRECTIONS` 约束，Host 侧不额外过滤 | `index.js:269`–`273` 保持格式过滤；客户端 `DIRECTION_CODES`（`client.js:690`）作为唯一合法集合 | 只推用户主动选的 12 个方向，避免 `cat:` 注入任意分类拉偏结果 |
| 2 | 摘要最短长度 | `cleanText(summary).length >= 120`（去除空白与标签后），不足则丢弃该条 | `parseAtom` 生成 `summary` 后过滤（`index.js:352` 后） | 过滤 arXiv 偶发的空摘要/极短占位摘要，保证卡片有可读内容 |
| 3 | 标题/摘要去重 | 两步：① 标题归一化（小写 + 去标点 + 折叠空白）后 `Set` 去重；② 摘要前 120 字符（同样归一化）相同者视为重复，保留首次出现（arXiv 返回已按提交时间降序） | `parseAtom` 返回前（`index.js:357` 前） | 同一论文在多分类查询中会被重复命中；避免卡片列表出现重复项 |
| 4 | 单次刷新条数上限 | `limit = min(PAPER_LIMIT=30, 用户 max)`，客户端固定 `max=20`（`client.js:3211` 保持）；`parseAtom` 返回前再 `.slice(0, limit)` 兜底 | `index.js:275`（已有）+ `index.js:358` 兜底 | 限流保护 arXiv API 与本地渲染；`PAPER_LIMIT` 是 Host 侧硬上限 |

补充要求：
- 规则 2/3 丢弃的条目要保证 `items.length` 仍按最终结果数通知用户（`paper.done` 已按 `items.length` 显示，`client.js:3221`，无需改）。
- 规则 3 的归一化函数新增 `normalizeForDedup(text)`：`String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').replace(/\s+/g,' ').trim()`。
- 规则阈值 120 / 前 120 字符为硬编码常量，命名 `MIN_SUMMARY_LEN = 120`、`DEDUP_ABSTRACT_PREFIX = 120`，放在 `index.js:21` 附近。

---

## 5. v5→v6 迁移与幂等性论证（§5 → 验收项⑤）

### 5.1 新增字段与默认值

| 字段 | 所在层 | 默认值 | 旧数据降级路径 |
|---|---|---|---|
| `version` 由 `5` 改为 `6` | `normalize`（`client.js:812`） | `6` | 读取时统一写出 `6`；不校验旧值 |
| `research.items[*].venue` | `normalizePaper`（`694`–`708`） | `''` | 旧数据无此键 → `String(source.venue || '')` = `''` |
| `research.items[*].doi` / `doiUrl` | 同上 | `''` / `''` | 同上 |
| `research.items[*].arxivId` / `arxivIdBase` | 同上 | `''` / 回落 `id` | `arxivIdBase` 缺省回落 `id`（`id` 旧数据已有） |
| `research.items[*].primaryCategory` | 同上 | `''`（回落 `category`） | 旧数据回落 `category`（`706` 已有） |

### 5.2 迁移机制

- **不改存储介质**：仍写 `dsh.my-courses.v2`（`client.js:34`），`writeState`（`859`–`875`）不变。
- **迁移是隐式的**：`readState`（`843`–`857`）每次 `JSON.parse` 后立即 `normalize()`，旧 shape 被归一化到 v6 字段齐全的 shape；下一次 `writeState` 自然持久化为 v6。
- **不需要一次性脚本**：无需迁移函数；`normalize` 是唯一迁移点。

### 5.3 幂等性论证（同一输入重复执行结果一致）

1. `normalize` 是纯函数（除 `uid()`、`Date.now()` 两个非确定点）：对同一输入，字段值确定。
2. `normalizePaper` 新增字段全部来自 `source` 或常量默认值，对同一 `source` 重复执行返回相同结果（无 `uid()`/时间戳）。
3. 唯一非确定点：无 id 的课程/标签会调用 `uid()`（`client.js:532`），但论文 `id` 来自 arXiv 且必填（`normalizePaper` 空 id 直接 `return null`，`697`），故**论文列表迁移是严格确定的**；课程/标签 id 在首次归一化后已持久化，第二次读取走同一 id 分支，不再生成新 id。
4. 因此：同一份 v5 JSON 反复经过 `JSON.parse → normalize`，产出逐字节一致；`JSON.parse(normalize(v5))` 再 `normalize` 也保持不变（v6 已含全部字段，归一化幂等）。

结论：迁移幂等，可安全反复执行。

---

## 6. 本批明确不做的事（§6）

1. **不改存储介质**：仍用 `localStorage`（`dsh.my-courses.v2`，`client.js:34`），不迁 IndexedDB/后端。
2. **不改宿主路由路径**：`POST /my-courses/extract`（`index.js:17`）与 `GET /my-courses/papers`（`index.js:18`）路径保持不变；只扩 `parseAtom` 输出，不改 `handlePapers` 的 URL 契约（`cats`/`q`/`max` 参数语义不变）。
3. **不引入新依赖**：`package.json`（`my-courses/package.json:19`–`33`）的 `dsh.client.inject` 列表不变；新字段用正则 + 手写 DOM 解析（现有 `extractTag`/`cleanText` 风格），不引入 XML 库。
4. **不做模型打分**：不调用 LLM 对论文评分/排序/摘要改写，标签栏只用规则匹配，留给批次③。
5. 不做：论文全文检索、arXiv 之外的来源、课程数据后端同步。

---

## 7. 实现顺序建议（供实现者，非本批验收项）

1. Host 侧 `parseAtom` 扩字段 + 质量门槛（§2.2、§4）→ 用 `check-logic.mjs`/`check-host.mjs` 验证。
2. 浏览器侧 `normalizePaper` + `version:6`（§2.3、§5）→ 幂等性自测。
3. 便利贴视觉（§1）→ 640px/暗主题目测。
4. 论文卡片「来历」渲染 + 右侧标签栏（§2.4、§3）→ 交互自测。
5. 文案补齐（§1.3、§2.5、§3.6）。

---

## 附录 A：标签规则表（实现者照抄，不自行增删）

```text
PAPER_TAG_RULES = [
  { label: 'LLM',        match: ['llm','large language model','gpt','transformer','pretrain','大模型','预训练'] },
  { label: 'RL',         match: ['reinforcement learning','policy gradient','reward model','强化学习','rlhf'] },
  { label: 'CV',         match: ['image','vision','segmentation','detection','计算机视觉','图像','分割','检测'] },
  { label: 'Graph',      match: ['graph neural','gnn','knowledge graph','图神经网络','知识图谱'] },
  { label: 'Search',     match: ['retrieval','rag','search','检索','搜索'] },
  { label: 'Speech',     match: ['speech','asr','tts','语音','音频'] },
  { label: 'Eval',       match: ['benchmark','evaluation','评估','评测'] },
];
```

- 匹配对象 = `(title + ' ' + summary).toLowerCase()`；任一 `match` 词作为子串命中即算命中。
- 单篇论文最多取命中规则的前 2 个标签；标签 `label` 用原文（不翻译）。
