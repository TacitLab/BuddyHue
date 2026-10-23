import {
  apply,
  BUDDYHUE_VERSION,
  createThemeProject,
  doctor,
  home,
  infoTheme,
  installTheme,
  inspectTheme,
  listThemes,
  packTheme,
  preflight,
  probe,
  removeTheme,
  restore,
  snapshot,
  status,
  validateTheme,
  verify,
  watch
} from "./buddyhue.mjs";

const HELP = `BuddyHue — WorkBuddy 专属皮肤工具

用法：
  wbhue doctor [--json]
  wbhue status [--json]
  wbhue home [--json]
  wbhue install <皮肤包> [--force] [--json]
  wbhue ls [--json]
  wbhue info <id[@version]> [--json]
  wbhue remove <id[@version]> [--json]
  wbhue probe [皮肤包|id[@version]] [--json]
  wbhue preflight <皮肤包|id[@version]> [--json]
  wbhue apply <皮肤包|id[@version]> [--restart] [--watch] [--allow-untested]
  wbhue verify [皮肤包|id[@version]] [--json]
  wbhue restore [--json]
  wbhue snapshot <输出.json> [--max-nodes 1500]
  wbhue theme create <目录> [--id <id>] [--name <名称>]
  wbhue theme validate <buddyhue.json>
  wbhue theme pack <buddyhue.json> --output <name.buddyhue-theme> [--force]
  wbhue theme inspect <name.buddyhue-theme>

通用选项：
  --json                 输出稳定 JSON，供 WorkBuddy Skill 或脚本调用
  --port <端口>          指定 CDP 端口，默认 9336
  --timeout-ms <毫秒>    等待时间，默认由 CodeDrobe Core 决定
  --app-path <路径>      指定 WorkBuddy.app、安装目录或可执行文件
  -h, --help             显示帮助
`;

function parse(argv) {
  const positionals = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      positionals.push(item);
      continue;
    }
    const [rawName, inline] = item.slice(2).split("=", 2);
    const name = rawName.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (["json", "restart", "watch", "allowUntested", "force", "includeHidden"].includes(name)) {
      flags[name] = true;
      continue;
    }
    const value = inline ?? argv[++index];
    if (value === undefined) throw new Error(`选项 --${rawName} 缺少值。`);
    flags[name] = value;
  }
  if (flags.port !== undefined) flags.port = numberFlag("port", flags.port, 1, 65535);
  if (flags.timeoutMs !== undefined) flags.timeoutMs = numberFlag("timeout-ms", flags.timeoutMs, 250, 300000);
  if (flags.maxNodes !== undefined) flags.maxNodes = numberFlag("max-nodes", flags.maxNodes, 1, 10000);
  return { positionals, flags };
}

function numberFlag(name, value, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`--${name} 必须是 ${min} 到 ${max} 之间的整数。`);
  }
  return parsed;
}

function requireValue(value, usage) {
  if (!value) {
    const error = new Error(`缺少必要参数。用法：${usage}`);
    error.code = "BUDDYHUE_USAGE";
    throw error;
  }
  return value;
}

