# 第三方组件声明

本仓库随附以下第三方软件。原始许可与版权归各自作者所有。

## pdfjs-dist 3.11.174

- 位置：`my-courses/vendor/`（`pdf.js`、`pdf.worker.js`、`package.json`）
- 许可：Apache License 2.0 — https://www.apache.org/licenses/LICENSE-2.0
- 版权：Copyright 2012 Mozilla Foundation
- 用途：在浏览器里解析 PDF 的**文本层**（不渲染像素），只读取文字与页码
- 说明：`my-courses/vendor/package.json` 固定 `{"type":"commonjs"}`，因为 pdfjs 3.x 的
  构建产物是 UMD/CJS，而插件本身是 ESM，必须让 `.js` 在 `vendor/` 目录内按 CJS 解释
- 获取方式：`pdfjs-dist@3.11.174` 官方 npm 发布包中的 `legacy/build/pdf.js` 与
  `legacy/build/pdf.worker.js`（未做源码修改）

Apache-2.0 全文见：https://www.apache.org/licenses/LICENSE-2.0

## 参考过实现思路、但未包含其代码的项目

- `dsh-pdf-math-reader`（MIT）：仅参考其「公式行归一化 / 分页拼接」思路，相关逻辑为本仓库重写。