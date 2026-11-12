# ty-plus

**让预设与工具融入 Adobe After Effects 工作区。**  
ty-plus 是免费、开源的 After Effects CEP 扩展，可集中管理常用操作并自定义工作区。

[![CI](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml?query=branch%3Amain)
[![Stable release](https://img.shields.io/github/v/release/ido-bata/ty-plus?label=stable)](https://github.com/ido-bata/ty-plus/releases/latest)
[![License: MIT](https://img.shields.io/github/license/ido-bata/ty-plus)](LICENSE)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-555)](https://github.com/ido-bata/ty-plus/releases/latest)

**[下载最新稳定版](https://github.com/ido-bata/ty-plus/releases/latest)** · [安装指南](docs/user-guide/installation/index.md) · [报告问题](https://github.com/ido-bata/ty-plus/issues/new/choose)

**语言:** [English](README.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [简体中文](README.zh.md) · [Español](README.es.md) · [한국어](README.ko.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md)

## ty-plus 能做什么？

将预设和脚本整理为磁贴，添加小组件，按自己的工作习惯排列面板。设置与工作区数据保存在本地。

- **预设与脚本：** 整理并快速调用常用 After Effects 操作。
- **自定义工作区：** 配置磁贴、小组件、面板布局和外观。
- **本地优先：** 核心功能可离线使用，无须登录或订阅。
- **更新频道：** 在设置 → Updates 中选择 Stable、Beta 或 Insider；更新需手动安装。

[查看早期开发版的 After Effects 工作区截图](docs/user-guide/main-screen/screenshots/main-06-after-onboarding-workspace.png) (正式发布版的界面可能有所不同).

## 安装

1. 打开**[最新 Stable 版本](https://github.com/ido-bata/ty-plus/releases/latest)**。
2. 根据系统下载 `ty-plus-<tag>-windows.zxp` 或 `ty-plus-<tag>-macos.zxp`。
3. 使用兼容 CEP 的 ZXP 安装器安装，然后重新启动 After Effects。
4. 在**窗口 → 扩展 → ty-plus** 中打开。

每个版本还提供用于手动安装及校验的 ZIP 和各平台 manifest。请参阅[安装指南](docs/user-guide/installation/index.md)（日语）。

## 兼容性与已知限制

- **Windows x64 / macOS：** 已在 After Effects 2026 上对开发版进行基本启动检查，但**公开的 v0.10.1 ZXP 尚未完成真实设备端到端测试**。参见[问题 #10](https://github.com/ido-bata/ty-plus/issues/10)。
- **Windows：** 原生 worker 未使用 Authenticode 签名，Smart App Control 可能阻止运行。请勿为安装而关闭系统安全保护。
- **macOS：** v0.10.1 的原生 worker 已使用 Developer ID 签名，但**尚未公证**。隔离属性或系统安全策略可能阻止启动。
- **ZXP：** 使用长期保留的自签名证书签署。ZXP 签名不同于 macOS 可执行文件公证。
- **更新：** 仅检查 GitHub Releases，不会自动安装更新。

首次 Stable 版本是**更新频道的基线**，不代表所有系统及 AE 版本均已通过测试。

## 更新频道

| 频道 | 接收的版本 | 标签格式 |
| --- | --- | --- |
| Stable | 仅 Stable | `vX.Y.Z` |
| Beta | Stable 与 Beta | `vX.Y.Z-beta.N` |
| Insider | 所有版本 | `vX.Y.Z-insider.N` |

[查看所有版本](https://github.com/ido-bata/ty-plus/releases) · [v0.10.1 更新说明](https://github.com/ido-bata/ty-plus/releases/tag/v0.10.1)

## 帮助与参与

- [用户指南](docs/user-guide/index.md) (日语) · [安装指南](docs/user-guide/installation/index.md) (日语)
- [报告问题或提出改进建议](https://github.com/ido-bata/ty-plus/issues/new/choose)
- [参与贡献](CONTRIBUTING.md) · [安全政策](SECURITY.md)
- [CI 实际状态](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml). 徽章显示 GitHub Actions 的实际执行状态，并不表示测试已通过。因账单问题导致任务启动前失败的情况记录在[问题 #59](https://github.com/ido-bata/ty-plus/issues/61)。

开发准备：执行 `mise install`，然后执行 `bun install --frozen-lockfile --ignore-scripts`。详情参见[贡献指南](CONTRIBUTING.md)。

## 许可证

ty-plus 使用 [MIT 许可证](LICENSE)。第三方资产仍受各自条款约束，详见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
