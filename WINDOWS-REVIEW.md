# Windows 兼容性审查

审查日期：2026-11-14。基线：`fix/chrome157-mv3`，提交
`5e78ce7258aaa04021934924ee2cf4a303044cd0`。

可复用的操作步骤见 [Windows 修复说明](artifacts/windows-native-messaging/README.md)。
本文引用的运行 JSON、反汇编输出及 EXE 备份只保留在本机，通过 `.gitignore` 排除；
仓库保存复现脚本和验证结论。两份 `ChromeManifest` JSON 是固定哈希的配置模板。

## 结论

**实际测试确认需要 Windows 认证兼容处理；本机补丁后认证已通过。**
主机注册和清单路径解决后，点击扩展仍曾使 1Password 报告
`Unknown is connected but its code signature could not be verified.`，并禁用填充。
静态跟踪定位到 Helper 的签名者名称列表仍接受 `Google Inc`，
本机 Chrome 的有效签名者是 `Google LLC`。用户已明确授权更新这一名称，
并接受 Helper 自身原有 AgileBits Authenticode 签名失效。候选已应用，
重新启动隔离 Chrome 后，连接、认证、Native Messaging 和发送就绪状态均为 true。
断开调试后空闲 135 秒及浏览器再次重启的状态检查均通过。
用户确认点击图标不再出现签名错误；实际填充未测试。

初次审查时 Native Messaging 未勾选，因此当时不能从缺少注册判断
浏览器认证故障。用户随后启用功能、批准清单路径修复并实际点击扩展，
新证据改变了初次的条件性结论。后续证据和精确定位见本文末尾。

项目的 macOS 修复修改 Apple code-signing requirement，针对
1Password 6.8.9；它不适用于 Windows 的 1Password 4。
Chrome 的 Authenticode 签名有效，也不能单独证明旧版 1Password
一定接受该浏览器：这一点仍需启用功能后的实际连接来确认。

## 初次本机只读检查

| 项目 | 结果 |
| --- | --- |
| 系统 | Microsoft Windows 11 专业版，64 位，10.0.26300；注册表 UBR 9974、DisplayVersion 26H2 |
| Chrome | `C:\Program Files\Google\Chrome\Application\chrome.exe`，157.0.8103.51 |
| Chrome 签名 | `Valid`，签名主体 CN/O 为 Google LLC |
| Chrome 证书指纹 | `607A3EDAA64933E94422FC8F0C80388E0590986C` |
| 1Password | `C:\Program Files (x86)\1Password 4\1Password.exe`，文件和产品版本均为 4.6.2.626 |
| 卸载登记 | DisplayName 为 1Password 4.6.2.626；DisplayVersion 仅为 4.0，不能用它判断精确版本 |
| Native Messaging 选项 | 用户确认未勾选；未更改该选项 |
| 旧版主机注册 | HKCU、HKLM 的 Registry32、Registry64 四个视图均不存在 `2bua8c4s2c.com.agilebits.1password` |
| Chrome 其他主机 | 已检查的注册中没有其他 1Password 主机；第三方主机登记未更改 |
| Chrome 策略 | HKCU/HKLM 的 `Software\Policies\Google\Chrome` 键均不存在；此检查不覆盖云端策略 |
| 主机 EXE | 安装目录内存在 `1Password.NativeMessagingHost.exe`，文件版本 6.8.452，签名 `Valid`、AgileBits Inc. |
| Helper | 安装目录内存在 `Agile1pAgent.exe`，4.6.2.626，签名 `Valid`、AgileBits Inc.；初次进程筛选未覆盖其名称，运行状态应以后续更正检查为准 |
| .NET | 主机声明目标 .NET Framework 4.6.1；本机 v4 Full 登记为 4.8.10008、Install=1 |

系统注册表的 ProductName 仍显示 Windows 10 Pro；系统名称采用
`Win32_OperatingSystem.Caption` 的 Windows 11 结果。

安装目录内的 `ChromeManifest.json` 是未注册的文件，其字段为：

