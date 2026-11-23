# 批次③ 实现规格：全局「专业+方向」画像 + 每日三源推送 + 侧栏红点（存储 v7→v8）

> 基线：批次② 已 PASS 归档。`my-courses/client.js` 4545 行，sha256 前缀 `dae825936665`…`bd64`；`my-courses/index.js` sha256 前缀 `099570b6`…（443 行）；`my-courses/package.json` = 1.3.0；存储键 `dsh.my-courses.v2` 内 `version: 7`。本批只把 `version` 抬到 8，**不改存储键名**。
> 本文所有行号都是上述基线上的行号，引用前请先 `sed -n 'A,Bp'` 复核；若行号漂移，以文中给出的「原文片段」定位。
> 基线校验命令（实现前、评审前各跑一次）：
> `node -e "const c=require('crypto'),f=require('fs');for(const p of ['my-courses/client.js','my-courses/index.js'])console.log(p,f.readFileSync(p,'utf8').split('\n').length,c.createHash('sha256').update(f.readFileSync(p)).digest('hex').slice(0,12))"`

## 0. 改动点速查锚点总表（A1–A26）

| # | 锚点（文件:行） | 现状（已在基线里核实） | 本批动作 |
| --- | --- | --- | --- |
| A1 | `client.js:34` `const STORAGE_KEY = 'dsh.my-courses.v2'` | 单一存储键，版本号写在值里的 `version` 字段 | 键名不动；`version` 7 → 8（零丢失的关键：**不新建键、不写 v3 键**） |
| A2 | `client.js:1052` `function normalize(source)` | 返回 `{version:7, periods, terms, research, competitions, competitionFolders, activeTermId, tags, filesRoot, image, ui}` | 返回 `version: 8`，新增 `profile` 与 `push` 两段，分别由 `normalizeProfile` / `normalizePush` 产出（§1） |
| A3 | `client.js:1143` `readState()` | `STORAGE_KEY` → 旧 `LEGACY_KEY` → `normalize(null)`，读失败不写盘 | 不动。迁移继续「读时懒迁移、写时落盘」 |
| A4 | `client.js:1161` `writeState(next)` | `try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch` + 通知订阅者 | 不动 |
| A5 | `client.js:872` `normalizeResearch(raw)` | `directions` 按 `DIRECTION_CODES` 过滤、空则兜底 `['cs.CL']`；`items` 截 60；`saved` 不截 | 保留函数与返回形状；`directions` 降级为 **`profile.directions` 的只读镜像**，唯一写入者收敛到新函数 `setDirections`（§1.4） |
| A6 | `client.js:776-789` `const DIRECTIONS = [ ['cs.CL','自然语言处理 / LLM'], …共 12 项 ]` | 方向码与 arXiv 分类码二合一，只有中文名 | 升格为**全局方向真值源**，并扩展出 `DIRECTION_FEEDS`（每方向的新闻/GitHub 查询词，§3.2）。表项结构保持「数组套数组」，避免动 `DIRECTION_CODES`（`client.js:790`） |
| A7 | `client.js:805` `const UNNAMED_FOLDER = '未命名文件夹'` | `check-logic.mjs` 抽取常量块的右界（`indexOf('const DIRECTIONS = [')` → `indexOf('const UNNAMED_FOLDER =')`） | 新常量（`MAJORS`/`DIRECTION_FEEDS`/评分权重表/`PUSH_*`）**必须**写在 A6 与 A7 之间，否则 `check-logic.mjs` 抽不到、纯函数测试直接 `function not found` |
| A8 | `client.js:4038` `toggleDirection(code)` | 只写 `research.directions`（切换式 toggle） | 改走 `setDirections(next)`；同时写 `profile.directions` 与镜像 `research.directions` |
| A9 | `client.js:4052` `refreshPapers(keywordDraft)` | `fetch('/my-courses/papers?' + {cats, q, max})`，成功写 `research.items/fetchedAt` | 不动（论文源继续复用这条路由与这个函数）；推送的论文源**独立调用同一个路由**，不写 `research.items` |
| A10 | `client.js:3710-3713` `function Page(props)` / `useState('timetable')` | 6 个页签：timetable/courses/tasks/papers/competitions/files | 新增第 7 个页签 `push`，默认值仍是 `'timetable'` |
| A11 | `client.js:4241-4247` 页签按钮组 `const tabs = h('div', {className:'mc-tabs', role:'tablist'}, …)` | 6 个 `role="tab"` 按钮；`tasks` 已示范带数字：`t('task.tab') + ' (' + urgentTasks.length + ')'` | 追加 1 个按钮，同样带未读数 `推送 (n)`（复用 `urgentTasks` 那个写法） |
| A12 | `client.js:4464` `h('style', null, CSS)` | **CSS 数组只在 `Page` 渲染时挂载**（`CSS` 声明在 `client.js:1438`） | 侧栏红点不能依赖 `CSS` 里的类（侧栏在 Page 未打开时也在渲染）；红点用**内联 style**（§6.3） |
| A13 | `client.js:4510-4521` `function PanelIcon({ size })` | 纯 SVG，只接收 `{size}`，`aria-hidden` | 外面包一层 `span` 承载红点；组件内 `useStore()` 订阅，未读数 > 0 时渲染圆点（§6.2） |
| A14 | `client.js:4527-4545` `apply(ctx)` | `slots.inject('sidebar.panellist', …)` 注册 `{name,id,order:15,locale,label}` + `PanelIcon`；`slots.inject('main', …)` 注册 `{name,key,locale,inject}` + `Page` | **不动注册**。已核实宿主侧没有 per-panel badge API（§6.1），改注册项没有任何增益 |
| A15 | `client.js:3735-3738` 30s `now` 心跳 | `setInterval(() => setNow(new Date()), 30000)`，只用于课表「今天」高亮 | 复用：同一次 tick 顺带检测跨零点并触发当日推送（§5.4），不新增定时器 |
| A16 | `index.js:23` `const CATEGORY_PATTERN = /^[a-z-]+\.[A-Z]{2}$/` | 只校验**格式**，`bogus.XX` 也能通过并打到 arXiv | 换成真白名单 `DIRECTION_CODES`（与客户端 A6 同源，R1 收敛），非法码 → `400 {ok:false,error:'BAD_CATEGORY'}` |
| A17 | `index.js:54-65` 两处 `server.register({kind:'exact', path, handler})` | `ROUTE_PATH`（POST 课表抽取）+ `PAPERS_PATH`（GET arXiv 代理） | 追加 2 条**只读 GET**：`/my-courses/news`、`/my-courses/repos`（§3.3 / §3.4），仍是 `kind:'exact'` + `ctx.effect` 包裹 |
| A18 | `index.js:302` `'user-agent': 'dsh-my-courses/1.2.0 (local study workspace)'` | 与 `package.json` 1.3.0 不一致（批次② backlog 记录） | 抽成常量 `UA = 'dsh-my-courses/1.4.0 (local study workspace)'`，三条路由共用 |
| A19 | `index.js:259` `async function handlePapers(req, res)` | 校验 method→parse url→参数裁剪→拼 query→20s `AbortController`→错误码走 HTTP 200 | 不变；新增 `handleNews` / `handleRepos` **照抄这套骨架**（同构、同错误码风格），见 §3.3/§3.4 |
| A20 | `my-courses/package.json` `version: 1.3.0` | 四行 `dsh.client.inject` 不变 | 抬到 `1.4.0`（与 A18 UA 对齐） |
| A21 | `my-courses/locale/zh.json` (302 B) / `en.json` (318 B) | 宿主侧字典，与客户端 `ZH`/`EN` 各自独立 | 两边键集对等追加（§7 清单），中文/英文逐条给 |
| A22 | `my-courses/cordis.patch.yml`（3 行） | 只有 `insert: [{id: my-courses, name: '@local/my-courses'}]` | **不动**（本批不新增插件、不新增 slot） |
| A23 | `client.js:56` `const ZH = {` / `client.js:339` `const EN = {` | 两个扁平字典，`makeT` 用 `key in ZH` 兜底 | 追加 §7 的新键，zh/en 数量必须一致（`check-client.mjs` V19 会自动比对） |
| A24 | `client.js:1438` `const CSS = [` … `client.js:1650` 数组结尾 | 手写 CSS 字符串数组，主题令牌用 `--dsw-alias-*` | 追加 §8 登记的 12 个新类，全部只用既有令牌 + `--mc-note-*` 兜底 |
| A25 | `client.js:1175/1179` `update(patch)` / `updateWith(producer)` | 统一写入口，内部 `writeState` | 推送/画像的写入全部走这两个函数，不直接碰 `localStorage` |
| A26 | `client.js:1179`(同上) → `useStore()`（`client.js:1188`） | `useSyncExternalStore(subscribe, () => state)` | 红点与推送页共用同一个 store 快照；`PanelIcon` 里也调用它（同一 React 实例，见 §6.2 证据） |

