# 批次 ④ 规格：论文工作台（Paper Workbench）

状态：草案，待「开始吧」批准后实现。
范围：在推送列表每篇**论文**右侧加「论文工作台」入口；工作台左栏英文全文、右栏中文解读 + 实时提问。

## 0. 与既有约束的关系

1. **不调用团队**：本批次由 captain 单独实现，无 subagent、无 agent_teams。
2. **不新增 API key / 环境变量**：模型走宿主 `ctx.get('llm')` + `ctx.get('agentDefaultModel').currentSelection()`，
   与既有 `/my-courses/extract`（课表 OCR）完全同一条通路，用户在 DSH 里登录什么模型就用什么模型。
3. **推送源路由的 key-less 规则不变**：`/papers`、`/news`、`/repos` 三条路由仍不发模型请求；
   模型只出现在新增的 `/paper/explain`、`/paper/ask` 两条路由里，且只在用户打开工作台/提问时触发。
4. 批次 ③ 的 15 项修复不回退；`docs/verification.md` 不覆盖。

## 1. 用户可见行为

### 1.1 入口
- 推送卡片 `.mc-push-card` 底部新增一行 `.mc-push-actions`（右对齐）。
- 仅当 `item.source === 'paper'` 且能从 URL 解析出 arXiv id 时，渲染 `mc-btn` 「论文工作台」。
- 非论文条目（news/github）不显示该按钮。

### 1.2 工作台布局（`.mc-wb` 全屏覆盖层）
```
┌──────────────────────────────────────────────────────────────┐
│ 标题 · arXiv 2510.xxxxx   [原文↗] [复制引用] [关闭 ×]          │
├───────────────────────────────┬──────────────────────────────┤
│ 左栏（全文，可滚动）           │ 右栏（中文）                  │
│  目录（吸顶，点击定位）        │  [中文解读] [提问]            │
│  § Abstract                   │  ── 导读卡片（自动）          │
│  § 1 Introduction             │  ── 分节「讲解」按钮 + 流式结果│
│    段落…  [读不懂这段]         │  ── 提问：历史 + 输入框       │
└───────────────────────────────┴──────────────────────────────┘
```
- `.mc-wb-body`：`display:grid; grid-template-columns:minmax(0,1.45fr) minmax(0,1fr); gap:14px`。
- 响应式只复用**既有唯一** 640px 媒体查询（V23 断言全文件仅 1 条 640px query），单列堆叠，不新增断点。
- Esc 关闭；关闭后保留阅读进度（滚动位置）与已生成内容。

### 1.3 中文解读（右栏 Tab 1）
- **导读**：打开时若该论文无缓存导读，自动请求一次（≈1 次小调用），内容为 3–5 条中文要点：
  解决什么问题 / 核心方法 / 关键结论 / 建议阅读顺序。
- **分节讲解**：每个小节标题旁一个「讲解」按钮，点击流式输出该节中文讲解 + 3–5 个术语（`English — 中文：一句解释`）。
- **段落级**：左栏段落 hover 出现「读不懂这段」，点击后右栏切到「讲解」并输出：
  关键句直译 → 该段在论证中的作用 → 需要的前置概念。
- 全部结果按 (paperId, 目标) 缓存，二次打开零 token。

### 1.4 实时提问（右栏 Tab 2）
- 输入框 + 发送（Enter 发送，Shift+Enter 换行），答案逐字流式显示。
- 检索增强：宿主在已缓存的全文里按问题关键词选 top-3 段落（+ 小节奏），连同最近 2 轮对话送入模型。
- 回答约束：只依据给定片段；片段不足答「论文中未提及」，并给出可查方向；引用格式 【§小节标题】；中文 ≤350 字。
- 会话按论文保存，滚动到底部；单篇上限 40 条，超出丢最旧。

## 2. 宿主路由（`index.js`）

均沿用既有 handler 契约：非 GET/POST → 405 `HTTP_METHOD`；坏 JSON → 400 `BAD_REQUEST`；上游失败 → HTTP 200 `{ok:false,error}`；`finally clearTimeout`。

