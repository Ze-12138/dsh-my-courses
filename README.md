# DSH 我的课程（`@local/my-courses`）

一个 DeepSeek Harness（DSH）的客户端插件：把「课表 + 课程 + 待办 + 竞赛 + 论文推送 + 论文阅读工作台」做成侧边栏的一个栏目。

宿主侧只做三件事——抓 arXiv、抓仓库信息、调模型做讲解/答疑；其余状态都留在浏览器本地。

- 版本 `1.5.0`，存储 `version: 11`（读旧数据自动幂等迁移）
- 形态：`index.js`（宿主，ESM，`apply(ctx)`）+ `client.js`（浏览器 bundle）+ `cordis.patch.yml` 挂载 + `locale/{zh,en}.json` 双语
- 依赖：运行时零第三方依赖；PDF 解析用随仓库的 `vendor/pdfjs-dist@3.11.174`（Apache-2.0，见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)）

## 功能

八个页签：

| 页签 | 内容 |
| --- | --- |
| 课表 | 学期起止/周次、每日节次、从课表截图里解析课程（图片只存 `dataUrl`） |
| 课程 | 课程卡片、学分、教师、地点、标签文件夹 |
| 待办 | 便利贴样式（普通黄 / 临期橙 / 逾期粉），按截止日排序，≤640px 回单列 |
| 论文 | arXiv 每日推送：12 个方向、CCF-A 优先、去重、已读/收藏、右侧标签栏 |
| 竞赛 | 竞赛文件夹 + 每个文件夹一份「学习规划」 |
| 文件 | 课程资料（本地存储，不落服务端） |
| 推送 | 推送流与已读状态（含 arXiv 以外来源的占位结构） |
| 工作台 | 论文阅读工作台：资料库、PDF 导入、三视图、逐段对照、笔记、术语表、提问、导出 |

工作台要点：

- **资料库**：类型/CCF 徽章、最近打开、继续阅读、移除，上限 200 条
- **PDF 导入**：单文件 ≤ 8 MB、一次 ≤ 5 个；`sha256` 前 16 位作 id；只解析**文本层**，不渲染像素
- **质量门**：可打印字符占比 < 0.85 或正文 < 500 字 → `PDF_NO_TEXT`，不喂模型
- **三视图**：原文 / 双语 / 仅译文，默认双语
- **逐段对照**：要求模型按 `[n] 中文` 逐段输出；序号必须 1..n 连续、唯一、非空，缺行/跳号/重复/越界**整节退回**原文，不猜
- **段落笔记**：每篇 200 条、单条 2000 字、引用 160 字；笔记页签 + 跳回原文 + 闪烁定位
- **术语表**：`profile.glossary`，40 条 × 两侧 64 字，小写去重；**只进提示词**，不做字符串替换
- **提问**：本节 / 全篇，引用格式 `【§小节标题 ¶段号】`，答案里的引用渲染成可点击 chip
- **导出 Markdown**：标题 / venue / CCF / 链接 / 导读 / 原文 / 对照 / 笔记，文件名清洗并截断 80 字

## 宿主路由（`index.js`，共 9 条）

| 方法 | 路径 | 说明 | 调用模型 |
| --- | --- | --- | --- |
| POST | `/my-courses/extract` | 课表图片 → 课程结构 | 是 |
| GET | `/my-courses/papers` | arXiv 论文列表（Atom 解析 + 质量门） | 否 |
| GET | `/my-courses/news` | 资讯列表 | 否 |
| GET | `/my-courses/repos` | 组织仓库列表 | 否 |
| POST | `/my-courses/paper/text` | 取论文全文（HTML / PDF 解析） | 否 |
| POST | `/my-courses/paper/explain` | 导读 / 本节释义 / 单句释义（SSE） | 是 |
| POST | `/my-courses/paper/ask` | 本节 / 全篇提问（SSE，带引用） | 是 |
| GET | `/my-courses/paper/status` | 模型可用性 + 缓存篇数 | 否 |
| POST | `/my-courses/paper/pdf` | 上传 PDF 并解析文本层 | 否（不联网） |

约定：参数非法 → 4xx；上游失败 → HTTP 200 + `{ok:false,error}`；SSE 出错先发 `event: error`（带 `partial`）再结束。
只有白名单主机才走 `fetch`，不回显用户输入的 host。

额度：`paper/explain`、`paper/ask` 会消耗模型额度（`maxTokens` 700 / 900 / 1500，`timeoutMs` 90 s），其余路由不花额度。

## 数据存放

- 浏览器：`localStorage['dsh.my-courses.v2']`，`version: 11`
- 论文全文：**只进宿主内存 `Map`**，重启即释放（几十万字符不进 `localStorage`）
- 论文缓存（宿主）：`~/.dsh/cache/my-courses/papers/<id>.json`，7 天 TTL
- PDF、笔记：随论文记录留在本地，不上传任何服务器

## 开发与门禁

```bash
node --check my-courses/index.js
node --check my-courses/client.js
node check-client.mjs      # 入口可加载、槽位注册、导出齐全 → CLIENT OK
node check-logic.mjs       # 280 项：存储迁移 / 时间口径 / 论文质量 / 对照解析 / i18n → LOGIC OK
node check-host.mjs        # 175 项：9 条路由 / 模型参数 / SSRF 白名单 / SSE 错误 → HOST OK
```

改 `client.js` 后刷新页面即可（`Ctrl+Shift+R`）；改 `index.js` / locale / `package.json` 需重启 DSH 桌面端。

## 目录

```
my-courses/
  index.js            宿主：路由、arXiv 抓取、模型调用、缓存
  client.js           浏览器：八个页签 + 论文工作台（单文件 bundle）
  cordis.patch.yml    挂载声明
  package.json        插件元数据（dsh.bundle / dsh.client）
  locale/{zh,en}.json 文案
  icon.svg
  vendor/             pdfjs-dist 3.11.174（文本层解析，Apache-2.0）
check-client.mjs      客户端门禁
check-logic.mjs       逻辑门禁
check-host.mjs        宿主门禁
docs/
  specs/              六批需求规格（batch1..batch6）
  verification.md     三套门禁与人工验收的覆盖范围、未验证项
  reload.md           装到 DSH 里、改完怎么生效、怎么回滚
  roadmap.md          已知限制与后续方向
```

## 已知限制

摘要如下，完整清单见 [docs/roadmap.md](docs/roadmap.md)：

- 只读文本层：图表、公式排版、扫描页读不到；>200 页截断
- `PDF_ENCRYPTED` 与多页截断没有真实样本，只有合成断言
- CCF 分级是离线别名快照（A/B/C 约 68/26/8 条），未收录会议一律无徽章——宁缺勿错
- 引用 chip 跳「该节」可靠，跳「该段（¶n）」依赖模型自报段号
- 对照缓存不与 arXiv 版本绑定
- 逐段对照的 token 成本高于整节讲解

## 许可

仓库内代码未声明开源许可，作者保留权利。
`my-courses/vendor/` 内是 `pdfjs-dist@3.11.174`，Apache-2.0，见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。