**没有改动的地方（防止实现者顺手重构）**：`check-*.mjs` 之外的构建脚本、`cordis.patch.yml`、slot 注册参数、`DIRECTION_CODES`、`PAPER_TAG_RULES`、`parseAtom`、`normalizeForDedup`、`research.saved` 语义。

## 1. 画像模型（用户诉求①）

### 1.1 结论先行

- **单专业 + 多方向（1..N）**。理由：用户原话是「专业**加**方向」，专业决定「你是谁」（只影响推荐词的措辞与专业基础词），方向决定「推什么」；论文/新闻/GitHub 的查询天然是并集，多方向才有多源多标签的意义，单选一个方向会让每日推送只有 10 条同质内容。
- 专业 **单值**（下拉 + 自定义输入），方向 **多值**（勾选，上限 4 个）。上限 4 是为了给宿主请求数封顶（§3.5 的预算表按 4 个方向算）。
- 预置列表放**客户端常量**（`client.js` 的 A6/A7 窗口内），不放 `locale/*.json`：语言文件是宿主侧字典，客户端拿不到；且 `DIRECTION_CODES` 必须与宿主白名单同源，放常量才能被 `check-logic.mjs` 抽取做纯函数测试。
- 中文名来自 `DIRECTIONS` 现有第二列（不改动既有中文名），英文名走新增 i18n 键 `dir.<code>`（§7），这样 12 个方向的 EN 不再显示中文。

### 1.2 存储形状（`state.profile`）

```js
profile: {
  major: 'cs',              // MAJORS 表里的 id；自定义时为 'custom'
  majorCustom: '',          // major === 'custom' 时生效，trim 后 ≤ 40 字
  directions: ['cs.CL'],    // 方向码数组，去重、按 DIRECTIONS 表顺序排序、上限 4、非空
  custom: [],               // 自定义方向：[{ id: 'c:<slug>', label: '<用户输入>' }]，上限 6
  keywords: '',             // 追加关键词，空格分隔，最多取前 4 个词参与打分
  updatedAt: 0              // ms；0 表示从未保存过（默认值必须可复现，禁用 Date.now() 兜底）
}
```

判定表：

| 输入 | 期望输出 |
| --- | --- |
| 完全没有 `profile` 键（v7 老数据） | `directions` 从 `research.directions` 迁移（A5 现有值，已过白名单过滤）；`major` = `'cs'`；`custom=[]`；`keywords=''`；`updatedAt=0` |
| `profile.major` 不在 `MAJORS` id 里，且不是 `'custom'` | 回落 `'cs'`，`majorCustom` 清空 |
| `profile.major === 'custom'` 但 `majorCustom` 为空 | `major` 回落 `'cs'` |
| `profile.directions` 含 `bogus.XX` | 丢弃该码（白名单 = `DIRECTION_CODES`） |
| `profile.directions` 过滤后为空 | 兜底 `['cs.CL']`（与 A5 现状一致，保证永远有可查方向） |
| `profile.directions` 有 5 个以上合法码 | 按 `DIRECTIONS` 表顺序排序后取前 4 |
| `profile.custom` 元素缺 `id`/`label`，或 `label` 空 | 丢弃该元素 |
| `profile.custom` 超过 6 个 | 截前 6（保持输入顺序） |
| `profile.keywords` 超过 200 字 | 截 200 字 |
| 同一份 `profile` 归一化两次 | 逐字节相等（幂等；见 §5.2 的幂等清单） |

### 1.3 `MAJORS` 预置表（写在 A6/A7 之间，`{id, zh, term}`）

| id | 中文 | 推荐词根 `term`（用于 GitHub/news 兜底查询） |
| --- | --- | --- |
| `cs` | 计算机 / 软件 | `computer science` |
| `ai` | 人工智能 | `artificial intelligence` |
| `ee` | 电子 / 通信 | `electronics` |
| `me` | 机械 / 自动化 | `mechanical engineering` |
| `bio` | 生物 / 医学 | `biomedical` |
| `math` | 数学 / 统计 | `mathematics` |
| `econ` | 经管 / 金融 | `quantitative finance` |
| `custom` | 自定义 | 用 `majorCustom` 原文（去掉 `["\\:*?"<>|]` 后 trim，≤ 40 字） |

`MAJORS` 只影响两处：①画像页的下拉项；②方向为空/全被丢弃时的**兜底查询词**（§3.5）。它**不参与打分**——否则跨专业无法比较，违反「确定性可复算」。

### 1.4 唯一写入口（防双真值源）

```js
function setDirections(next) {           // 唯一写 directions 的函数
  const list = normalizeDirectionList(next);
  return updateWith((current) => ({
    ...current,
    profile: { ...current.profile, directions: list, updatedAt: Date.now() },
    research: { ...current.research, directions: list },   // 兼容镜像，只读
  }));
}
```

- 调用方：`client.js:4038 toggleDirection`（A8）、画像页方向勾选、迁移兜底。
- 其余代码继续读 `research.directions`（`PapersPane`、`refreshPapers` 都不用改），因此**镜像必须与真值同步**；任何绕过 `setDirections` 直接写 `research.directions` 的改动都算越界（评审点）。
- `profile.updatedAt` 用 `Date.now()` 是对的：它是「用户动作时间」，不参与打分与幂等比较；`normalizeProfile` 对它的处理是 `Number(x)||0`，因此重复 normalize 字节一致。

## 2. 每日推送总览（用户诉求②）

### 2.1 一次推送做什么（顺序固定，便于复算）

1. 读 `profile`；`directions` 为空 → 不发起任何请求，返回 `{ok:false, error:'NO_PROFILE'}`（UI 走引导 CTA，§6.5）。
2. **论文源**：1 次 `GET /my-courses/papers?cats=<dirs.join(',')>&q=<keywords>&max=20`（复用 A9 路由；`max=20` 是因为宿主 `PAPER_LIMIT=30`，20 条足够筛）。成功 → 归一化成 `PushItem[]`（`source:'paper'`）。
3. **新闻源**：对 `directions.slice(0,3)` 每个发 1 次 `GET /my-courses/news?q=<证据词>&max=10`；最多 3 次（§3.3）。
4. **GitHub 源**：1 次 `GET /my-courses/repos?q=<主方向 query>&max=10`；若存在自定义方向，再补 1 次（上限 2 次，§3.4）。
5. 三源结果合并：`dedupe → score → filter(相关性) → sort(全序) → cap`（§4.4）。
6. 写盘：`push.items`（新）、`push.seenIds`（保留旧值，只裁长度）、`push.lastRunDay` / `push.retryAfter` / `push.sourceState`（§5）。
7. 发一条 toast：全成功 `push.done {count}`；部分成功 `push.partial {count}`（附失败源名）。

### 2.2 单源失败隔离（硬约束）

- 每个源独立 `try/catch`，记录到 `push.sourceState = { paper: {ok, at, error}, news: {...}, github: {...} }`；**任何单源失败都不得 throw 到外层**。
- 合并阶段只用成功源的结果；失败源在推送页顶部显示一条 `push.sourceFailed {source}` 提示 + 「重试」按钮（重试只重跑失败源）。
- 论文源 + 新闻源 + GitHub 全失败 → 整次记为 `failed`：`items` 保持上一次的值不覆盖为 `[]`（避免「一觉醒来推送被清空」）。

## 3. 三源抓取（全部无密钥）

### 3.1 只读路由约定（两条新路由共用）

