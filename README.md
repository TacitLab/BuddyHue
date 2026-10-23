# BuddyHue

BuddyHue 是 WorkBuddy 的底层皮肤工具。它定义、校验、应用和恢复 `.buddyhue-theme` 皮肤包，对上层 Skill、自动化脚本和未来的皮肤平台提供稳定 CLI 与 JSON 契约。

当前版本：**0.3.0**。首个明确支持范围是 WorkBuddy **5.9.x**；macOS 5.9.1 已完成打包、预检、应用、验证和恢复的真实闭环测试。

## 安全模型

- 不修改 WorkBuddy 的 `app.asar`、应用签名或系统安全设置。
- 皮肤包是声明式 JSON，只包含 CSS、图片、元数据和 DOM 验证规则，不能携带 JavaScript。
- 禁止 `@import` 和外部 `url(...)`，不会从皮肤加载远程 CSS、字体或图片。
- 每个 BuddyHue 包都带 SHA-256 摘要；文件被修改后会拒绝应用。
- 包内声明 WorkBuddy 兼容范围，默认拒绝应用到范围外版本。
- 应用前执行 DOM 预检，应用后执行验证；失败由 CodeDrobe Core 自动回滚。
- WorkBuddy 已运行但没有调试通道时，必须显式添加 `--restart`，CLI 不会静默重启。
- DOM 快照不包含聊天正文、表单值、可访问名称、查询参数或链接内容。

## 安装

要求 Node.js 20.12 或更高版本。

```bash
npm install
npm link
wbhue doctor
```

## 标准使用流程

创建皮肤工程：

```bash
wbhue theme create themes/ocean-brand --name "Ocean Brand"
```

生成的源文件是 `buddyhue.json` 和 `workbuddy.css`。完成样式与素材后：

```bash
wbhue theme validate themes/ocean-brand/buddyhue.json
wbhue theme pack themes/ocean-brand/buddyhue.json \
  --output ocean-brand.buddyhue-theme
wbhue theme inspect ocean-brand.buddyhue-theme
```

安装到本地皮肤库，并通过 ID 应用：

```bash
wbhue install ocean-brand.buddyhue-theme
wbhue ls
wbhue preflight ocean-brand
wbhue apply ocean-brand
wbhue verify ocean-brand
```

同一 ID 可安装多个版本。`apply ocean-brand` 自动选择最高版本，也可使用 `apply ocean-brand@1.0.0` 锁定版本。直接传入皮肤包路径仍然受支持，适合开发和临时测试。

恢复默认外观：

```bash
wbhue restore
```

如果预检显示 WorkBuddy 需要重启，获得用户明确同意后执行：

```bash
wbhue apply ocean-brand --restart
```

## 本地皮肤库

BuddyHue 会管理已经安装的皮肤包，不依赖下载目录长期保存文件：

- macOS：`~/Library/Application Support/BuddyHue/themes/`
- Windows：`%LOCALAPPDATA%\BuddyHue\themes\`
- Linux：`$XDG_DATA_HOME/buddyhue/themes/`，未设置时使用 `~/.local/share/buddyhue/themes/`

每个皮肤按 `ID/版本` 独立保存。删除当前正在使用的版本会被拒绝，需先执行 `wbhue restore`。

## 命令

- `wbhue doctor`：检查安装、版本、运行状态和皮肤通道。
- `wbhue status`：读取活动皮肤和本地应用回执。
- `wbhue install <包>`：验证并安装到本地皮肤库；同版本不同内容需显式添加 `--force`。
- `wbhue ls`：列出所有已安装版本，并标记当前使用的皮肤。
- `wbhue info <id[@version]>`：查看指定皮肤；省略版本时选择最高版本。
- `wbhue remove <id[@version]>`：删除一个版本或该 ID 的所有版本。
- `wbhue preflight <包|引用>`：校验包、应用版本和当前 DOM，全程只读。
- `wbhue probe [包|引用]`：只读探测当前 DOM landmark。
- `wbhue snapshot <输出.json>`：生成隐私收敛的 DOM 快照。
- `wbhue apply <包|引用>`：应用并验证皮肤，失败自动回滚。
- `wbhue verify [包|引用]`：验证活动皮肤和布局状态。
- `wbhue restore`：移除皮肤并清理应用回执。
- `wbhue theme create|validate|pack|inspect`：管理 BuddyHue 皮肤工程和包。

所有主要命令支持 `--json`。JSON 顶层固定包含：

```json
{
  "schemaVersion": 1,
  "tool": { "name": "BuddyHue", "version": "0.3.0" },
  "command": "preflight",
  "ok": true
}
```

## 退出码

| 退出码 | 含义 |
| --- | --- |
| `0` | 成功 |
| `1` | 常规运行错误 |
| `2` | 命令或参数错误 |
| `3` | BuddyHue 尚未验证当前 WorkBuddy 版本 |
| `4` | 需要用户允许重启 WorkBuddy |
| `5` | DOM 兼容性或应用后验证失败 |
| `6` | 皮肤包格式、完整性或输出错误 |
| `7` | 皮肤包声明的版本范围与 WorkBuddy 不兼容 |
| `8` | 未找到 WorkBuddy |
| `9` | 本地皮肤库中没有指定皮肤或版本 |
| `10` | 皮肤库内容冲突，或试图删除正在使用的皮肤 |

## BuddyHue v1 规范

规范文档见 [`docs/theme-spec-v1.md`](docs/theme-spec-v1.md)，JSON Schema 位于：

- [`schemas/buddyhue-manifest.schema.json`](schemas/buddyhue-manifest.schema.json)
- [`schemas/buddyhue-package.schema.json`](schemas/buddyhue-package.schema.json)

BuddyHue 仍可读取旧 `.codedrobe-theme` 包，便于迁移，但只有 `.buddyhue-theme` 提供 BuddyHue 完整性和兼容范围保证。

## 与 CodeDrobe 的关系

BuddyHue 拥有面向 WorkBuddy 的包规范、兼容策略、诊断、状态和 CLI 契约；CodeDrobe Core 作为内部运行时依赖，负责 CDP 连接、CSS 注入、应用后验证和回滚。BuddyHue 不复制或分叉它的安全关键代码。

## 开发

```bash
npm test
npm run check
```

`@codedrobe/core` 采用 Apache License 2.0，归其原作者所有；详见 `NOTICE` 和依赖包许可证。
