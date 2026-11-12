# ty-plus

**Presets und Werkzeuge direkt in Adobe After Effects.**  
ty-plus ist eine kostenlose Open-Source-CEP-Erweiterung, mit der sich wiederverwendbare Aktionen organisieren und Arbeitsbereiche anpassen lassen.

[![CI](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml?query=branch%3Amain)
[![Stable release](https://img.shields.io/github/v/release/ido-bata/ty-plus?label=stable)](https://github.com/ido-bata/ty-plus/releases/latest)
[![License: MIT](https://img.shields.io/github/license/ido-bata/ty-plus)](LICENSE)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-555)](https://github.com/ido-bata/ty-plus/releases/latest)

**[Neueste Stable-Version herunterladen](https://github.com/ido-bata/ty-plus/releases/latest)** · [Installationsanleitung](docs/user-guide/installation/index.md) · [Fehler melden](https://github.com/ido-bata/ty-plus/issues/new/choose)

**Sprachen:** [English](README.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [简体中文](README.zh.md) · [Español](README.es.md) · [한국어](README.ko.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md)

## Was bietet ty-plus?

Ordne Presets und Skripte als Kacheln an, füge Widgets hinzu und passe Panels an deinen Arbeitsablauf an. Einstellungen und Arbeitsbereiche bleiben lokal gespeichert.

- **Presets und Skripte:** Häufig verwendete After-Effects-Aktionen organisieren und aufrufen.
- **Anpassbarer Arbeitsbereich:** Kacheln, Widgets, Panels und Darstellung konfigurieren.
- **Lokal zuerst:** Kernfunktionen funktionieren offline, ohne Konto oder Abo.
- **Update-Kanäle:** Stable, Beta und Insider unter Einstellungen → Updates auswählen; die Installation erfolgt manuell.

[Frühere Aufnahme des After-Effects-Arbeitsbereichs ansehen](docs/user-guide/main-screen/screenshots/main-06-after-onboarding-workspace.png) (Entwicklungsbuild; die veröffentlichte Oberfläche kann abweichen).

## Installation

1. Öffne die **[neueste Stable-Version](https://github.com/ido-bata/ty-plus/releases/latest)**.
2. Lade `ty-plus-<version>-windows.zxp` oder `ty-plus-<version>-macos.zxp` passend zu deinem System herunter.
3. Installiere die ZXP-Datei mit einem CEP-kompatiblen ZXP-Installer und starte After Effects neu.
4. Öffne **Fenster → Erweiterungen → ty-plus**.

Jede Version enthält auch ZIP-Archive und plattformspezifische Manifeste für die manuelle Installation und Überprüfung. Details stehen in der [Installationsanleitung](docs/user-guide/installation/index.md) (Japanisch).

## Kompatibilität und bekannte Einschränkungen

- **Windows x64 / macOS:** Ein Entwicklungsbuild wurde unter After Effects 2026 kurz geprüft. Die **veröffentlichte ZXP v0.10.1 wurde noch nicht vollständig auf echten Geräten getestet**. Siehe [Issue #10](https://github.com/ido-bata/ty-plus/issues/10).
- **Windows:** Der native Worker besitzt keine Authenticode-Signatur. Windows Smart App Control kann ihn blockieren. Deaktiviere dafür nicht den Schutz deines Betriebssystems.
- **macOS:** Der native Worker in v0.10.1 ist mit einer Developer ID signiert, aber **nicht notarisiert**. Quarantäne oder Sicherheitsrichtlinien können den Start verhindern.
- **ZXP:** Das Paket ist mit einem dauerhaft genutzten selbstsignierten Zertifikat signiert. ZXP-Signatur und macOS-Notarisierung sind nicht dasselbe.
- **Updates:** GitHub Releases werden geprüft; Updates werden nicht automatisch installiert.

Die erste Stable-Version ist die **Basis des Update-Kanals**, nicht die Zusicherung, dass alle OS- und AE-Kombinationen getestet wurden.

## Update-Kanäle

| Kanal | Empfängt | Tag-Format |
| --- | --- | --- |
| Stable | Nur Stable | `vX.Y.Z` |
| Beta | Stable und Beta | `vX.Y.Z-beta.N` |
| Insider | Alle | `vX.Y.Z-insider.N` |

[Alle Releases](https://github.com/ido-bata/ty-plus/releases) · [Versionshinweise v0.10.1](https://github.com/ido-bata/ty-plus/releases/tag/v0.10.1)

## Hilfe und Mitwirkung

- [Benutzerhandbuch](docs/user-guide/index.md) (Japanisch) · [Installationsanleitung](docs/user-guide/installation/index.md) (Japanisch)
- [Fehler melden oder Verbesserung vorschlagen](https://github.com/ido-bata/ty-plus/issues/new/choose)
- [Mitwirken](CONTRIBUTING.md) · [Sicherheitsrichtlinie](SECURITY.md)
- [Tatsächlicher CI-Status](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml). Das Badge zeigt den tatsächlichen Status von GitHub Actions, keinen behaupteten Testerfolg. Abrechnungsbedingte Startfehler sind in [Issue #59](https://github.com/ido-bata/ty-plus/issues/59) dokumentiert.

Entwicklungsumgebung: `mise install`, dann `bun install --frozen-lockfile --ignore-scripts`. Weitere Hinweise unter [Contributing](CONTRIBUTING.md).

## Lizenz

ty-plus steht unter der [MIT-Lizenz](LICENSE). Für Komponenten Dritter gelten zusätzliche Hinweise: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