function human(result) {
  if (result.command === "doctor") {
    const version = result.installation?.version ?? "未找到";
    return [
      `${result.ok ? "✓" : "!"} WorkBuddy：${version}`,
      `${result.versionSupported ? "✓" : "!"} 支持范围：${result.supportedRange}`,
      `${result.running ? "✓" : "·"} 运行状态：${result.running ? "运行中" : "未运行"}`,
      `${result.cdp.ready ? "✓" : "·"} 皮肤通道：${result.cdp.ready ? `已连接（${result.cdp.targetCount} 个窗口）` : "未连接"}`,
      `建议：${result.guidance}`
    ].join("\n");
  }
  if (result.command === "status") {
    return result.theme
      ? `当前皮肤：${result.theme.id} ${result.theme.version}`
      : `当前未检测到 BuddyHue 皮肤。${result.running && !result.cdp.ready ? " WorkBuddy 未通过 BuddyHue 启动，无法读取窗口状态。" : ""}`;
  }
  if (result.command === "home") return `BuddyHue：${result.directory}\n皮肤库：${result.themes}\n状态：${result.state}`;
  if (result.command === "preflight") {
    return [
      `${result.ready ? "✓" : "!"} 预检：${result.ready ? "可以应用" : "暂不可应用"}`,
      `皮肤：${result.artifact.theme.name} ${result.artifact.theme.version}`,
      `包完整性：${result.artifact.integrity ? "已通过 SHA-256 校验" : "旧格式，无 BuddyHue 完整性字段"}`,
      `WorkBuddy：${result.compatibility.appVersion ?? "未找到"}`,
      `需要重启：${result.requiresRestart ? "是" : "否"}`
    ].join("\n");
  }
  if (result.command === "install") {
    return `${result.alreadyInstalled ? "✓ 已在皮肤库中" : "✓ 已安装"}：${result.theme.name} ${result.theme.version}\nID：${result.theme.id}`;
  }
  if (result.command === "ls") {
    if (!result.themes.length) return `本地皮肤库为空。\n目录：${result.directory}`;
    const lines = result.themes.map((theme) => `${theme.active ? "●" : "·"} ${theme.name} ${theme.version}  (${theme.id})`);
    return [`已安装皮肤：${result.themes.length}`, ...lines, ...(result.errors.length ? [`警告：${result.errors.length} 个无效文件`] : [])].join("\n");
  }
  if (result.command === "info") {
    return `${result.theme.active ? "● 当前使用\n" : ""}${result.theme.name} ${result.theme.version}\nID：${result.theme.id}\n兼容范围：${result.theme.compatibility.workbuddy}\n文件：${result.theme.file}`;
  }
  if (result.command === "remove") return `✓ 已删除 ${result.removed.length} 个皮肤版本。`;
  if (result.command === "theme validate") return `✓ 皮肤有效：${result.theme.name} ${result.theme.version}\n兼容范围：${result.compatibility.workbuddy}\n警告：${result.warnings.length}`;
  if (result.command === "theme create") return `✓ 已创建皮肤工程：${result.output}\n下一步：编辑 workbuddy.css，然后运行 wbhue theme validate ${result.manifest}`;
  if (result.command === "theme pack") return `✓ 已打包：${result.output}\n警告：${result.warnings.length}`;
  if (result.command === "theme inspect") return `${result.theme.name} ${result.theme.version}\nID：${result.theme.id}\n格式：${result.format}\n兼容范围：${result.compatibility?.workbuddy ?? "旧格式未声明"}\n完整性：${result.integrity ? "通过" : "未提供"}\n图片：${result.images.length}\n警告：${result.warnings.length}`;
  if (result.command === "snapshot") return `✓ 已生成只读诊断快照：${result.output}（${result.targetCount} 个窗口）`;
  if (result.action === "apply") return `✓ 已应用皮肤：${result.theme.displayName} ${result.theme.version}\nWorkBuddy：${result.compatibility.appVersion}\n窗口：${result.targets.length}`;
  if (result.action === "restore") return result.renderer.restored ? "✓ 已恢复 WorkBuddy 默认外观。" : `! 主机设置已恢复，但窗口未连接：${result.renderer.message}`;
  if (Array.isArray(result.targets)) return `${result.ok ? "✓" : "!"} ${result.command}：检查了 ${result.targets.length} 个窗口。`;
  return result.ok ? "✓ 完成" : "! 未完成";
}

function exitCodeFor(error) {
  if (error.code === "BUDDYHUE_USAGE") return 2;
  if (error.code === "BUDDYHUE_UNSUPPORTED_VERSION") return 3;
  if (error.code === "CODEDROBE_RESTART_REQUIRED") return 4;
  if (["CODEDROBE_VERIFY_FAILED", "CODEDROBE_DOM_INCOMPATIBLE", "CODEDROBE_TARGET_TIMEOUT"].includes(error.code)) return 5;
  if (["BUDDYHUE_INVALID_PACKAGE", "BUDDYHUE_INTEGRITY_FAILED", "BUDDYHUE_OUTPUT_EXISTS"].includes(error.code)) return 6;
  if (error.code === "BUDDYHUE_THEME_INCOMPATIBLE") return 7;
  if (error.code === "BUDDYHUE_APP_NOT_FOUND") return 8;
  if (error.code === "BUDDYHUE_THEME_NOT_INSTALLED") return 9;
  if (["BUDDYHUE_LIBRARY_CONFLICT", "BUDDYHUE_ACTIVE_THEME"].includes(error.code)) return 10;
  return 1;
}