### 2.1 `POST /my-courses/paper/text`
请求 `{ url }`（arXiv abs/pdf/html URL 或裸 id）。
1. 归一化 id：`^(\d{4}\.\d{4,5}|[a-z-]+(\.[A-Z]{2})?/\d{7})(v\d+)?$`，只保留 id，**绝不拼接用户传入的 host**。
2. `GET https://arxiv.org/html/<id>`；若非 200 或正文无 `ltx_section` → `GET https://ar5iv.labs.arxiv.org/html/<id去掉版本>`。
3. 解析：标题 `h1.ltx_title`（回退 `<title>`）、摘要 `div.ltx_abstract`、小节 `section.ltx_section` + `h2/h3.ltx_title`；
   丢弃 `ltx_bibliography`、`ltx_page_footer`、`<script>/<style>`；公式保留文字、去 `annotation` 重复；实体解码。
4. 输出：
```json
{ "ok": true, "cached": false, "id": "2501.12948", "title": "…", "source": "arxiv-html",
  "url": "https://arxiv.org/abs/2501.12948",
  "sections": [ { "key": "abstract", "heading": "Abstract", "level": 1,
                  "paragraphs": ["…"] } ], "fetchedAt": 1762… }
```
5. 上限：单篇 ≤ 200k 字符、每节 ≤ 80 段、单段 ≤ 4000 字符；超限截断并置 `truncated: true`。
6. 磁盘缓存 `~/.dsh/cache/my-courses/papers/<id>.json`，TTL 7 天；命中直接返回 `cached:true`。
7. 错误码：`BAD_URL` / `PAPER_NO_HTML` / `PAPER_TOO_LARGE` / `UPSTREAM_<status>`。

### 2.2 `POST /my-courses/paper/explain`（SSE）
请求 `{ id, mode: "guide" | "section" | "sentence", heading?, text? }`。
- `mode=guide`：输入标题+摘要+小节奏 → 3–5 条导读，`maxTokens 700`。
- `mode=section`：输入该节标题+正文（截 12000 字符）→ 讲解 + 术语表，`maxTokens 900`。
- `mode=sentence`：输入该段（≤3000 字符）+ 所属小节标题 → 直译+作用+前置概念，`maxTokens 500`。
- `temperature 0.3`；超时 90s；`signal` 绑定 `res.on('close')`。
- 响应：`content-type: text/event-stream`，事件
  `event: delta` `{"text":"…"}`；`event: done` `{"model":"…"}`；`event: error` `{"error":"…"}`。

### 2.3 `POST /my-courses/paper/ask`（SSE）
请求 `{ id, question, history?: [{role,text}] }`。
- 服务端从磁盘缓存的该论文全文取候选段落；停用词过滤后按词命中数 + 长度惩罚打分，取 top-3 段落（合计 ≤ 6000 字符）。
- 无缓存全文 → 直接 `{ok:false,error:'NO_PAPER_TEXT'}`（HTTP 200）。
- 提示词：中文、只依据片段、不足则明说、引用 `【§标题】`、≤350 字、公式文字化。
- 事件格式同 2.2，`maxTokens 900`。

### 2.4 `GET /my-courses/paper/status`
`{ ok: true, llm: { available: true, provider, model }, papers: <缓存篇数> }`；
无 llm 服务时 `{ ok: true, llm: { available: false } }`，客户端据此禁用右栏并提示。

## 3. 客户端（`client.js`）

### 3.1 状态（storage `version: 9`）
```js
state.paper = {
  open: '',                     // 当前打开论文 id（仅内存可靠，持久化允许为空）
  tab: 'guide',                 // 'guide' | 'chat'
  items: { [id]: { id, title, url, at,
                   guide: '', sectionsZh: { [sectionKey]: { zh, at } },
                   chat: [{ role, text, at }], anchor: 0 } },
};
```
- 全文只进内存 Map `paperText`（关闭即释放），不写 localStorage（避免 5MB 配额）。
- 迁移 v8→v9：`state.paper` 缺失时补空对象，其余字段原样；重复迁移结果字节一致（同 v6→v7 约定）。

