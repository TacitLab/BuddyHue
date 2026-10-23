# BuddyHue Theme Package Specification v1

状态：Stable for BuddyHue 0.2.x

扩展名：`.buddyhue-theme`

媒体类型建议：`application/vnd.buddyhue.theme+json`

## 1. 设计目标

BuddyHue v1 是面向 WorkBuddy 的声明式皮肤交换格式。格式需要同时满足：本地 CLI 安全应用、Agent 可生成、文件可分享，以及未来 UGC 平台可索引和校验。

包不能包含可执行代码。运行时能力由 BuddyHue 和受信任的 CodeDrobe Core 提供，皮肤作者只能声明 CSS、受限图片、兼容范围和验证 landmark。

## 2. 源工程

一个最小工程包含：

```text
my-theme/
├── buddyhue.json
└── workbuddy.css
```

`buddyhue.json` 示例：

```json
{
  "$schema": "../../schemas/buddyhue-manifest.schema.json",
  "schemaVersion": 1,
  "id": "ocean-brand",
  "name": "Ocean Brand",
  "version": "1.0.0",
  "description": "A calm blue WorkBuddy theme.",
  "author": "Example Studio",
  "license": "All Rights Reserved",
  "tags": ["blue", "minimal"],
  "compatibility": {
    "workbuddy": ">=5.9.0 <5.10.0"
  },
  "css": "workbuddy.css",
  "images": {
    "background": "assets/background.webp"
  }
}
```

源文件只能引用工程目录内的相对路径，不能使用绝对路径或 `..` 逃逸工程目录。

## 3. 可分发包

`wbhue theme pack` 将 CSS 与图片内联为单个 JSON 文件：

```json
{
  "format": "buddyhue-theme",
  "schemaVersion": 1,
  "createdAt": "2026-10-23T00:00:00.000Z",
  "theme": {
    "id": "ocean-brand",
    "name": "Ocean Brand",
    "version": "1.0.0",
    "author": "Example Studio"
  },
  "compatibility": {
    "workbuddy": ">=5.9.0 <5.10.0"
  },
  "payload": {
    "css": ":root { --buddyhue-accent: #1677ff; }",
    "images": {}
  },
  "integrity": {
    "algorithm": "sha256",
    "digest": "64-character-lowercase-hex"
  }
}
```

## 4. 兼容范围

v1 只接受以下形式：

```text
>=最低版本 <最高版本
```

例如 `>=5.9.0 <5.10.0`。上界不包含在内。固定语法是有意设计：避免不同 SemVer 实现产生不一致结果，也便于 Agent 和平台静态校验。

## 5. CSS 与资源限制

- CSS 最大 1 MiB。
- 整包最大 30 MiB。
- 最多 32 张图片。
- 图片仅支持 PNG、JPEG、WebP 和 GIF。
- 图片 ID 必须匹配 `[A-Za-z0-9][A-Za-z0-9_-]*`。
- 禁止 `@import`。
- 禁止非 `data:` 的 `url(...)`；外部字体、图片和网络请求均被拒绝。
- 包内不能出现 JavaScript renderer、插件、命令或生命周期脚本。

打包图片在运行时暴露为 CSS 变量 `--codedrobe-image-<id>`。这是当前运行时桥接名称，皮肤作者不应依赖任何其他 CodeDrobe 内部状态。

## 6. 完整性

`integrity.digest` 是包中除 `integrity` 字段外所有内容的规范化 JSON SHA-256。对象键按字典序排列，数组顺序保留。

完整性摘要用于检测传输损坏和未声明修改，不等价于作者签名。v1 不定义签名或 DRM；未来平台可在不破坏 v1 本地包的前提下增加独立签名和授权层。

## 7. 应用事务

BuddyHue 的标准事务为：

1. 读取文件并验证扩展名、大小和 JSON 结构。
2. 验证 SHA-256 完整性。
3. 验证 WorkBuddy 安装版本与包的兼容范围。
4. 对已连接窗口执行只读 DOM landmark 预检。
5. 注入 CSS 和图片变量。
6. 验证 stylesheet、主题 ID、布局溢出和必需 landmark。
7. 任何步骤失败时移除 renderer 变更并回滚 host 设置。
8. 成功后写入最小本地应用回执；恢复时清理回执。

## 8. 向后兼容

BuddyHue 0.2 可直接读取 `.codedrobe-theme` 作为迁移格式。旧格式没有 BuddyHue 兼容范围和完整性摘要，`theme inspect` 与 `preflight` 会明确显示这些字段缺失。

BuddyHue v1 解析器拒绝未知字段。新增结构性能力需要提升 `schemaVersion`，防止旧客户端静默忽略影响安全或展示的重要字段。
