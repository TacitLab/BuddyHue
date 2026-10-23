# WorkBuddy Skill 集成约定

BuddyHue 的 Skill 应当是“薄编排层”，不在 SKILL.md 内复制注入代码。CLI 是唯一执行入口，Skill 负责收集需求、生成声明式素材、解释结果和请求必要授权。

## 能力一：制作皮肤

1. 收集品牌色、背景图、字体偏好、风格关键词和禁用项。
2. 运行 `wbhue theme create <目录>` 生成工程。
3. 编辑 CSS 和 `buddyhue.json`；素材仅使用 PNG/JPEG/WebP/GIF。
4. 执行 `wbhue theme validate <buddyhue.json> --json`。
5. 若只有 lint 警告，解释风险并继续；格式错误必须修复。
6. 执行 `wbhue theme pack <buddyhue.json> --output <id>.buddyhue-theme --json`。
7. 执行 `wbhue install <id>.buddyhue-theme --json`，把验证后的包加入本地皮肤库。
8. 向用户展示皮肤名称、版本、素材数量、目标应用和警告数。

## 能力二：应用皮肤

1. 执行 `wbhue doctor --json`。
2. 若退出码为 `3`，说明版本尚未验证；只有用户明确同意后才添加 `--allow-untested`。
3. 若用户没有指定皮肤，执行 `wbhue ls --json`，仅从已安装皮肤中选择。
4. 执行 `wbhue preflight <id[@version]|package> --json`，完成包、版本和当前界面的只读检查。
5. 执行 `wbhue apply <id[@version]|package> --json`。
6. 若退出码为 `4`，向用户说明需要重启 WorkBuddy；只有明确同意后才重试并添加 `--restart`。
7. 执行 `wbhue verify <id[@version]|package> --json`。
8. 若验证失败，报告自动回滚结果，并提供 `wbhue restore --json` 作为显式恢复动作。

## 不允许自动做的事

- 未经用户明确同意重启或关闭 WorkBuddy。
- 对未验证版本静默添加 `--allow-untested`。
- 修改 WorkBuddy 的应用包、签名、`app.asar` 或系统安全设置。
- 在皮肤包内加入 JavaScript 或外部 CSS/字体请求。
- 从 DOM 快照收集聊天文本、输入框内容、链接地址或可访问名称。

## 推荐的自然语言

- “环境检查完成，WorkBuddy 版本在已验证范围内。”
- “WorkBuddy 已在运行，但皮肤通道尚未开启。应用皮肤需要重启一次，是否继续？”
- “这个 WorkBuddy 版本还没有经过 BuddyHue 验证。我可以只做兼容性检查，也可以在你确认后尝试应用。”
- “皮肤已应用并通过窗口验证；随时可以说‘恢复默认皮肤’。”