function jsonEnvelope(result) {
  return {
    schemaVersion: 1,
    tool: { name: "BuddyHue", version: BUDDYHUE_VERSION },
    ...result
  };
}

export function safeErrorMessage(message) {
  return String(message).replace(/\b(?:file|https?):\/\/[^\s)]+/gi, (value) => {
    try {
      const parsed = new URL(value);
      parsed.search = "";
      parsed.hash = "";
      return parsed.toString();
    } catch {
      return value.split(/[?#]/, 1)[0];
    }
  });
}

export async function run(argv, io = console) {
  let parsed;
  try {
    if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
      io.log(HELP);
      return 0;
    }
    parsed = parse(argv);
    const { positionals, flags } = parsed;
    const [command, subcommand] = positionals;
    let result;
    if (command === "doctor") result = await doctor(flags);
    else if (command === "status") result = await status(flags);
    else if (command === "home") result = home(flags);
    else if (command === "install") result = await installTheme(requireValue(subcommand, "wbhue install <皮肤包>"), flags);
    else if (["ls", "list"].includes(command)) result = await listThemes(flags);
    else if (command === "info") result = await infoTheme(requireValue(subcommand, "wbhue info <id[@version]>"), flags);
    else if (command === "remove") result = await removeTheme(requireValue(subcommand, "wbhue remove <id[@version]>"), flags);
    else if (command === "probe") result = await probe({ ...flags, theme: subcommand });
    else if (command === "preflight") result = await preflight(requireValue(subcommand, "wbhue preflight <皮肤包|id[@version]>"), flags);
    else if (command === "apply") {
      const theme = requireValue(subcommand, "wbhue apply <皮肤包|id[@version]>");
      result = await apply(theme, flags);
      if (flags.watch) {
        io.log(flags.json ? JSON.stringify(jsonEnvelope(result), null, 2) : human(result));
        await watch(theme, { ...flags, onEvent: flags.json ? (event) => io.log(JSON.stringify(jsonEnvelope({ command: "watch", event }))) : undefined });
        return 0;
      }
    } else if (command === "verify") result = await verify(subcommand, flags);
    else if (command === "restore") result = await restore(flags);
    else if (command === "snapshot") result = await snapshot(requireValue(subcommand, "wbhue snapshot <输出.json>"), flags);
    else if (command === "theme" && subcommand === "create") result = await createThemeProject(
      requireValue(positionals[2], "wbhue theme create <目录>"),
      flags
    );
    else if (command === "theme" && subcommand === "validate") result = await validateTheme(requireValue(positionals[2], "wbhue theme validate <buddyhue.json>"));
    else if (command === "theme" && subcommand === "pack") result = await packTheme(
      requireValue(positionals[2], "wbhue theme pack <buddyhue.json> --output <name.buddyhue-theme>"),
      requireValue(flags.output, "wbhue theme pack <buddyhue.json> --output <name.buddyhue-theme>"),
      flags
    );
    else if (command === "theme" && subcommand === "inspect") result = await inspectTheme(requireValue(positionals[2], "wbhue theme inspect <皮肤包>"));
    else {
      const error = new Error(`未知命令：${positionals.join(" ")}`);
      error.code = "BUDDYHUE_USAGE";
      throw error;
    }
    io.log(flags.json ? JSON.stringify(jsonEnvelope(result), null, 2) : human(result));
    return result.ok === false ? 5 : 0;
  } catch (error) {
    const code = exitCodeFor(error);
    const message = safeErrorMessage(error.message);
    if (parsed?.flags.json) {
      io.error(JSON.stringify(jsonEnvelope({ ok: false, error: { code: error.code ?? "BUDDYHUE_ERROR", message }, exitCode: code }), null, 2));
    } else {
      io.error(`BuddyHue：${message}`);
      if (error.code === "CODEDROBE_RESTART_REQUIRED") io.error("请重新执行并添加 --restart；BuddyHue 仅在你明确允许时重启 WorkBuddy。");
    }
    return code;
  }
}

export { parse };
