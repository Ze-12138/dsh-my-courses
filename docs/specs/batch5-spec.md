# 批次⑤ 规格：论文工作台独立栏目 + PDF 导入 + CCF A 优先

- 状态：待批准（批准后即按本文件实现，不再改范围）
- 依据：用户 2026-11-07 21:19 原话「把论文工作台变成一个单独的栏目，可以导入pdf阅读，然后论文那一栏里面也要可以加入工作台，然后就是论文筛选优先ccf a类，注意控制品质」
- 前序：批次④ 已交付同款两栏阅读器（`PaperWorkbench`），本批把它从「弹窗」升级为「栏目」，并接入 PDF 与 CCF 分级。

## 0. 已定的技术前提（探针结论，非猜测）

| 结论 | 证据 |
| --- | --- |
| 宿主 Node 里可用 `pdfjs-dist@3.11.174` legacy 版抽取文字层 | 一次性探针（未随仓库发布）：arXiv `2501.12948` 22 页、首 3 页 7,388 字符，正文可直接读出（"DeepSeek-R1: Incentivizing Reasoning Capability…"） |
| 只需 `pdf.js`（711 KB）+ `pdf.worker.js`（2.1 MB）两个文件 | 去掉 worker 后报 `Setting up fake worker failed`；两个都留则纯 Node 可用 |
| 无需 canvas | 仅告警 `Cannot polyfill DOMMatrix / Path2D, rendering may be broken`，文字抽取不受影响 |
| 版式渲染不可行 | 渲染需要 canvas（宿主没有），浏览器端又无法 require 第三方库；故本批**只做文字层**，不做 PDF 像素级还原 |
| 现有宿主 body 上限 12 MB | `index.js` `MAX_BODY_BYTES`；base64 后约等于 8 MB 原始 PDF |

## 1. 信息架构：工作台成为第 8 个栏目

- 侧栏顺序：课表 · 课程 · 任务 · **论文** · 竞赛 · 文件 · 推送 · **工作台**（新增，末位）。
- 「工作台」栏目默认显示**论文库列表**：每行 = 标题、类型徽章（`PDF` / `arXiv` / `CCF-A`）、最近打开时间、`继续阅读`、`移除`。
- 打开任一论文后，栏目内**整页切换**为两栏阅读器（左英文全文、右中文解读 + 提问），左上角 `‹ 工作台` 返回列表；`Esc` 同样返回。
- 从「论文」或「推送」卡片点 `工作台` → `setTab('workbench')` + 打开该论文；**不再弹窗**（弹窗层删除，避免两套表面）。
- 保留批次④ 的所有能力：导读、本节解读、段落「读不懂」、问答、SSE 流式、`paperTexts` 内存 Map、关闭即释放。

## 2. 论文库（`state.paper.items`）

```js
paper: {
  open: '',            // 当前打开的 id
  tab: 'guide',        // 'guide' | 'chat'
  items: {             // 库；键 = id
    [id]: {
      id, kind: 'arxiv' | 'pdf',
      title, url, venue, arxivId, ccf: '' | 'A' | 'B' | 'C',
      at,              // 加入时间（ms）
      openedAt,        // 最近打开（列表排序）
      guide, sectionsZh, chat, anchor,   // 同批次④
    }
  }
}
```

- 去重：arXiv 按 `arxivId`，PDF 按内容 sha256 前 16 位（`pdf:<hash>`）。同 id 再导入 → 复用条目、只刷新 `openedAt`。
- 库条目上限 200；超出丢最旧（`openedAt` 升序）。
- `localStorage` 只存上面的元数据与中文产物（受 `WB_*_MAX` 截断），**PDF 原文/抽取文本不落 localStorage**。
- 移除：删条目 + `paperTexts.delete(id)` + 若正打开则 `open=''`。

## 3. PDF 导入

### 3.1 客户端

- 工作台列表头部 `导入 PDF` 按钮 → 隐藏 `<input type="file" accept="application/pdf,.pdf">`（可多选，逐个串行处理）。
- 选中后：`file.arrayBuffer()` → base64 → `POST /my-courses/paper/pdf`（`{ name, data, size }`）。
- 上限：单文件 8 MB、单次最多 5 个；超限直接 toast，不发请求。
- 解析中卡片显示骨架 + `解析中…`；失败按宿主错误码给具体文案（见 3.3）。
- 成功：`paper.items[hash]` 落条目，自动打开阅读器并跑导读（与 arXiv 一致）。

### 3.2 宿主 `POST /my-courses/paper/pdf`