| 项 | 规定 |
| --- | --- |
| 方法 | 仅 `GET`，其它方法 → `405 {ok:false,error:'HTTP_METHOD'}`（照抄 `index.js:260-262`） |
| 路径 | `/my-courses/news`、`/my-courses/repos`（`kind:'exact'`，与 A17 一致） |
| 返回 | 永远 HTTP 200 的 JSON：成功 `{ok:true, items:[…], fetchedAt:<ms>}`；失败 `{ok:false, error:'<大写码>_<细节>'}`（照抄 `index.js:310-320` 的风格：`ARXIV_<status>`） |
| 超时 | `AbortController` 20s + `res.on('close', () => abort.abort())`（照抄 `index.js:294-297`） |
| UA | 常量 `UA`（A18），三条路由共用 |
| 参数裁剪 | `q` 先 `.trim().slice(0,120)`、`max` 夹在 `1..20`、`limit` 由宿主常量兜底；空 `q` → `400 {ok:false,error:'NO_FILTER'}`（照抄 `index.js:277-288`） |
| 缓存 | 宿主**不做**缓存（无状态）；「每日一次」由客户端 `push.lastRunDay` 保证，因此 24h 内同一路由最多被调 5 次（§3.5） |

### 3.2 方向 → 三源映射表（`DIRECTION_FEEDS`，写在 A6/A7 之间）

每项：`{ code, arxiv: 'cs.CL', news: '<HN 查询词>', repo: '<GitHub 查询词不含 stars 过滤>' }`。`DIRECTIONS` 的 12 行原样保留，新增字段合并进同一表项（数组改对象会破坏 `DIRECTION_CODES` 的 `entry[0]`，所以**保留 `[code, zhName]` 前两位，第三位放 feeds 对象**）：

```js
const DIRECTIONS = [
  ['cs.CL', '自然语言处理 / LLM', { news: 'LLM', repo: '"large language model" OR llm' }],
  …
];
const DIRECTION_FEEDS = DIRECTIONS.map(([code, , feeds]) => ({ code, ...feeds }));
```

| 方向码 | 中文（沿用现值） | arXiv cat | news 查询词 | GitHub query（`stars:>100` 由宿主拼） |
| --- | --- | --- | --- | --- |
| `cs.CL` | 自然语言处理 / LLM | `cs.CL` | `LLM` | `"large language model" OR llm` |
| `cs.AI` | 人工智能 | `cs.AI` | `AI` | `"artificial intelligence" OR agent` |
| `cs.LG` | 机器学习 | `cs.LG` | `machine learning` | `"machine learning"` |
| `cs.CV` | 计算机视觉 | `cs.CV` | `computer vision` | `"computer vision"` |
| `cs.CR` | 安全与隐私 | `cs.CR` | `security` | `security OR privacy` |
| `cs.RO` | 机器人 | `cs.RO` | `robotics` | `robotics` |
| `cs.DB` | 数据库 | `cs.DB` | `database` | `database` |
| `cs.DC` | 分布式与系统 | `cs.DC` | `distributed system` | `distributed-systems` |
| `cs.SE` | 软件工程 | `cs.SE` | `software engineering` | `"software engineering"` |
| `cs.HC` | 人机交互 | `cs.HC` | `HCI` | `"human computer interaction"` |
| `cs.CY` | 计算与社会 | `cs.CY` | `technology ethics` | `"computational social science"` |
| `stat.ML` | 统计机器学习 | `stat.ML` | `statistics` | `statistics OR bayesian` |

自定义方向（`profile.custom`）：**没有** arXiv cat（`c:<slug>` 不是合法分类码，宿主会 400），只参与 news（`label` 原文）与 repo（`label` 原文）；打分时按方向命中处理（§4.2）。

### 3.3 新闻源：Hacker News Algolia Search API（无密钥）

- URL 模板（宿主侧）：`https://hn.algolia.com/api/v1/search?query=<encodeURIComponent(q)>&tags=story&hitsPerPage=<n>&numericFilters=created_at_i>%3E<ts>`
  - `ts` = `Math.floor(Date.now()/1000) - 30*86400`（只取最近 30 天，保证「新」）。
  - `tags=story` 排除评论/招聘/投票；`hitsPerPage = min(20, max)`。
- 响应字段路径（JSON，无需鉴权、无 CORS 依赖问题，由宿主代取以统一超时与 UA）：
  - 列表：`body.hits[]`
  - 标题：`hit.title`；兜底 `hit.story_title`（部分记录只在 `story_title`）
  - 链接：`hit.url`；为空时兜底 `'https://news.ycombinator.com/item?id=' + hit.objectID`
  - 时间：`hit.created_at_i`（**秒**，转 ms ×1000）；缺失兜底 `hit.created_at` 的 `Date.parse`
  - 摘要：`hit.story_text || hit.comment_text || ''`，去 HTML 标签后 `.slice(0, 240)`
  - 热度：`hit.points`（整数）→ 参与 §4.2 热度分
  - id：`'hn:' + hit.objectID`
- 失败码：上游 `!response.ok` → `{ok:false, error:'HN_' + response.status}`；网络/超时 → `{ok:false, error:'HN_' + messageOf(error)}`；`body.hits` 不是数组 → `HN_SHAPE`。
- 为什么不用需 key 的源：NewsAPI / GNews / Bing News 一律要 API key（且免费档禁止商用、限 100 次/天）；RSS 源（如 arXiv RSS、Nature RSS）字段非结构化、CORS 与编码不稳定、且大多数站点已下线 RSS。HN 是公开、无 key、结构化 JSON、全球可达、限流宽松（约 10k 请求/小时/IP）——本批每日最多 3 次，余量 3000 倍以上。

### 3.4 GitHub 源：Search Repositories（无 token）

- URL 模板（宿主侧）：`https://api.github.com/search/repositories?q=<encodeURIComponent(q + ' stars:>100')>&sort=stars&order=desc&per_page=<n>`
  - 固定请求头：`Accept: application/vnd.github+json`、`X-GitHub-Api-Version: 2022-11-28`、`user-agent: UA`（GitHub 对无 UA 请求直接 403）。
  - `n = min(20, max)`，客户端传 10。
- 响应字段路径：`body.items[]`；`full_name`→标题、`html_url`→url、`description`→摘要（`.slice(0,240)`）、`pushed_at`→`publishedAt`（**用 pushed_at 不用 created_at**：老库仍在活跃才值得推）、`stargazers_count`→热度、`topics[]`→tags、`language`→tag。id：`'gh:' + item.id`。
- 时效门槛：`pushed_at` 早于 `now - 180 天` 的直接丢弃（宿主侧过滤，减少传输）。
- 限流规划（无 token 官方额度：搜索 10 次/分钟、60 次/小时/IP）：
  - **每次推送最多 2 次请求**（主方向 1 次 + 自定义方向 1 次），且两次串行、间隔 ≥ 1200ms（`await sleep(1200)`）。10 次/分钟的窗口 ⇒ 2 次串行远低于额度；60 次/小时 ⇒ 一天 2 次，余量 30 倍。
  - 若用户在 1 小时内反复点「重试」：客户端 `push.retryAfter` 把自动重试压到 30 分钟一次（§5.3）；手动重试允许，但**同一次运行内不重试 GitHub**（一次运行 = 一次请求机会，失败就等下一轮），因此即使连点 10 次也才 10 次请求，仍在 60/h 内。
  - 读限流响应头：`x-ratelimit-remaining === '0'` → 返回 `{ok:false, error:'GITHUB_RATE'}`，客户端展示「触发 GitHub 限流，稍后自动重试」并**保留上次结果**；`403`/`429` 一律映射为 `GITHUB_RATE`，不做指数退避（无状态宿主不做重试，交给下一个自然日）。
- 为什么不用 token 的替代源（GitHub Trending 无官方 API；`github-trending-api` 等第三方站点不稳定且不可信）：无 token 的官方 search API 是唯一有 SLA 承诺的稳定来源。

### 3.5 请求预算表（每次推送，硬上限）

| 源 | 路由 | 次数上限 | 上游 | 单次超时 |
| --- | --- | --- | --- | --- |
| 论文 | `GET /my-courses/papers` | 1 | `export.arxiv.org/api/query` | 20s |
| 新闻 | `GET /my-courses/news` | 3（`directions.slice(0,3)`） | `hn.algolia.com/api/v1/search` | 20s |
| GitHub | `GET /my-courses/repos` | 2（主方向 + 自定义方向） | `api.github.com/search/repositories` | 20s |

最坏情况 6 次串行请求 × 20s = 120s；实测常态 < 8s。并发度：**论文与新闻并行（`Promise.allSettled`），GitHub 最后串行**（避免和新闻抢带宽，也让 GitHub 的 1.2s 间隔不影响首屏）。方向为空/无画像 → 0 次请求。