- `name`：`2bua8c4s2c.com.agilebits.1password`。
- `type`：`stdio`。
- `path`：`\1Password.NativeMessagingHost.exe`。
- `allowed_origins`：包含 Beta ID `phicbbndgmmpogmijjkbmdhpioaieaha`，
  也包含稳定版 ID `aomjjhallfgjeglblehebfpbcfeobpgk` 等原有 ID。

该 path 是磁盘根目录相对路径，不能定位安装目录中的真实 EXE。
但 Chrome 当前没有注册指向这份文件；它可能是启用时待更新的清单。
**不能把这个未注册文件直接判定为正在使用的损坏配置。**
应在启用功能后读取注册键真正指向的清单，再决定是否需要配置修复。

## 项目审查结果

### 1. 当前可验证的候选是 4.7.6.1

`legacy_chrome_extension/4.7.6.1/manifest.json` 使用 MV3，
worker 为 `background.js`，最低 Chrome 116，包含 `nativeMessaging`。
对 manifest 的 key 做 SHA-256 并按 Chrome 的 ID 编码规则计算，得到
`phicbbndgmmpogmijjkbmdhpioaieaha`，与指南及本机清单允许列表一致。

`global.min.js:109` 的 Native Messaging 消息封装使用版本 5 和
`bundleId: 'com.google.Chrome'`；`:113` 指定旧版主机名。
`:88` 的 hello 仍声明历史版本 `4.7.6.b1`。
审查发现的明确 OS 分支在 `:13`、`:265`：默认重连等待 20 秒，
macOS 改为 1.5 秒。没有从这些代码中发现需要替换的 Windows 主机名、
磁盘路径或 Windows 签名字符串。

这是静态结论，不能证明 Windows Helper 的浏览器认证一定通过。

### 2. 4.7.5.90_0 的入口不提供实际填充核心

`legacy_chrome_extension/4.7.5.90_0/manifest.json:4` 选择
`minimal-service-worker.js`。该文件只实现 getversion/ping 等占位响应，
没有导入旧版核心，也没有调用 `connectNative`。
因此，加载该目录并看到 worker 启动，不代表桌面连接或填充可用。
建议文档明确以 4.7.6.1 为验证入口，避免把这个目录当成可用基线。

### 3. Windows 指南的 EXE 检查会误判合法相对路径

`WINDOWS11-TEST.md:156` 直接对 `$Manifest.path` 执行 `Test-Path`。
Windows Native Messaging 清单允许相对于清单目录的 EXE 路径；
当前命令会相对于 PowerShell 工作目录检查，产生假阴性。
建议区分完整路径、普通相对路径和根目录相对路径，并按清单目录解析
普通相对路径后再检查。注册查询可统一采用显式 Registry32/Registry64
视图，避免依赖运行 PowerShell 的位数。

### 4. Windows 指南的 Chrome 参数需要保留路径引号

`WINDOWS11-TEST.md:224` 的 `Start-Process -ArgumentList` 会把数组拼接为
命令行；`:225` 没有在传给进程的字符串中保留 profile 路径的引号。
当 TEMP 路径含空格时，`--user-data-dir` 会被拆分，无法保证使用预期目录。
建议使用单个参数字符串，并把 profile 值括在实际传递的双引号内。
本机 TEMP 路径当前不含空格，因此没有在本机触发这一条件。

### 5. 后续验证必须确认实际连接类型

`global.min.js:266` 在收到精确的 host-not-found 错误后会尝试旧版
localhost WebSocket 连接。因此，不能仅凭“没有 Native Messaging 错误”
或工具栏出现，就报告 Native Messaging 成功；需要确认实际 Native
Messaging 连接和认证完成。

Go & Fill 使用 `tabs.onUpdated` 模拟原阻塞重定向，仍按 `REPAIR.md`
作为实验功能处理。这属于共享 MV3 行为，尚无 Windows 专属缺陷证据。

## 初次审查的验证与证据边界

- 检查工作树、提交、两个 manifest、worker 和相关历史 bundle。
- 检查系统版本、程序文件版本、签名、主机清单和四个注册表视图。
- 四个实际加载的 JS 文件通过 `node --check`。
- 使用真实 `background.js`、SJCL 和 `global.min.js`，在 Node VM 中提供
  Windows navigator 与模拟 Chrome API：核心成功初始化，无初始化错误，
  请求正确主机名，并注册 toolbar、context menu、tab 和 runtime 事件。
  所有 Native Messaging、storage 和 tabs 调用均为模拟对象。