1. 校验 method/body/`data` 为合法 base64、`size <= 8MB`，否则 400 `PDF_BAD_INPUT` / 413 `PDF_TOO_LARGE`。
2. 惰性 `import(fileURL('./vendor/pdf.min.js'))` + 同级 `pdf.worker.js`（**只在首次导入 PDF 时加载**，约 50 ms，之后常驻）。
3. `getDocument({data, useSystemFonts:false, isEvalSupported:false})` → 逐页 `getTextContent()`。
4. 质量闸：
   - 页数 > 200 → 取前 200 页并 `truncated: true`；
   - 总字符 < 500，或「可打印字符占比」< 0.85（乱码/扫描件）→ 返回 `{ok:false, error:'PDF_NO_TEXT'}`，文案「这份 PDF 没有可提取的文字层（可能是扫描件）」；
   - 单页抽取异常 → 跳过该页并累计 `skippedPages`；全部失败才算整体失败。
5. 文本重建（质量关键）：
   - 行：按 `item.hasEOL` 断行；行内用空格连接（CJK 相邻不加空格）。
   - 段：按同行 `transform[5]` 的垂直间距聚类，间距 > 1.8× 行高中位数 → 新段；
   - 标题：行高 > 正文中位数 ×1.12，且匹配 `^(?:\d+(?:\.\d+)*|[IVX]+)\.?\s+\S` 或已知节名（Abstract / Introduction / Related Work / Method(s) / Experiments? / Results? / Discussion / Conclusion / References）→ 成为 `section.heading`，其后段落到该节；References 之后整体丢弃（参考文献对解读无价值，且省 token）。
   - 输出结构与 arXiv 完全一致：`{ok, id, title, source:'pdf', sections:[{key, heading, level, paragraphs:[...]}], truncated, cached, fetchedAt}`，客户端零分支。
6. 缓存：`~/.dsh/cache/my-courses/papers/pdf-<hash>.json`，TTL 7 天，命中直接返回 `cached:true`；命中不重复解析。
7. 标题：PDF 元数据 `info.Title` 非空且不像 `Microsoft Word - xxx` → 用它；否则用文件名去扩展名。

### 3.3 错误码（HTTP 200 + `{ok:false,error}` 口径，只有参数错才 4xx）

`PDF_BAD_INPUT` / `PDF_TOO_LARGE` / `PDF_NO_TEXT` / `PDF_ENCRYPTED`（pdfjs 抛 `PasswordException`）/ `PDF_PARSE_FAILED`。

## 4. 论文筛选：CCF A 优先

### 4.1 分级表（内置常量，可离线）

- `CCF_A`：约 45 个最常见 venue 的别名（NeurIPS/NIPS, ICML, ACL, CVPR, ICCV, ECCV, AAAI, IJCAI, SIGIR, KDD, WWW, SIGMOD, VLDB, ICDE, ICSE, FSE, ASE, OSDI, SOSP, CCS, S&P/SP, USENIX Security, NDSS, CRYPTO, EUROCRYPT, STOC, FOCS, SODA, POPL, PLDI, OOPSLA, CAV, LICS, CHI, UbiComp, INFOCOM, SIGCOMM, MobiCom, NSDI, SC, HPDC, MICRO, ISCA, ASPLOS, HPCA, DAC, ICCAD, RTSS + 期刊 TPAMI, JMLR, AI, TOG, TIP, TOSEM, TSE, TDSC, TIFS, JACM, SICOMP, TOCS, TOS, TOIS, TKDE, VLDBJ, JSAC, TMC, TON, TOPLAS, TC, TPDS）。
- `CCF_B`：约 25 个（EMNLP, NAACL, COLING, EACL, BMVC, ACCV, ICME, CIKM, WSDM, ICDM, SDM, EDBT, ICPR, ICASSP, INTERSPEECH, Middleware, EuroSys, RAID, ESORICS, ACSAC, ICCD, DATE, ISSTA, ICST, MSR 等）。
- `CCF_C`：不逐一列举，`paperCcfLevel` 命中 C 表才标；保守原则：**识别不到就不标，绝不猜**。
- 匹配：venue 字符串归一化（小写、去标点、去年份/卷期），整词匹配别名；`ICLR` 不在 CCF 目录内 → 不标（这是事实，不是遗漏）。
- 适用范围：只有 `venue`（含 arXiv `journal_ref`）非空才评级；纯 arXiv 预印本显示 `arXiv preprint` 且 `ccf:''`。

### 4.2 排序与筛选

- 论文列表默认排序：`ccfRank(A=0,B=1,C=2,无=3)` → `score/published` 降序。
- 筛选条新增 chip：`CCF-A`（只看 A）/ `CCF 分级`（A+B+C）/ `不限`，与现有方向 chip、标签栏并存；标签栏追加自动标签 `CCF-A`。
- 卡片徽章：`CCF-A` 金色、`CCF-B` 银色、`CCF-C` 灰色；`arXiv preprint` 保持现状（批次② R2 的降级规则不动）。
- 推送打分：`score` 对 CCF-A 论文 +25、B +12、C +4（`SOURCE_SCORE` 之上叠加，仍受 60 条/日上限与去重约束）；推送卡与论文卡同一徽章。
- 「控制品质」硬约束：无 venue、无 DOI、无 arXiv id 的条目直接丢弃（现有 `normalizePushItem` 已要求 id+url+title，这里再加 venue 兜底判断）；同标题去重；每源最多 20 条。