## 4. 确定性评分（质量门槛，用户诉求③）

### 4.1 `PushItem` 统一结构（`normalizePushItem`，纯函数）

```js
{ id, source: 'paper'|'news'|'github', title, summary, url,
  publishedAt: 0,          // ms，缺失 0（不得用 Date.now() 兜底）
  tags: [],                // ≤4 个，按 key 去重后按字母序（确定性）
  directions: [],          // 命中的方向码（paper：primaryCategory/category；news/github：查询所属方向）
  metrics: { hot: 0 },     // paper: 0；news: points；github: stargazers_count
  score: 0, reasons: [] }  // 由 scoreItem 填充
```

判定表：

| 输入 | 期望输出 |
| --- | --- |
| `id` 空 | 丢弃该条（返回 `null`） |
| `url` 非 `http(s)://` 开头 | 丢弃（防止 `javascript:` 注入） |
| `title` 空 | 用 `summary.slice(0,80)`；仍空则丢弃 |
| `publishedAt` 是 ISO 字符串 | `Date.parse` 后 `||0` |
| `publishedAt` 在未来（> now + 1 天） | 保留原值但不因此加分（见 `ageDays` 的负数分支） |
| `metrics.hot` 非数字/负数 | 归 0 |
| 同一输入两次归一化 | 逐字段相等（幂等） |

### 4.2 `scoreItem(item, profile, now)` —— 纯函数，整数运算，无 `Math.log`/无 `toLocaleString`/无随机

```js
dirHits   = item.directions 里命中的 profile.directions 个数（含 custom 命中数）
dirScore  = dirHits === 0 ? 0 : Math.min(50, 40 + 5 * (dirHits - 1))
kwWords   = profile.keywords.split(/\s+/).filter(Boolean).slice(0, 4)
kwHits    = 标题+摘要（小写）里包含的 kwWords 个数（CJK 走 indexOf 子串匹配）
kwScore   = Math.min(24, 8 * kwHits)
ageDays   = publishedAt > 0 ? Math.floor((now - publishedAt) / 86400000) : null
freshScore= ageDays === null || ageDays < 0 ? 0
          : ageDays <= 2 ? 25 : ageDays <= 7 ? 18 : ageDays <= 14 ? 10 : ageDays <= 30 ? 4 : 0
srcScore  = { paper: 20, news: 12, github: 10 }[item.source] ?? 0
hotScore  = 阶梯表（禁用 Math.log10：不同引擎末位可能不同）
            hot < 1 → 0 | 1..4 → 2 | 5..19 → 4 | 20..99 → 6 | 100..499 → 8 | 500..1999 → 10 | ≥2000 → 12
score     = dirScore + kwScore + freshScore + srcScore + hotScore      // 0..131
reasons   = 按固定顺序过滤出的 i18n key：
            dirScore>0 → 'push.reason.direction'；kwScore>0 → 'push.reason.keyword'
            freshScore>=10 → 'push.reason.fresh'；hotScore>=6 → 'push.reason.hot'
```

权重理由（写进代码注释，评审要看）：`dirScore` 最高 50 是「相关性优先」；`srcScore` 20/12/10 的梯度让**同相关性时论文 > 新闻 > 仓库**（用户先提论文），但差距足够小，热点新闻仍能反超；`freshScore` 25 让「今天的新东西」必然压过「陈年高分」；`kwScore` 只作加成，永不让关键词单独构成推荐（否则 `kw` 会污染整个列表）——因此 **相关性门槛 = `dirScore > 0 || kwScore > 0`**，不满足者不进榜（这也是「质量门槛」的硬闸）。

### 4.3 去重与全序（`rankPushItems(items, profile, now)`）

1. `normKey = title.toLowerCase().replace(/[^0-9a-z\u4e00-\u9fa5]+/g, '')`；同 `normKey` 或同 `id` 只留第一个（**输入顺序固定：paper → news → github，源内按上游顺序**，因此去重结果确定）。
2. 打分后过滤 `dirScore > 0 || kwScore > 0`。
3. 排序（全序，保证任意输入集合的渲染顺序唯一）：
   `score` 降序 → `publishedAt` 降序（0 排最后）→ `sourceRank` 升序（paper 0 / news 1 / github 2）→ `id` **按字节**升序（`a < b ? -1 : 1`，**禁用 `localeCompare`**：它是 locale 相关的，不满足可复算）。
4. 截断：总上限 `PUSH_ITEM_MAX = 15`；同时单源上限 `PUSH_PER_SOURCE_MAX = 6`（遍历排序结果按源计数取满即跳）。两者都满足后停止。
5. 返回**新数组**，元素是浅拷贝并带上 `score`/`reasons`；不修改入参（复算两次结果相等）。

### 4.4 判定表（实现者照此写测试）

| 输入 | 期望输出 |
| --- | --- |
| 同标题大小写/标点不同的两条（不同源） | 只剩先出现的那条（paper 优先） |
| 方向命中 1 个、hot 0、今天发布 | `score = 40 + 0 + 25 + 20 + 0 = 85`（paper） |
| 方向未命中、关键词命中 1 个、30 天前 | 通过门槛（`kwScore=8>0`），`score = 0+8+4+20+0 = 32` |
| 方向未命中、关键词未命中 | 被过滤，不进 `items` |
| 45 天前发布、命中 2 个方向、GitHub、120 stars | `dirScore=45, fresh=0, src=10, hot=8` → 63 |
| `now` 固定、同一批输入调用两次 | 两次返回数组的 `JSON.stringify` 完全相同 |
| 同一源 8 条都命中 | 只留 6 条（`PUSH_PER_SOURCE_MAX`） |
| 三源共 30 条高分 | 只留 15 条（`PUSH_ITEM_MAX`） |

### 4.5 「为什么推荐给你」

- 卡片底部渲染 `reasons.map(key => h('span', {className:'mc-reason'}, t(key)))`，即 §7 的 4 个 key，顺序固定为 方向→关键词→新鲜→热度。
- 卡片右上角显示 `t('push.score') + ' ' + item.score`（一个整数，不是星级、不是百分比——整数才能被复算比对）。
- **不出现任何「AI 认为」「模型判断」字样**；理由全部来自可复算的维度命中。

## 5. 每日一次守卫（`state.push`）

### 5.1 状态形状（`normalizePush(raw)`，纯函数）

```js
push: {
  lastRunDay: '',        // 'YYYY-MM-DD'，本地日；'' = 从未成功跑完
  lastRunAt: 0,          // ms，最近一次成功结束的时刻（用于时钟回拨检测）
  retryAfter: 0,         // ms，早于此刻不自动重试（部分失败后 = now + 30min）
  items: [],             // PushItem[]，≤ PUSH_ITEM_MAX(15)，已排序
  seenIds: [],           // 已读 id，FIFO，上限 500
  sourceState: { paper: {ok:false, at:0, error:''}, news: {…}, github: {…} },
  lastError: ''          // '', 'NO_PROFILE', 'ALL_SOURCES_FAILED', 'GITHUB_RATE' …
}
```

判定表：

| 输入 | 期望输出 |
| --- | --- |
| 无 `push` 键（v7 老数据） | 上述默认值原样（`lastRunDay=''` ⇒ 首次打开即触发一次推送） |
| `lastRunDay` 不是 `^\d{4}-\d{2}-\d{2}$` | 归 `''`（允许重跑） |
| `items` 元素缺 `id`/`title` | 用 §4.1 的 `normalizePushItem` 过滤，丢弃后重新 `rankPushItems` 排序（保证读盘顺序与写盘顺序一致） |
| `items` 超过 15 | 截前 15（已排序） |
| `seenIds` 超过 500 | 保留**后** 500（最近的） |
| `seenIds` 里存在已不在 `items` 里的 id | 保留（跨天去重也需要它；只是长度截断） |
| `retryAfter` 是非数字 | 归 0 |
| 重复 normalize | 字节一致 |

### 5.2 幂等清单（「重复迁移字节一致」的可验证定义）

实现后必须满足：`JSON.stringify(normalize(normalize(raw))) === JSON.stringify(normalize(raw))`，对以下 4 个样本都要成立：①纯 v7 数据（无 `profile`/`push`）②含 `profile` 的 v8 ③「半迁移」：有 `profile` 但 `profile.directions` 为空且 `research.directions` 有值 ④`profile.custom` 有脏数据 + `push.items` 未排序。