- REA 静态检查确认安装的主机是 .NET Framework CIL 程序；主机的
  `Main` 包含 `ValidateExtensionAndManifest` 和 `ChoseClientToServe` 调用，
  其常量包含本扩展 origin 及 `Agile1pAgent.exe`。

REA 返回的主机身份证据：
`ev_0325b231229c2bc71a03ed1c6ac43d1feef545d34b1219cd05c3781f6d2cd9bd`。
成员检查证据：
`ev_a1338b7ac93c37f9470cb8983b62f9c42b50c11480da03a04a147e7da442744b`。
扩展静态分析证据：
`ev_810c2fce134cea416c65cb9c7e9d4d18ea3313296640d62e8b8682fe7c123c9e`，
其图覆盖为 partial；没有把静态分析当作执行证据。

没有启动真实 Native Messaging 主机，没有加载隔离 Chrome 扩展，
没有执行 90 秒空闲、浏览器重启或真实填充测试。
没有读取密码库、配对秘密或协议内容，没有更改注册表、安装清单、
应用选项或 EXE/DLL。新增文件仅为本报告。

## 是否需要 Windows 修复的下一步判据

1. 通过 1Password 的菜单启用 Native Messaging，然后重新审计注册键
   和其指向的清单。启用后是否自动修正路径，目前尚未验证。
2. 若注册及清单正确，在隔离 Chrome profile 中加载 4.7.6.1，
   验证 Native Messaging 认证、关闭 DevTools 后空闲 90 秒和重启。
3. 若启用后仍缺注册或路径无效，才提出最小 Windows 配置修复：
   使用有效主机路径、保留原允许列表，备份相关登记和清单后修改。
4. 若主机能启动但明确报告浏览器签名/认证拒绝，再研究 Windows 的
   认证实现。目前没有该错误的运行证据，不能提前建议二进制补丁。

上述为初次审查的下一步判据；后续结果如下。

## 后续验证：清单修复已完成，Windows 签名者不兼容已定位

### 已完成的配置修复

用户启用 Native Messaging 后，HKCU 的两个 RegistryView 均能读到主机注册，
指向安装目录的 `ChromeManifest.json`，但其中根目录相对路径没有自动修正。
在用户批准写入并通过管理员权限执行后，仅修改该 JSON 的 `path` 字段为：

```text
C:\Program Files (x86)\1Password 4\1Password.NativeMessagingHost.exe
```

允许列表、其余字段及原 UTF-8 BOM 保持不变。原清单备份为
`artifacts/windows-native-messaging/ChromeManifest.original.json`。
安装清单的新 SHA-256：
`2def5cf7f03c7611d6464728b37673567aa93c06f55e8e11476a4735f3a70585`。
主机 EXE 的哈希与初次审查一致；未修改注册表或任何 EXE/DLL。

随后打开独立临时 Chrome profile。用户手动加载 4.7.6.1，加载阶段未报错。
本地 CDP 目标列表确认存在预期 ID 的 `background.js` service worker。
用户点击扩展后出现签名拒绝弹窗；未执行真实登录或读取密码项目。
因此不报告认证、填充或生命周期成功。

### 主机与 Helper 的责任边界

REA 对主机 CIL 的静态检查显示：

- `ValidateExtensionAndManifest` 接受本扩展 origin，但不验证 Chrome 签名。
- `ChoseClientToServe` 在未发现现代桌面 EXE 时选择 `Agile1pAgent`。
- 主机连接 `\\.\pipe\1password4.<Windows SessionId>`，先发送长度 1 和
  UTF-8 `~`，然后转发浏览器消息；没有附加浏览器名称或 PID。
- 主机成员库存没有父进程或证书 API，也没有 P/Invoke。

成员证据仍为
`ev_a1338b7ac93c37f9470cb8983b62f9c42b50c11480da03a04a147e7da442744b`；
原生边界证据为
`ev_dfa48cddd5af8113ffee87e7266283234d79be684f4b81609f465b42efaef7e3`。

