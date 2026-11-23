# 生效方式与回滚

插件不是「复制安装」到 DSH 的，而是由 profile 以 `link:`（软链）指向源码目录。所以**改源码 = 改插件本体**，但两半的生效方式不同。

## 1. 装到 DSH 里

`package.json` 已经声明好两件事：

- `dsh.bundle.patch` → `cordis.patch.yml`，插件把自己插进 Cordis 树（`id: my-courses`）
- `dsh.client.inject` → 依赖 locale / layout / sidebar / workspace 四个客户端模块

把 `my-courses/` 放到 DSH 插件目录（或 profile 的 `node_modules/@local/my-courses`）并在 profile 的 `package.json` 里登记：

```json
{
  "dependencies": { "@local/my-courses": "link:../path/to/my-courses" },
  "bundles": ["@local/my-courses"]
}
```

然后 `pnpm install` 一次即可。之后改源码不需要重装。

确认软链指向正确：

```powershell
Get-Item "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\@local\my-courses" |
  Select-Object LinkType, Target
```

## 2. 改完怎么生效

| 改动 | 生效方式 | 原因 |
| --- | --- | --- |
| `client.js`（页面布局、便利贴 CSS、论文卡片、工作台、文案字典） | **刷新页面**：`Ctrl+R`，没变就 `Ctrl+Shift+R` | Host 每次页面加载都从磁盘读取浏览器入口 |
| `index.js`（路由、arXiv 抓取、质量门、模型调用） | **重启 DSH 桌面应用** | Host 半在进程启动时 `import` 后常驻，刷新浏览器不会重载 |
| `package.json` / `locale/*.json` / `icon.svg` 等元数据 | 重启 DSH 桌面应用 | locale 的 meta 在启动时读索引 |

注意：

- **重启会中断当前 DSH 会话**（包括正在运行的 agent），把验收动作做完再重启。
- 没有跑 `pnpm run dev:web` 时没有 HMR，必须手动刷新/重启。
- **localStorage 按 origin 隔离**：GUI 端口变了（`127.0.0.1:<port>` 变化），旧端口下的课表/待办/论文数据不会自动跟过来。切换前先在「我的课表 → 导出」存一份 JSON。
- 论文全文字符串只放宿主内存 `Map`，重启即丢；重开需要重新抓取（`paper/status` 的 `papers` 计数可用来判断缓存里还有几篇）。

## 3. 自检

```bash
node -p "require('./my-courses/package.json').version"   # 期望 1.5.0
node check-client.mjs && node check-logic.mjs && node check-host.mjs
```

浏览器 Console 里也能直接打宿主路由：

```js
fetch('/my-courses/paper/status').then(r => r.json()).then(console.log);
// { ok: true, llm: { available, provider, model }, papers: <缓存篇数> }
```

## 4. 回滚

代码用 git，数据用导出：

```bash
git log --oneline          # 找到要回退的提交
git checkout <commit> -- my-courses/   # 只回退插件源码
git checkout <commit> -- check-*.mjs   # 门禁脚本与源码版本保持一致
```

数据侧：

- 课程/待办/论文**存储版本号**为 `version: 11`，读旧数据会自动幂等迁移；但**旧代码读新数据会丢字段**（未知字段被忽略，下一次保存写回旧版本号）。回滚前必须先从「我的课表 → 导出」备份。
- 论文缓存文件在 `~/.dsh/cache/my-courses/papers/*.json`，可直接删除；删了只是下次重抓。
- `localStorage` 里就一个键 `dsh.my-courses.v2`，清掉等于重置插件数据。