为此 5 条硬规则：
1. 所有默认值都是**常量**（`0` / `''` / `[]`），禁用 `Date.now()`、`uid()`、`Math.random()` 作兜底。
2. 数组一律显式排序或显式截断（`directions` 按 `DIRECTIONS` 表顺序；`items` 按 §4.3 全序；`seenIds` 按写入顺序）。
3. 数字一律 `Number(x) || 0`，字符串一律 `String(x || '')`，布尔不新增。
4. `normalize` 的输出**只包含契约里列出的键**，不 spread 原始对象（否则未知键会把脏数据带进输出、导致二次 normalize 变化）。
5. 「未知键保留」指**不删除**：`normalize` 把它们挡在输出之外，但 `writeState` 写的是 `normalize` 的结果，因此旧数据里本插件不认识的键（历史遗留/未来版本回退）**会丢**。这一点必须在实现时显式处理：`readState` 先取原始 JSON 的顶层键集合，`writeState` 前合并 `{...unknownKeysFromRaw, ...next}`（3 行，放 `client.js:1161` 内）。判定表见下：

| 输入 | 期望输出 |
| --- | --- |
| 原始 JSON 含 `futureFlag: 1`（本插件不认识） | 一次写入后 `futureFlag` 仍在存储里且值不变 |
| 原始 JSON 是 `null`/解析失败 | 走 `normalize(null)`，不写盘、不抛 |

### 5.3 时钟边界与触发规则

- **本地日**：`isoDate(new Date())`（`client.js:681`，内部用 `getFullYear/getMonth/getDate`）。**不用 UTC**：用户作息与中国时区绑定，用 UTC 会让「今天」在早上 8 点才翻篇，出现「凌晨打开看到昨天的推送、白天第二次打开又重跑」的错位；而 `isoDate` 已是本插件全库统一的日期序列化函数（`startOfDay`/`mondayOf`/`dateOfText` 同族），复用才不引入第二种日界定义。
- **跨对方比较**：`'YYYY-MM-DD'` 是字典序可比字符串，`isoDate(now) !== push.lastRunDay` 即可判定「该跑」；不做毫秒算术，天然免疫 DST（中国无 DST，但仍不依赖）。
- **时钟回拨/时区切换**：若 `push.lastRunAt > 0 && now < push.lastRunAt - 3600000`（回拨超过 1 小时）→ 视为时钟异常，重置 `lastRunDay=''`、`retryAfter=0`，允许重跑（否则用户永远等不到推送）。
- **同日第二次打开**：`lastRunDay === 今日` ⇒ **不发任何请求**（这是硬断言，评审要验）。
- **休眠唤醒**：醒来后 `now` 心跳（A15，30s 一次）触发重算；若已跨零点则视为新的一天，照常跑一次。
- **并发/重复点击**：模块级 `let pushBusy = false`（不是 state，避免多写一次盘）。进入时置 `true`，`finally` 置 `false`；`pushBusy === true` 时所有触发直接 return。UI 的「刷新」按钮同时用 state 里的 `busy` 置灰（双保险：一个防逻辑重入，一个防视觉重复点击）。

### 5.4 触发点（共 3 个，无宿主调度器）

| 触发 | 位置 | 条件 |
| --- | --- | --- |
| 打开面板（`Page` 挂载） | `client.js:3710` 附近 `useEffect(…, [])` | `pushIsDue(push, now) && now >= push.retryAfter` |
| 30s 心跳 | `client.js:3735` 那个 `setInterval` 的回调里（A15） | 同上（覆盖「页面开着跨零点」） |
| 手动「立即刷新」 | 推送页按钮 | 忽略 `retryAfter`，但仍守 `pushBusy` |

`pushIsDue(push, now)` 是纯函数（供 `check-logic.mjs` 测）：`isoDate(now) !== push.lastRunDay || (push.lastRunAt > 0 && now < push.lastRunAt - 3600000)`。

### 5.5 失败处理（结论：失败不记「今日已跑」）

| 场景 | `lastRunDay` | 其它写入 | 用户可见 |
| --- | --- | --- | --- |
| 三源全成功 | = 今日 | `retryAfter = 0`，`lastError = ''` | toast `push.done` |
| 部分源成功（≥1 源有结果） | **不写** | `retryAfter = now + 30*60000`；`items` 用本次成功的条目（合并 + 重排）；`lastError = ''` | 顶部 `push.partial`+失败源提示；红点照常亮 |
| 三源全失败 | **不写** | `retryAfter = now + 30*60000`；**`items` 原样保留**；`lastError = 'ALL_SOURCES_FAILED'` | 顶部失败条 + 「重试」 |
| 未设画像（`NO_PROFILE`） | 不写 | 不发请求 | 引导 CTA（§6.5） |

「部分成功也不写 `lastRunDay`」的理由：`lastRunDay` 的语义是「今天的推送已经完整跑过了」，写早了会让失败源到明天才重试；而 30 分钟的 `retryAfter` 已经把重试频率压到每天 ≤48 次最坏情况，且每次只有失败源那 1–2 次请求，不会撞限。**「失败不落 `lastRunDay`」是本批的验收硬点。**

## 6. UI 落点与侧栏红点

### 6.1 侧栏能力核实结论（先说结论，附证据）

**宿主侧没有 per-panel badge API。** 证据（读的是打包产物 `resources/app.asar` 里的 `dsh/node_modules/@deepseek-ai/dsh-client-ui-sidebar/lib/client.js`，版本 `0.2.1-rc.5`；用 `node` 解 asar 头 + 提取单文件，未修改任何东西）：

| 事实 | 位置 | 含义 |
| --- | --- | --- |
| slot 声明为 `children: { 'sidebar.panellist': {kind:'list', scope:'root'}, 'sidebar.panellist.actions': {kind:'list'}, 'sidebar.toggle.badge': {kind:'single', scope:'root'}, … }` | `lib/client.js:617-640` | 面板列表是 list slot；`toggle.badge` 是**顶栏展开按钮**上的单槽，不是面板行 |
| 面板行渲染：`button` → `span.panelGlyph` → `renderSlot('sidebar.panellist', {size, active}, {only: id})` + `span.panelTitle` | `lib/client.js:205-235` | 图标组件只收到 `{size, active}`；**没有 `badge`/`indicator`/`count` 属性** |
| 面板元数据同步：`{id, order: options.order ?? 0, label: resolveSlotLabel(options.label) ?? id}` | `lib/client.js:566-582` | 注册项里多写的键会被丢弃，因此「在注册参数里塞 badge」无效 |
| `.panelGlyph{display:inline-flex;justify-content:center;align-items:center}`、`.panelRow{display:flex;align-items:center;min-height:36px}` | 同上 CSS 段 | 两者都**没有** `overflow:hidden`、也**没有** `position` | 
| `sidebar.toggle.badge` 只在折叠态渲染在展开按钮上 | `lib/client.js:363,379` | 语义是「整个侧栏有更新」，放我们自己的未读数属于误用 |

⇒ 结论：**红点必须由我方图标组件自己画**。可行，因为父级无 `overflow:hidden`，我方 `span` 上写 `position:relative` + 子元素 `position:absolute` 不会被裁切；且 `PanelIcon` 与 `Page` 在**同一个 React 实例**里（同一个模块加载器、同一个 `react` 单例），所以 `PanelIcon` 内可以直接调用模块级 `useStore()`（`client.js:1188`）订阅状态。

### 6.2 `PanelIcon` 改法（`client.js:4510-4521`，A13）

```js
function PanelIcon(props) {
  const size = props && props.size;
  const edge = typeof size === 'number' ? size : 20;
  const state = useStore();                       // 同一 React 实例，安全
  const unread = pushUnreadCount(state.push);     // 纯函数
  const svg = h('svg', { viewBox: '0 0 24 24', width: edge, height: edge, fill: 'none', 'aria-hidden': true, style: { display: 'block' } }, …原样…);
  if (unread <= 0) return svg;                    // 未读为 0 时输出与现状完全一致
  return h('span', { style: { position: 'relative', display: 'inline-flex' }, 'data-mc-unread': String(unread) },
    svg,
    h('span', {                                 // 红点：内联样式，因为 CSS 数组只在 Page 渲染时挂载（A12）
      'aria-hidden': true,
      'data-mc-dot': 'push',
      style: {
        position: 'absolute', top: '-2px', right: '-2px',
        width: '8px', height: '8px', borderRadius: '50%',
        background: 'var(--dsw-alias-state-business-primary, var(--dsw-alias-state-error-primary, #4d6bfe))',
        boxShadow: '0 0 0 2px var(--dsw-specific-sidebar-fill, transparent)',
        pointerEvents: 'none',
      },
    }));
}
```

