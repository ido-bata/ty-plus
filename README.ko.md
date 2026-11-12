# ty-plus

**Adobe After Effects 안에서 프리셋과 도구를 한곳에.**  
ty-plus는 자주 쓰는 작업을 정리하고 작업 공간을 꾸밀 수 있는 무료 오픈 소스 CEP 확장 프로그램입니다.

[![CI](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml?query=branch%3Amain)
[![Stable release](https://img.shields.io/github/v/release/ido-bata/ty-plus?label=stable)](https://github.com/ido-bata/ty-plus/releases/latest)
[![License: MIT](https://img.shields.io/github/license/ido-bata/ty-plus)](LICENSE)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-555)](https://github.com/ido-bata/ty-plus/releases/latest)

**[최신 Stable 버전 다운로드](https://github.com/ido-bata/ty-plus/releases/latest)** · [설치 가이드](docs/user-guide/installation/index.md) · [버그 제보](https://github.com/ido-bata/ty-plus/issues/new/choose)

**언어:** [English](README.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [简体中文](README.zh.md) · [Español](README.es.md) · [한국어](README.ko.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md)

## ty-plus로 할 수 있는 일

프리셋과 스크립트를 타일로 정리하고 위젯과 패널을 작업 방식에 맞게 배치할 수 있습니다. 설정과 작업 공간 데이터는 로컬에 저장됩니다.

- **프리셋과 스크립트:** 반복해서 사용하는 After Effects 작업을 정리하고 실행합니다.
- **사용자 지정 작업 공간:** 타일, 위젯, 패널 배치와 모양을 조정합니다.
- **로컬 우선:** 핵심 기능은 오프라인에서 동작하며 계정이나 구독이 필요하지 않습니다.
- **업데이트 채널:** 설정 → Updates에서 Stable, Beta, Insider를 선택합니다. 업데이트 설치는 수동입니다.

[이전 개발 빌드의 After Effects 작업 공간 캡처 보기](docs/user-guide/main-screen/screenshots/main-06-after-onboarding-workspace.png) (배포 버전의 화면과 다를 수 있습니다).

## 설치

1. **[최신 Stable 릴리스](https://github.com/ido-bata/ty-plus/releases/latest)**를 엽니다.
2. 운영체제에 맞는 `ty-plus-<tag>-windows.zxp` 또는 `ty-plus-<tag>-macos.zxp`를 다운로드합니다.
3. CEP 호환 ZXP 설치 프로그램으로 설치한 뒤 After Effects를 다시 시작합니다.
4. **Window → Extensions → ty-plus**에서 실행합니다.

각 릴리스에는 수동 설치 및 확인용 ZIP과 플랫폼별 manifest도 포함되어 있습니다. 자세한 내용은 [설치 가이드](docs/user-guide/installation/index.md)(일본어)를 참고하세요.

## 호환성 및 알려진 제한 사항

- **Windows x64 / macOS:** After Effects 2026에서 개발 빌드의 기본 실행을 확인했지만, **공개된 v0.10.1 ZXP 자체는 실제 기기에서 전체 검증을 마치지 않았습니다.** [검증 이슈 #10](https://github.com/ido-bata/ty-plus/issues/10)을 참고하세요.
- **Windows:** 네이티브 worker에 Authenticode 서명이 없습니다. Smart App Control이 실행을 차단할 수 있습니다. 설치를 위해 OS 보안 기능을 끄지 마세요.
- **macOS:** v0.10.1의 네이티브 worker는 Developer ID 서명이 있지만 **공증되지 않았습니다.** 격리 속성이나 보안 정책으로 실행이 차단될 수 있습니다.
- **ZXP:** 지속적으로 사용하는 자체 서명 인증서로 서명했습니다. ZXP 서명과 macOS 실행 파일 공증은 별개입니다.
- **업데이트:** GitHub Releases에서 새 버전을 확인하지만 자동으로 설치하지 않습니다.

첫 Stable 릴리스는 **업데이트 채널의 기준 버전**이며, 모든 OS와 AE 조합에서 검증되었다는 뜻은 아닙니다.

## 업데이트 채널

| 채널 | 수신 버전 | 태그 형식 |
| --- | --- | --- |
| Stable | Stable만 | `vX.Y.Z` |
| Beta | Stable과 Beta | `vX.Y.Z-beta.N` |
| Insider | 모든 버전 | `vX.Y.Z-insider.N` |

[릴리스 목록](https://github.com/ido-bata/ty-plus/releases) · [v0.10.1 릴리스 노트](https://github.com/ido-bata/ty-plus/releases/tag/v0.10.1)

## 도움말 및 기여

- [사용자 가이드](docs/user-guide/index.md) (일본어) · [설치 가이드](docs/user-guide/installation/index.md) (일본어)
- [버그 제보 또는 개선 제안](https://github.com/ido-bata/ty-plus/issues/new/choose)
- [기여 안내](CONTRIBUTING.md) · [보안 정책](SECURITY.md)
- [실제 CI 상태](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml). 배지는 GitHub Actions의 실제 상태를 보여 주며 테스트 통과를 의미하지 않습니다. 결제 문제로 작업 시작 전에 실패한 사례는 [이슈 #59](https://github.com/ido-bata/ty-plus/issues/61)에서 추적합니다.

개발 환경은 `mise install`과 `bun install --frozen-lockfile --ignore-scripts`로 준비합니다. 자세한 내용은 [기여 가이드](CONTRIBUTING.md)를 참고하세요.

## 라이선스

ty-plus는 [MIT 라이선스](LICENSE)로 공개되어 있습니다. 타사 구성 요소에는 별도의 조건이 적용됩니다: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