后续以进程快照与只读进程路径查询确认实际父链为：
`1Password.NativeMessagingHost.exe → cmd.exe → chrome.exe`。
Native 主机、Helper 和 Chrome 均在运行。初次指南的
`1Password|AgileBits|onepassword` 表达式漏掉 `Agile1pAgent`；
应改为覆盖 `1password|agile` 或明确列出 Helper 名称。

### Helper 的拒绝路径

分析对象是安装的 `Agile1pAgent.exe`，SHA-256：
`17bf9760cb97ec3b76db46b2f502645d2a539edd858b5484ae336727eff5c948`。
PE image base 为 `0x400000`。以下位置来自 pefile 与 Capstone 的只读静态
反汇编，属于普通 shell 分析；没有把它们冒充成 REA 反编译证据。
REA 原生反编译提供者未配置，未安装或修改其配置。

| 位置 | 观察到的逻辑 |
| --- | --- |
| `0x740940` | 用 `GetNamedPipeClientProcessId` 找客户端，检查 Native 主机自身签名与 AgileBits 名称，并遍历父进程，跳过 Native 主机与 cmd.exe |
| `0x740AC7` | 从类型 3 开始尝试签名者分类；各类型匹配失败后返回类型 0，即 Unknown |
| `0x71AED0` | 先调用 Windows 文件签名验证，再按类型比较签名者允许列表 |
| `0x619C38` | 构造 WinTrust 数据，调用 `WinVerifyTrust`，返回值 0 才通过 |
| `0x619D74` | 枚举文件证书、验证 PKCS#7 消息，使用 `CertGetNameStringA` 类型 4 获取签名者简单名称 |
| `0x619F64` | 提取上述名称并与传入常量做字符串比较 |
| `0x71AF20` | 类型 3 的第一项是 `Google Inc`；后续包含 Yandex、Opera、Brave、Vivaldi、Comodo，未包含 Google LLC |

本机 Chrome 的 Authenticode 状态是 Valid，简单签名者名称为 `Google LLC`，
PE Security Directory 含一条完整 WIN_CERTIFICATE。Native 主机的简单签名者
名称为 `AgileBits Inc.`。旧 Helper 的 Google 名称比较必然不能匹配当前 Chrome。
这是一处确定的 Windows 认证不兼容；补丁后本机运行测试已通过认证和发送就绪检查。

只读复现脚本和选定代码区间保存在：

- `artifacts/windows-native-messaging/audit-helper-signer.py`
- `artifacts/windows-native-messaging/helper-signer-analysis.json`

### 可审阅的最小变更

| 字段 | 值 |
| --- | --- |
| 文件偏移 | `0x31A404` |
| 虚拟地址 | `0x71B004` |
| 原字串 | `Google Inc`，10 字节 |
| 拟议字串 | `Google LLC`，10 字节 |
| 已生成候选 SHA-256 | `968235499fbea066c979ac3c4a8a663e46ea7026a5c6a0ab2316fb5d3be22857` |
| 是否生成候选 EXE | 是；`artifacts/windows-native-messaging/Agile1pAgent.GoogleLLC.exe` |
| 是否修改安装的 Helper | 是；安装哈希与候选一致 |

该变更不修改 Chrome 的 WinVerifyTrust、证书提取或比较指令，但修改签名覆盖的
Helper 字节会使 Helper 自身原有的 AgileBits 签名失效。用户已明确批准这一特定补丁，
并接受该签名影响；这项明确授权覆盖指南对本次 EXE 变更的限制。
本机补丁后 Chrome 认证已通过；尚未执行实际填充或全面功能验证。
目前没有跳过或关闭任何签名验证。

### 已准备的备份、安装与回滚

`prepare-helper-signer.py` 固定原件和候选哈希，只生成本地备份及候选，不安装或执行 EXE。
两份文件长度均为 4,960,912 字节，仅文件偏移 `0x31A40B`、`0x31A40C`、
`0x31A40D` 三个字节发生变化；其他字节（包括此前审计的验证指令）完全一致。
`helper-candidate-verification.json` 保存这次完整字节对比结果。