- 令牌都已在本插件里用过：`--dsw-alias-state-error-primary`（`client.js:1622` 的 `.mc-toast[data-tone=error]`）、`--dsw-specific-sidebar-fill`（`client.js:1485-1500` 主题段），因此不存在「令牌不存在」的猜测风险。
- `pushUnreadCount(push)` 纯函数：`push.items.filter(item => push.seenIds.indexOf(item.id) < 0).length`。
- 无障碍：红点是装饰（`aria-hidden`），信息载体是页签文字 `推送 (n)`（A11），因为 `label` 是注册期解析成字符串的（`syncPanels` 在 `lib/client.js:566-582`），不会随 store 变化重算 —— **不要在 `label` 里塞动态计数**（会一直显示首次值，属于已知坑，写进 §9 非目标）。

### 6.3 降级方案（若评审认为改动图标组件风险高）

同一份 `pushUnreadCount` 直接喂给页签（A11 的 `推送 (n)`）与推送页卡片角标（`.mc-badge`，`client.js:1638`），红点组件可延迟删掉——两者读同一个纯函数，不影响任何验收项。**但默认仍实现 §6.2**：用户明确要「侧栏红点」。

### 6.4 UI 落点结论：新增第 7 个页签「推送」

理由：①论文页签已有自己的筛选/标签栏，塞子页会让 `PapersPane`（`client.js:2326-2410`）职责翻倍；②首页（timetable）是课表语义，夹推送卡片会破坏「一眼看今天课」；③推送页要同时承载「画像设置 + 今日推送 + 来源状态」，独立页最省改动，且天然获得「打开即触发」的时机（§5.4）。

页面结构（自上而下，全部在 `mc-page` 容器内，复用既有 `h`/`section` 写法）：

| 区块 | 内容 | 空/异常态 |
| --- | --- | --- |
| 画像卡 `.mc-profile` | 专业下拉（`MAJORS`）+ 自定义输入（`major==='custom'` 时显示）+ 方向多选 chips（12 个 + 自定义项）+ 关键词输入 + 「保存」 | 未保存过：chips 全未选中，顶部一行 `profile.hint` |
| 来源状态条 `.mc-push-sources` | 三源各一格：名字 + 上次结果（`ok`/`failed`/`never`）+ 时间 | 从未跑：显示 `push.neverRun` |
| 今日推送列表 | 卡片：标题（`a href`）、来源徽标 `.mc-src`（论文/新闻/仓库，文案走 `push.source.*`）、发布时间、`tags`、`reasons`、`score` | 无画像 → 引导 CTA；有画像但 0 条 → `push.empty` + 「降低门槛提示」文案 |
| 加载态 | 列表区在 `busy` 时替换为 3 个骨架条 `.mc-push-skeleton`，按钮置灰 + `push.running` | — |
| 失败态 | 顶部 `.mc-note`（`data-tone="error"` 风格，复用 `client.js:1621` 的 toast 令牌）显示 `push.failed {error}` + 「重试」 | — |

### 6.5 未设画像的引导 CTA

- 判定：`profile.updatedAt === 0` 视为「从未保存」（不是「没方向」——方向永远兜底 `cs.CL`）。
- 第一屏直接展示画像卡的展开态，并在列表区渲染一段引导：`push.needProfile` + 跳到画像卡的按钮（`document.getElementById('mc-profile-card').scrollIntoView({block:'nearest'})`）。
- 此时**不发任何请求**（`NO_PROFILE` 分支，§2.1 步骤 1），因此不会用默认方向偷偷生成一份「不是你选的内容」的推送。

## 7. i18n 键清单（zh/en 对等）

规则：
1. 只新增 4 个命名空间：`profile.*`、`push.*`、`dir.*`、`major.*`。**不新增任何 `folder.*` 键**（批次② 已用 `competition.folder.*`，本批与之无交集，避免前缀歧义）。
2. 追加位置：客户端 `ZH`（`client.js:56` 起）与 `EN`（`client.js:339` 起）各追加一份，**键集与顺序完全一致**；宿主侧 `my-courses/locale/zh.json` / `en.json` 同步追加（A21）。`check-client.mjs` 的 V19 会比对 zh/en 键集，少一个就红。
3. 占位符只用 `format()` 支持的 `{name}` 形式（`client.js:1201`）。
4. 12 个方向的英文名走 `dir.<code>`（键里带点没关系，`makeT` 是扁平查表；例如 `dir.cs.CL`）。

### 7.1 客户端字典（zh / en 逐条）

| key | zh | en |
| --- | --- | --- |
| `push.tab` | 推送 | Feed |
| `push.title` | 今日推送 | Today's picks |
| `push.subtitle` | 按你的专业与方向，每天挑一次 | Picked once a day for your major & directions |
| `push.refresh` | 立即刷新 | Refresh now |
| `push.running` | 正在抓取… | Fetching… |
| `push.done` | 已更新 {count} 条 | Updated {count} items |
| `push.partial` | 部分来源失败，已更新 {count} 条 | Some sources failed, {count} items updated |
| `push.failed` | 推送失败：{error} | Feed failed: {error} |
| `push.retry` | 重试失败来源 | Retry failed sources |
| `push.neverRun` | 还没跑过 | Not run yet |
| `push.lastRun` | 上次：{day} | Last run: {day} |
| `push.empty` | 今天没有够格的条目 | Nothing passed the bar today |
| `push.emptyHint` | 可以再多选一个方向，或加一个关键词 | Try adding a direction or a keyword |
| `push.needProfile` | 先设置专业和方向，才会开始每日推送 | Set your major and directions to start the daily feed |
| `push.gotoProfile` | 去设置 | Set up |
| `push.score` | 匹配分 | Score |
| `push.source.paper` | 论文 | Paper |
| `push.source.news` | 新闻 | News |
| `push.source.github` | 仓库 | Repo |
| `push.sourceFailed` | {source} 来源失败：{error} | {source} source failed: {error} |
| `push.rateLimited` | GitHub 触发限流，稍后自动重试 | GitHub rate limit hit, will retry later |
| `push.unread` | {count} 条未读 | {count} unread |
| `push.markSeen` | 全部标为已读 | Mark all read |
| `push.reason.direction` | 命中方向 | Matches your directions |
| `push.reason.keyword` | 命中关键词 | Contains your keywords |
| `push.reason.fresh` | 近期发布 | Published recently |
| `push.reason.hot` | 社区热度高 | Popular |
| `profile.title` | 我的专业与方向 | My major & directions |
| `profile.hint` | 存放在本机，只用来筛选推荐 | Stored locally, only used to filter picks |
| `profile.major` | 专业 | Major |
| `profile.majorCustom` | 自定义专业名 | Custom major |
| `profile.directions` | 关注方向 | Directions |
| `profile.directionsHint` | 最多选 4 个 | Up to 4 |
| `profile.custom` | 自定义方向 | Custom direction |
| `profile.customAdd` | 添加 | Add |
| `profile.customRemove` | 删除 | Remove |
| `profile.keywords` | 追加关键词 | Extra keywords |
| `profile.keywordsHint` | 空格分隔，最多生效 4 个 | Space separated, first 4 count |
| `profile.save` | 保存 | Save |
| `profile.saved` | 已保存 | Saved |
| `profile.reset` | 恢复默认 | Reset |
| `profile.limit` | 最多 {count} 个 | Up to {count} |
| `major.cs` | 计算机 / 软件 | Computer science |
| `major.ai` | 人工智能 | Artificial intelligence |
| `major.ee` | 电子 / 通信 | Electronics |
| `major.me` | 机械 / 自动化 | Mechanical engineering |
| `major.bio` | 生物 / 医学 | Bio & medicine |
| `major.math` | 数学 / 统计 | Math & statistics |
| `major.econ` | 经管 / 金融 | Econ & finance |
| `major.custom` | 自定义 | Custom |
| `dir.cs.CL` | 自然语言处理 / LLM | NLP / LLM |
| `dir.cs.AI` | 人工智能 | AI |
| `dir.cs.LG` | 机器学习 | Machine learning |
| `dir.cs.CV` | 计算机视觉 | Computer vision |
| `dir.cs.CR` | 安全与隐私 | Security & privacy |
| `dir.cs.RO` | 机器人 | Robotics |
| `dir.cs.DB` | 数据库 | Databases |
| `dir.cs.DC` | 分布式与系统 | Distributed systems |
| `dir.cs.SE` | 软件工程 | Software engineering |
| `dir.cs.HC` | 人机交互 | HCI |
| `dir.cs.CY` | 计算与社会 | Computing & society |
| `dir.stat.ML` | 统计机器学习 | Statistical ML |