## 5. 「论文」栏新增工作台入口

- 每张论文卡的操作行（PDF / 收藏 旁）新增 `工作台` 按钮，`className` 与推送卡一致（`mc-btn mc-btn-sm mc-wb-open`），点击 → 切到工作台栏目并打开。
- 收藏列表里同样有该按钮。
- 论文卡不再需要单独的「弹窗」概念（弹窗已删除）。

## 6. 状态版本与迁移

- `version: 9 → 10`；`normalizePaperState` 增加 `kind/venue/ccf/openedAt` 白名单与裁剪；旧 `paper.items` 条目缺字段时补 `kind:'arxiv'`、`ccf: paperCcfLevel(venue)`、`openedAt: at`。
- v9 数据升级到 v10 不丢 guide/sectionsZh/chat；`pickExtras` 的 14 键白名单不变（`paper` 已在）。
- 迁移必须幂等：同一份 v10 再跑一遍，字节不变。

## 7. i18n / CSS / 响应式

- `wb.*` 新增（中英各一份）：`tab`、`library`、`import`、`importHint`、`importing`、`pdf`、`ccfA`、`ccfB`、`ccfC`、`ccfFilterA`、`ccfFilterAll`、`ccfFilterNone`、`remove`、`reopen`、`empty`、`noText`、`encrypted`、`parseFailed`、`tooLarge`、`badInput`、`truncated`、`skipped`、`back`。全部走 `format()` 参数化。
- CSS 全用 `--dsw-*` 变量；新增 `.mc-wb-lib*`、`.mc-ccf-*`；640px 断点内让库卡片与阅读器两栏堆叠；不新增裸 hex/rgba。
- 工作台栏目的容器类 `.mc-wb-tab-page` 占满主区高度，列表可滚动，阅读器 `min-height:0` 以便内部两栏各自滚动。

## 8. 门禁（脚本不进交付物，但每条锁一个真实不变量）

- `check-client.mjs` 新增 V40–V47：
  - V40 第 8 个 tab 注册且标签键 `wb.tab`；
  - V41 弹窗路径已删除（不存在 `mc-wb-dialog` 渲染 / `document.body.appendChild`）；
  - V42 `mc-wb-open` 在论文卡与推送卡各出现一次；
  - V43 PDF 路由常量与 base64 上传接线；
  - V44 `CCF_A`/`CCF_B` 表 ≥ 40 / ≥ 25 条，`paperCcfLevel` 被列表排序与推送打分同时引用；
  - V45 `version: 10` + `paper.library` 语义（`openedAt`）；
  - V46 `wb.` 键中英对齐且 ≥ 60；
  - V47 640px 媒体查询包含 `.mc-wb-lib`。
- `check-logic.mjs` block 18：`paperCcfLevel` 大小写/年份/期刊别名 12 例、`normalizePaperState` v9→v10 迁移 6 例、`pdfId`/去重 4 例。
- `check-host.mjs` block 10：PDF 路由 5 类错误 + 成功路径（用 本地 PDF 样本的前 2 页做 fixture）+ 缓存命中 + 8MB 上限。

## 9. 验收与不可验证项

- 必跑：三条 gate + `node --check` 两文件 + 渲染探针（31 条 → 扩到覆盖新 tab、导入按钮、CCF chip、库列表）。
- 无法由代理验证：真实 PDF 的排版还原度（只做文字层）、两栏在 1440/1024/640 的观感、暗色对比度、真实模型解读质量、重启后宿主路由生效。
- 重启说明：本批改了 `index.js`（PDF 路由 + 2.8 MB vendor），**必须重启桌面端**；`client.js` 改动 Ctrl+Shift+R 即可。

## 10. 取舍与风险（写明，不藏着）

1. **不做 PDF 像素渲染**：需要 canvas，宿主没有；文字层足够支撑「带着读 + 提问」。扫描件会明确拒绝，不假装能读。
2. **vendor 2.8 MB**：pdfjs 3.11.174 legacy（Apache-2.0），放 `my-courses/vendor/`，只在首次导入 PDF 时动态 import；不影响插件启动，不影响 web bundle 体积。
3. **CCF 表是人工子集**：不做「全覆盖」，只保证常见 A/B 类识别准确；识别不到就不标，避免把 ICLR 之类误标成 A。
4. **PDF 解析在本地**：文件不上传、不外发，只写本地缓存；隐私边界与推送一致。