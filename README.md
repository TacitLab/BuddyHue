# BuddyHue

BuddyHue 是面向 WorkBuddy 的皮肤 CLI。它把 CodeDrobe Core 的安全注入能力封装成更容易理解、可以被 WorkBuddy Skill 稳定调用的一组命令。

当前 MVP 明确适配 WorkBuddy **5.9.x**，并已识别新版 macOS bundle ID `com.tencent.workbuddy.mac`。运行时不修改 `app.asar` 或应用签名；皮肤通过本机回环地址上的 Chromium DevTools Protocol 注入，应用失败会由 CodeDrobe Core 自动回滚。

## 快速开始

要求 Node.js 20.12 或更高版本。

```bash
npm install
npm link
wbhue doctor
```

制作和检查皮肤：

```bash
wbhue theme create themes/ocean-brand --name "Ocean Brand"
wbhue theme validate themes/starter/theme.json
wbhue theme pack themes/starter/theme.json --output starter.codedrobe-theme
wbhue theme inspect starter.codedrobe-theme
```

应用、验证和恢复：

```bash
wbhue apply starter.codedrobe-theme
wbhue verify starter.codedrobe-theme
wbhue restore
```

如果 WorkBuddy 已在运行但不是由 BuddyHue 启动，第一次应用会返回“需要重启”，不会自行结束应用。明确允许后再执行：

```bash
wbhue apply starter.codedrobe-theme --restart
```

开发皮肤时可以保持自动重注入：

```bash
wbhue apply starter.codedrobe-theme --restart --watch
```

## 给 WorkBuddy / Skill 调用

所有主要命令都支持 `--json`，成功结果写到标准输出，错误结果写到标准错误，并提供稳定退出码：

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `1` | 常规错误 |
| `2` | 参数或命令错误 |
| `3` | WorkBuddy 版本尚未验证 |
| `4` | 需要用户允许重启 WorkBuddy |
| `5` | DOM 兼容性或应用后验证失败 |

对企业小白用户，Skill 只需要把自然语言转换为以下安全流程：

1. 永远先运行 `wbhue doctor --json`。
2. 制作皮肤时先 `theme validate`，再 `theme pack`。
3. 应用前向用户展示皮肤名称、版本和是否需要重启。
4. 只有在用户明确同意后才添加 `--restart` 或 `--allow-untested`。
5. 应用后运行 `verify`；失败时保留 BuddyHue/Core 的自动回滚结果。

## 皮肤格式

BuddyHue 直接使用声明式 `.codedrobe-theme` 包。源项目最少包含一个 `theme.json` 和一份 CSS；可选图片会被打包为 data URL。皮肤包不能携带 JavaScript，也不允许外部 CSS 资源。

可从 [`themes/starter`](themes/starter) 复制最小模板。为降低 WorkBuddy 升级后的失效概率，优先使用 CSS 变量、语义属性和稳定容器；不要依赖长层级、位置选择器或本地化文案。

## 命令

- `wbhue doctor`：检查安装版本、运行状态和皮肤通道。
- `wbhue status`：读取当前 BuddyHue 皮肤。
- `wbhue probe [皮肤包]`：只读检查当前 DOM 是否兼容。
- `wbhue snapshot <输出.json>`：生成不包含文本和表单值的只读 DOM 快照。
- `wbhue apply <皮肤包>`：应用皮肤并验证，失败自动回滚。
- `wbhue verify [皮肤包]`：确认皮肤仍在且布局未出现横向溢出。
- `wbhue restore`：移除 BuddyHue 注入，恢复默认外观。
- `wbhue theme create|validate|pack|inspect`：创建、制作和检查皮肤包。

## 与直接使用 CodeDrobe 的区别

CodeDrobe Core 是通用运行时；BuddyHue 是 WorkBuddy 产品层。BuddyHue 维护 WorkBuddy 版本兼容范围、新旧安装标识、中文诊断、企业可消费的 JSON 契约、明确的重启授权和面向 Skill 的低风险工作流。底层运行时仍作为依赖复用，避免分叉安全关键代码。

## 开发

```bash
npm test
npm run check
```

`@codedrobe/core` 采用 Apache License 2.0，归其原作者所有；详见 `NOTICE` 和依赖包许可证。