合计 **62 个新键**（`push.*` 27 + `profile.*` 15 + `major.*` 8 + `dir.*` 12）。zh/en 各 62 条，数量相等；`check-client.mjs` V19 会自动校验。

### 7.2 宿主侧字典（`my-courses/locale/*.json`）

宿主只用到面板名与错误码文案，追加 3 条即可（键名与客户端同风格，但宿主字典是独立命名空间）：

| key | zh | en |
| --- | --- | --- |
| `feed.panel` | 推送 | Feed |
| `feed.error.rate` | 请求过于频繁 | Too many requests |
| `feed.error.upstream` | 上游服务不可用 | Upstream unavailable |

（宿主 `index.js` 目前已直接返回英文错误码字符串、不查字典；本批**不改变**这个既有做法，这 3 条只为 `locale/*.json` 与面板标签预留，若实现者发现宿主用不到可只加 `feed.panel`，但 zh/en 必须同步。）

## 8. CSS 新类登记（追加到 `client.js:1438` 的 `CSS` 数组末尾，`client.js:1650` 之前）

全部令牌只用既有主题令牌 + `--mc-note-*` 兜底（令牌来源：`client.js:1485-1500` 主题段，含 `--dsw-alias-bg-layer-2`、`--dsw-alias-border-l2`、`--dsw-alias-label-secondary`、`--dsw-alias-label-tertiary`、`--dsw-alias-interactive-bg-hover`、`--dsw-specific-sidebar-fill`、`--dsw-alias-state-business-primary`、`--dsw-alias-state-error-primary`）。

| 类名 | 用途 | 关键属性（照写） |
| --- | --- | --- |
| `.mc-push` | 推送页外层 | `display:flex;flex-direction:column;gap:12px` |
| `.mc-push-sources` | 来源状态条 | `display:flex;gap:8px;flex-wrap:wrap` |
| `.mc-push-source` | 单源状态格 | `display:flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-tertiary, #8a8f99)` |
| `.mc-push-list` | 卡片列表 | `display:flex;flex-direction:column;gap:10px` |
| `.mc-push-card` | 单条卡片 | `border:1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08));background:var(--dsw-alias-bg-layer-2, transparent);border-radius:10px;padding:10px 12px` |
| `.mc-push-card-head` | 卡片头（标题 + 分数） | `display:flex;justify-content:space-between;gap:10px;align-items:baseline` |
| `.mc-push-title` | 标题链接 | `font-weight:600;font-size:13px;line-height:1.45;color:inherit;text-decoration:none` |
| `.mc-push-meta` | 来源/时间/标签行 | `display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--dsw-alias-label-secondary, #6b7280);margin-top:6px` |
| `.mc-push-src` | 来源徽标 | `font-size:11px;padding:1px 6px;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05))` |
| `.mc-push-reasons` | 理由行 | `display:flex;gap:6px;flex-wrap:wrap;margin-top:6px` |
| `.mc-reason` | 单条理由 | `font-size:11px;padding:1px 6px;border-radius:6px;background:var(--mc-note-bg, var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05)));color:var(--dsw-alias-label-secondary, #6b7280)` |
| `.mc-push-skeleton` | 加载骨架 | `height:56px;border-radius:10px;background:var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.05));opacity:.6` |
| `.mc-profile` | 画像卡 | `border:1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08));border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:10px` |
| `.mc-profile-chips` | 方向 chips 容器 | `display:flex;gap:6px;flex-wrap:wrap` |
| `.mc-profile-chip` | 方向 chip（可复用 `.mc-chip` 基类） | `font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2, rgba(0,0,0,.08));cursor:pointer;background:transparent` |
| `.mc-profile-chip[data-on="1"]` | 选中态 | `background:var(--dsw-alias-state-business-primary, #4d6bfe);color:#fff;border-color:transparent` |

合计 16 个新类（§8 表格全量登记，实现时逐个落地）。移动端：`.mc-push-meta` 已在 `@media (width<=820px)`（`client.js:1650`）内被既有规则覆盖，无需新增媒体查询。

## 9. 本批明确不做的事（非目标）

1. **不调 LLM**。评分是 §4.2 的整数算式，`AI_PROMPT`（`client.js:622`）与本批无关，不新增任何模型调用、不新增密钥、不读环境变量。
2. **不接需要密钥/付费的数据源**：不接 OpenAlex、Semantic Scholar、NewsAPI、GNews、Bing、Google Scholar、Twitter/X、Reddit OAuth。只用 arXiv（既有）+ HN Algolia + GitHub 匿名 search API。
3. **不做主机常驻调度器**：不写 cron、不注册 `ctx.setInterval`、不做后台轮询、不发系统通知。每日一次由「打开页面 + 30s 心跳」在客户端判定（§5.4）。
4. **不建磁盘文件夹、不写导出文件**：`filesRoot` / `showDirectoryPicker`（`client.js:2949`）相关逻辑一律不碰。
5. **不改侧栏插件的注册参数来求 badge**：已核实无此能力（§6.1）；也不去 patch `@deepseek-ai/dsh-client-ui-sidebar`（那是宿主包，改它属于越界且会被升级覆盖）。
6. **不在 `label` 里塞动态未读数**：`syncPanels` 只在 locale 变化时重算 `label`（`lib/client.js:566-582`），动态值会永久停在首次解析结果（§6.2 已说明原因）。
7. **不改 `check-*.mjs` 之外的构建/发布文件**：`cordis.patch.yml`、`package.json` 的 `dsh.client.inject`、slot 注册形状全部不动（除 `package.json` 版本号 1.3.0→1.4.0）。
8. **不重命名/删除任何既有存储键与既有字段**：`research.items`、`research.saved`、`research.directions`、`competitions`、`competitionFolders`、`plan`、`terms` 全部保留原语义；`version` 是唯一被升级的字段。
9. **不做推送历史/归档**：只保留「今天这一批」（15 条上限），不建 `push.history`、不建「收藏推送」；想留住某条就用既有的论文收藏（`research.saved`）路径，本批不扩展它。
10. **不做已读回执的后端同步**：`seenIds` 只在本机 `localStorage`，不联网。
11. **不做跨设备同步、不做账号体系**。
12. **不改批次①② 的规格文档**（`t1-spec/batch1-spec.md`、`batch2-spec.md` 只读参考）。

## 10. 实现顺序（6 步，含重启约束）

> **重启约束（必须写进实现者的开工提示）**：`my-courses/index.js`、`my-courses/package.json`、`my-courses/locale/*.json`、`my-courses/cordis.patch.yml` 的任何改动**都要重启桌面应用才生效，而重启会终止当前 Agent 会话**；只有 `my-courses/client.js` 靠刷新即可生效。
> ⇒ **宿主文件与客户端文件必须全部落盘后再做唯一一次重启**，禁止「先交付宿主、重启、再交付客户端」两段式。因此步骤顺序是「先客户端（可分段验证）→ 再宿主 → 再语言文件 → 最后统一重启 → 重跑三套自检」。

### 步骤 1：常量与纯函数（`client.js` 单文件，可独立自检）