- 原件备份：`artifacts/windows-native-messaging/Agile1pAgent.original.exe`；
  SHA-256 为初次审计的 `17bf9760cb97ec3b76db46b2f502645d2a539edd858b5484ae336727eff5c948`；
  备份 Authenticode 状态为 `Valid`。
- 候选 Authenticode 状态为 `HashMismatch`，符合已告知并接受的签名影响。
- `apply-helper-signer.ps1` 要求管理员权限、固定文件身份及停止相关进程，
  应用时检查 Chrome 的有效 `Google LLC` 签名及原生主机身份。
  它使用独占文件句柄写入，并验证结果哈希；写入失败时尝试恢复操作前的字节。
  `-Restore` 参数用于恢复固定哈希的原件。
- `probe-connection.mjs` 只从隔离 profile 的扩展 worker 读取连接、认证、
  Native Messaging 和可发送状态四个布尔值；不读取 storage、配对秘密或协议消息。
  每次查询后关闭 CDP 连接，避免调试连接阻止 worker 正常休眠。

二进制备份和候选仅保留在本机，已通过 `.gitignore` 排除。
替换前由用户保存并退出密码管理器与独立测试 Chrome，不强制结束桌面进程。
用户找不到托盘退出入口时，可在桌面和原生主机均已退出后使用安装脚本的
`-StopHelper` 参数，仅停止路径匹配本次目标的剩余后台 Helper。

补丁前的只读运行探测（`connection-before-helper-patch.json`）确认：
`connected=true`、`nativeMessaging=true`、`authenticated=false`、`readyToSend=false`。
因此本次故障已经到达桌面认证阶段，不能以单纯连接成功判断可用。

### 已应用的补丁与首次运行结果

用户退出桌面和测试 Chrome 后，管理员脚本仅停止剩余 Helper 并替换目标文件。
`helper-apply-result.json` 记录 `Success=true`，安装 SHA-256 为
`968235499fbea066c979ac3c4a8a663e46ea7026a5c6a0ab2316fb5d3be22857`。
安装 Helper 的 Authenticode 状态为 `HashMismatch`，Chrome 状态仍为 `Valid`、
签名者仍为 `Google LLC`。没有禁用任何签名验证代码。

重新打开相同隔离 Chrome profile 后，原生主机正常启动新 Helper；
2026-11-14 08:37:31 UTC 的只读状态见 `connection-after-helper-patch.json`：

| 状态 | 补丁前 | 补丁后 |
| --- | --- | --- |
| 已连接 | true | true |
| 使用 Native Messaging | true | true |
| 认证通过 | false | true |
| 可发送 | false | true |

这证明当前 Chrome 157.0.8103.51 / 1Password 4.6.2.626 组合在名称更新后完成认证，
并且发送功能已就绪。仅检查连接状态，没有读取配对秘密、消息体或密码库项目。
断开 CDP 后空闲 135.536 秒，再次检查的四项状态全部为 true，
详见 `connection-after-idle.json` 和 `idle-verification.json`。
这证明这一段空闲期间连接保持可用，未证明 worker 被终止后重新创建的行为。
用户随后在普通网页点击扩展，明确报告没有签名错误，并关闭测试窗口。
确认原生主机退出后，重新打开相同 profile；2026-11-14 08:44:42 UTC 的
`connection-after-browser-restart.json` 再次记录四项状态全部为 true。
新的原生主机 PID 为 41108（关闭前为 5944），Helper 沿用 PID 39684；
这次验证覆盖浏览器关闭、原生主机重新启动及扩展自动认证。
实际填充未测试。

安装补丁后可对原件备份重新执行静态审计（固定原件哈希，不加载或执行目标）：

```powershell
python artifacts\windows-native-messaging\audit-helper-signer.py --target artifacts\windows-native-messaging\Agile1pAgent.original.exe artifacts\windows-native-messaging\helper-original-backup-analysis.json
```

需要恢复时，先退出桌面和测试 Chrome，在管理员 PowerShell 运行：

```powershell
powershell.exe -NoProfile -File .\artifacts\windows-native-messaging\apply-helper-signer.ps1 -Restore -StopHelper
```

恢复命令仅接受当前安装候选的固定哈希，写回已验证的原件并核对原件哈希；
本次成功安装后尚未实际执行恢复操作。
