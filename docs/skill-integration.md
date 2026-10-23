# WorkBuddy Skill 集成约定

BuddyHue 的 Skill 应当是“薄编排层”，不在 SKILL.md 内复制注入代码。CLI 是唯一执行入口，Skill 负责收集需求、生成声明式素材、解释结果和请求必要授权。

## 能力一：制作皮肤

1. 收集品牌色、背景图、字体偏好、风格关键词和禁用项。
2. 复制 `themes/starter` 到新的工作目录。
3. 编辑 CSS 和 `theme.json`；素材仅使用 PNG/JPEG/WebP/GIF。
4. 执行 `wbhue theme validate <theme.json> --json`。
5. 若只有 lint 警告，解释风险并继续；格式错误必须修复。
6. 执行 `wbhue theme pack <theme.json> --output <id>.codedrobe-theme --json`。
7. 向用户展示皮肤名称、版本、素材数量、目标应用和警告数。

## 能力二：应用皮肤

1. 执行 `wbhue doctor --json`。
2. 若退出码为 `3`，说明版本尚未验证；只有用户明确同意后才添加 `--allow-untested`。
3. 执行 `wbhue probe <package> --json`，只读检查当前界面。
4. 执行 `wbhue apply <package> --json`。
5. 若退出码为 `4`，向用户说明需要重启 WorkBuddy；只有明确同意后才重试并添加 `--restart`。
6. 执行 `wbhue verify <package> --json`。
7. 若验证失败，报告自动回滚结果，并提供 `wbhue restore --json` 作为显式恢复动作。

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