- 文件：`my-courses/client.js`
- 动作：在 `client.js:776-805` 之间（A6/A7 窗口内）加 `MAJORS`、`DIRECTIONS` 第三位 feeds、`DIRECTION_FEEDS`、`PUSH_ITEM_MAX`、`PUSH_PER_SOURCE_MAX`、`PUSH_SEEN_MAX`、`PUSH_RETRY_MS`、`SOURCE_RANK`、`HOT_TIERS`、`FRESH_TIERS`、`PUSH_STATE_DEFAULT`；在既有 helper 区（`client.js:632-700` 附近、`dateOfText` 之后）加 2 空格缩进**顶层** `function`：`normalizeDirectionList`、`normalizeProfile`、`normalizePushItem`、`normalizePush`、`scoreItem`、`rankPushItems`、`pushNormKey`、`pushUnreadCount`、`pushIsDue`、`pushDayOf`。
- **抽取契约（易错点）**：`check-logic.mjs` 用 `source.indexOf('\t\tfunction ' + name + '(')` + `source.indexOf('\n\t\t}\n', start)` 定位函数体，因此每个新函数**必须是两 Tab 缩进的 `function` 声明、不能是 `const x = () =>`**、函数体末尾必须是独立成行的 `\t\t}`；同时把函数名加进 `check-logic.mjs` 的 `names` 数组与 `new Function(...)` 的 return 对象。
- 自检：`node check-logic.mjs`（步骤 1 结束时新增断言见 §10.1，允许先红后绿，但本步结束必须是绿）。

### 步骤 2：迁移与写入口（`client.js`）

- 动作：`normalize`（`client.js:1052`）返回 `version: 8` + `profile` + `push`；`readState`（`client.js:1143`）记录原始顶层键集合、`writeState`（`client.js:1161`）合并未知键（§5.2 第 5 条）；新增 `setDirections`（§1.4）；`toggleDirection`（`client.js:4038`）改为调用 `setDirections`。
- 自检：`node check-logic.mjs`（含 §10.1 的 4 组幂等样本）＋ `node check-client.mjs`。

### 步骤 3：推送执行器与页面（`client.js`）

- 动作：`Page`（`client.js:3710`）加 `push` 页签状态与 3 个触发点（§5.4，复用 `client.js:3735` 的心跳）；`tabs`（`client.js:4241`）加第 7 个按钮（带 `pushUnreadCount`）；新增 `PushPane` / `ProfileCard`（渲染在 `client.js:4466-4480` 的 tab 三元链里加一支）；`PanelIcon`（`client.js:4510`）按 §6.2 改；CSS 追加 §8 的 16 个类到 `client.js:1438` 数组末尾。
- 自检：`node check-client.mjs`（V19 键集比对在下步一起绿）；刷新面板人工确认「推送」页签可开、无画像时是引导态。

### 步骤 4：宿主两条只读路由（`index.js`，**不重启**）

- 文件：`my-courses/index.js`
- 动作：加 `NEWS_PATH`、`REPOS_PATH`、`UA`、`HOST_LIMIT=20`；`CATEGORY_PATTERN`（`index.js:23`）换成 `DIRECTION_CODES` 真白名单（A16，非法 → `BAD_CATEGORY`）；`apply`（`index.js:51-66`）里追加 2 个 `ctx.effect(() => server.register({kind:'exact', path, handler}), 'my-courses: news feed route')` 与 `'my-courses: repo feed route'`；实现 `handleNews` / `handleRepos`（照 `handlePapers` 的骨架：method → url → 参数裁剪 → 上游 fetch（UA + Accept + 20s AbortController + `res.on('close')`）→ 归一化 → `{ok:true, items, fetchedAt}` / `{ok:false, error}`）。
- 自检（此时不用重启，语法/契约层验证）：`node check-host.mjs`；`node --check my-courses/index.js`。

### 步骤 5：版本号与语言文件（`package.json` + `locale/*.json`）

- 动作：`package.json` `version: 1.4.0`（A20）；`locale/zh.json`、`locale/en.json` 按 §7.2 追加（A21）；客户端 `ZH`/`EN` 按 §7.1 各加 62 键（A23）。
- 自检：`node check-client.mjs`（V19 zh/en 键集相等）＋ `node -e "const a=require('./my-courses/locale/zh.json'),b=require('./my-courses/locale/en.json');const ka=Object.keys(a).sort(),kb=Object.keys(b).sort();if(JSON.stringify(ka)!==JSON.stringify(kb))throw new Error('locale keys mismatch');console.log('LOCALE OK', ka.length)"`。

### 步骤 6：统一重启 + 端到端人工验证

- 动作：**此时才重启桌面应用**（会终止本会话，因此必须放在最后）。重启后刷新面板，按 §10.2 的 12 条人工清单逐条过。
- 自检（重启前后都可跑的三套）：`node check-host.mjs && node check-client.mjs && node check-logic.mjs`。

### 10.1 `check-logic.mjs` 必须新增的断言（实现者提交前逐条实现）

| 编号 | 断言 | 期望 |
| --- | --- | --- |
| V26 | `normalize(rawV7).version` | `=== 8`（同时把既有 `v2.version === 7` 断言改成 8） |
| V27 | `normalize(rawV7).profile.directions` | 等于 `rawV7.research.directions` 过滤后的值（无该键则 `['cs.CL']`） |
| V28 | `JSON.stringify(normalize(normalize(x)))` 对 4 个样本 | 与 `JSON.stringify(normalize(x))` 全等（§5.2） |
| V29 | `scoreItem` 在固定 `now=1700000000000` 下的 4 组输入 | 分数等于 §4.4 表里的数字（85 / 32 / 0（被过滤）/ 63） |
| V30 | `rankPushItems` 同输入两次 | `JSON.stringify` 相等；且 8 条单源只留 6、30 条只留 15 |
| V31 | `pushIsDue({lastRunDay:'2024-05-01', lastRunAt:0}, new Date('2024-05-02T00:10:00'))` | `true`；`pushIsDue({lastRunDay:'2024-05-01', lastRunAt:0}, new Date('2024-05-01T23:50:00'))` → `false` |
| V32 | `pushUnreadCount({items:[{id:'a'},{id:'b'}], seenIds:['a']})` | `1` |
| V33 | `normalizeProfile({directions:['bogus.XX']}).directions` | `['cs.CL']` |
| V34 | `normalizeProfile({directions:['cs.CV','cs.CL','cs.LG','cs.DB','cs.AI']}).directions` | `['cs.CL','cs.AI','cs.LG','cs.CV']`（按 `DIRECTIONS` 表序、上限 4） |

### 10.2 重启后人工验收清单（12 条）

1. 老数据（升级前已有课表/任务/竞赛）打开后全部还在，`localStorage['dsh.my-courses.v2']` 里 `version === 8`。
2. 首次进推送页：显示引导（`push.needProfile`），**Network 里没有任何请求**。
3. 选 2 个方向 + 1 个关键词保存 → 立即触发一次，三源状态条都变绿/或明确标注失败源。
4. 同一天再刷新页面：Network 无 `/my-courses/*` 请求（同日守卫）。
5. 把系统日期改到明天，等 ≤30s 心跳：自动跑一次（心跳触发）。
6. 断网后点「立即刷新」：三源全失败，页面顶部出现失败条，**列表不被清空**，`lastRunDay` 仍是旧值（DevTools 里看存储）。
7. 恢复网络后 30 分钟后自动重试成功 → `lastRunDay` 变成今天。
8. 侧栏收起/展开：有未读时图标右上角有红点，无未读时无红点且图标与升级前像素一致。
9. 打开推送页 → 红点消失、页签 `推送 (n)` 的数字归零（`seenIds` 落盘，刷新后仍为 0）。
10. `bogus.XX` 直连 `/my-courses/papers?cats=bogus.XX` → `400 BAD_CATEGORY`（R1 修复生效）。
11. `/my-courses/news?q=llm` 与 `/my-courses/repos?q=llm` 在浏览器直接打开 → 返回 `{ok:true,items:[…]}`。
12. 深色/浅色主题下推送卡片与红点都可见（红点用 `--dsw-specific-sidebar-fill` 描边）。

## 11. 评审复算附录（三条复算命令）

1. 基线未漂移：`node -e "const c=require('crypto'),f=require('fs');console.log(c.createHash('sha256').update(f.readFileSync('my-courses/client.js')).digest('hex').slice(0,12))"`（批次③ 前应为 `dae825936665`）。
2. 纯函数抽得出：`grep -c $'^\t\tfunction ' my-courses/client.js`（新函数必须能被 `check-logic.mjs` 的 `indexOf('\t\tfunction ')` 命中）。
3. 幂等：`node check-logic.mjs` 的 V28 是最小可验证据；字节级证据 = 把同一份 v7 样本 `normalize` 两次后 `JSON.stringify` 相减为空。