### 3.2 数据流
1. 点「论文工作台」→ `paperTextOf(id)`：内存命中→否则 `POST /paper/text`；失败显示 `.mc-note[data-tone=error]` + 原文链接兜底。
2. 打开后若 `items[id].guide` 为空 → 流式 `POST /paper/explain {mode:'guide'}`，边收边渲染。
3. 分节/段落讲解 → 同一路由；写入 `sectionsZh[key]`。
4. 提问 → `POST /paper/ask`，追加 `{role:'user'}` 再流式追加 `{role:'assistant'}`。
5. 同一论文同一时刻只允许 1 个在飞请求（`paperBusy` ref），避免重复扣费。

### 3.3 SSE 读取
`fetch(url,{method:'POST',body:JSON.stringify(...)})` + `res.body.getReader()`，按 `\n\n` 切帧，解析 `event:` / `data:`；
`AbortController` 在关闭工作台或切换论文时 abort。读取器须兼容一次性返回整块 JSON 的失败响应（先看 `content-type`）。

### 3.4 布局与交互
- 左栏：`.mc-wb-text` 目录 + 段落；`scrollIntoView` 到章节；段落 hover 显示按钮；正文 `white-space:pre-wrap`、行高 1.75。
- 右栏：`.mc-wb-panel`，Tab 切换；流式时显示光标块 `.mc-wb-cursor`；空态提示。
- 顶部：标题、`arXiv:xxx`、原文链接、关闭；加载中骨架 `.mc-wb-skeleton`。
- 键盘：Esc 关闭；聚焦输入框后 Enter 发送。

## 4. i18n / CSS / 门禁

- 新键族 `wb.`（≥28 个，zh/en 键集完全一致）：入口按钮、两个 Tab、导读标题、讲解/提问占位、错误文案、
  流式中、关闭、原文、复制引用、空态、超时提示、无模型提示。
- CSS：`.mc-wb*` 约 35 条，追加在 `].join('');` 之前；只用 `var(--dsw-alias-*)` 变量，不新增裸 hex 之外的新颜色（V22 规则）。
- `check-client.mjs` 新增：
  - V34 `wb.` 键数 ≥28 且 en/zh 对齐；
  - V35 客户端引用的 4 条路由路径与宿主一致；
  - V36 `.mc-push-actions` + `mc-push-open` 存在，且仅论文条目渲染；
  - V37 存在 `text/event-stream`/SSE 解析函数与 `AbortController`；
  - V38 `@media` 仍仅 1 条（640px）；
  - V39 存储版本 9 + `state.paper` 迁移幂等。
- `check-logic.mjs` 新增 ≥20 断言：arXiv id 归一化（含旧式 `hep-th/9901001`、带版本、拒绝 `https://evil.com`）、
  段落/小节切分、关键词检索 top-3、聊天裁剪 40 条、迁移幂等。
- `check-host.mjs` 新增 ≥18 断言：HTML 解析出 abstract+8 节、无 `ltx_section` 时回落 ar5iv、
  `BAD_URL` 拒绝外域、SSE 写出 delta/done、模型报错转 `event: error`、`NO_PAPER_TEXT`、缓存命中 `cached:true`。

## 5. 交付与风险

1. **重启要求**：`index.js` 变更 → 需桌面重启（会杀当前会话），与批次 ③ 遗留的两处回落一起生效；`client.js` 变更 → Ctrl+Shift+R。
2. arXiv 无 HTML 的论文（较早投稿、部分领域）→ 提示「该论文暂无 HTML 全文」，提供摘要 + 原文链接，工作台仍可对摘要讲解。
3. Token 成本：导读/讲解/提问都会调用当前登录模型；已缓存内容零成本；单次上限见 §2.2–2.3。
4. 公式与图注在纯文本中会损失排版，解读提示词要求「文字化描述公式」，不承诺还原公式。
5. 视觉无法由代理验证：交付后仍需人工看两栏比例、暗色模式、窄屏堆叠。