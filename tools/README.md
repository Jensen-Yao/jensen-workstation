# 开发工具

插件运行时只需要根目录的 `main.js`、`manifest.json`、`styles.css`。模块源码在 `src/`，修改后先构建。

```powershell
node tools/build.mjs
node --check main.js
node --test tests/core.test.cjs
```

实机验证需要 Obsidian 以 `--remote-debugging-port=9223` 启动，并已载入当前插件：

```powershell
node tools/verify-v020.mjs
node tools/verify-v022.mjs
node tools/check-surfaces.mjs
```

两个 verify 脚本文件名沿用原开发版本，始终验证当前载入的代码。它们只在独立临时目录中创建测试文献，结束时恢复配置并清理测试文件。检索和 AI 测试使用受控响应。

| 文件 | 用途 |
| --- | --- |
| `build.mjs` | 将模块与样式嵌入发行文件，无运行时依赖 |
| `cdp.mjs` | 连接 Obsidian，包含超时和异常处理 |
| `verify-v020.mjs` | PDF、批注、文献库与原生侧栏集成检查 |
| `verify-v022.mjs` | 页面、方向标签、投稿、设置与布局集成检查 |
| `check-surfaces.mjs` | 九主页面和四助手模式的界面检查 |
| `capture-v020.mjs` | 首页明暗预览，可指定截图版本名称 |
| `capture-v022.mjs` | 各页面、紧凑期刊、桌面和独立设置窗口截图 |
| `eval.mjs` / `run.mjs` | 执行单个诊断表达式或本地诊断脚本 |
| `jobs/reload-v020.js` | 保存待处理批注和阅读位置后重载插件 |

报告写入忽略的 `.jrs-tmp/`，界面检查截图写入忽略的 `shots/`；工具会按需创建目录。公开预览保存在 `screenshots/`。

历次一次性补丁、迁移脚本、旧 QA jobs 和旧采证循环已退出当前工具集，可通过 v0.19.0 及更早的 Git 历史查阅。不要重放旧脚本来修改当前文献库。
