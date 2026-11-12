# ty-plus

**Tus presets y herramientas, dentro de Adobe After Effects.**  
ty-plus es una extensión CEP gratuita y de código abierto para organizar acciones reutilizables y personalizar tu espacio de trabajo.

[![CI](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml?query=branch%3Amain)
[![Stable release](https://img.shields.io/github/v/release/ido-bata/ty-plus?label=stable)](https://github.com/ido-bata/ty-plus/releases/latest)
[![License: MIT](https://img.shields.io/github/license/ido-bata/ty-plus)](LICENSE)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-555)](https://github.com/ido-bata/ty-plus/releases/latest)

**[Descargar la última versión estable](https://github.com/ido-bata/ty-plus/releases/latest)** · [Guía de instalación](docs/user-guide/installation/index.md) · [Informar de un error](https://github.com/ido-bata/ty-plus/issues/new/choose)

**Idiomas:** [English](README.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [简体中文](README.zh.md) · [Español](README.es.md) · [한국어](README.ko.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md)

## ¿Qué ofrece ty-plus?

Organiza presets y scripts en mosaicos, añade widgets y distribuye los paneles según tu flujo de trabajo. Las preferencias y el espacio de trabajo se guardan localmente.

- **Presets y scripts:** organiza y ejecuta acciones habituales de After Effects.
- **Espacio personalizable:** mosaicos, widgets, paneles y apariencia.
- **Primero lo local:** las funciones principales trabajan sin conexión, sin cuenta ni suscripción.
- **Canales de actualización:** elige Stable, Beta o Insider en Ajustes → Updates; la instalación es manual.

[Ver una captura anterior del espacio de trabajo en After Effects](docs/user-guide/main-screen/screenshots/main-06-after-onboarding-workspace.png) (versión de desarrollo; la interfaz publicada puede ser distinta).

## Instalación

1. Abre la **[última versión Stable](https://github.com/ido-bata/ty-plus/releases/latest)**.
2. Descarga `ty-plus-<version>-windows.zxp` o `ty-plus-<version>-macos.zxp` según tu sistema.
3. Instala el ZXP con un instalador compatible con CEP y reinicia After Effects.
4. Abre **Ventana → Extensiones → ty-plus**.

Cada versión incluye ZIP y manifiestos por plataforma para instalaciones manuales y verificación. Consulta la [guía de instalación](docs/user-guide/installation/index.md) (en japonés).

## Compatibilidad y limitaciones conocidas

- **Windows x64 / macOS:** se comprobó el arranque de una compilación de desarrollo en After Effects 2026. **El ZXP publicado v0.10.1 aún no ha superado las pruebas completas en dispositivos reales**. Consulta el [issue #10](https://github.com/ido-bata/ty-plus/issues/10).
- **Windows:** el worker nativo no está firmado con Authenticode. Smart App Control puede bloquearlo. No desactives la protección del sistema para instalar ty-plus.
- **macOS:** el worker nativo v0.10.1 tiene firma Developer ID, pero **no está notarizado**. La cuarentena o las políticas de seguridad pueden impedir su ejecución.
- **ZXP:** se utiliza un certificado autofirmado y persistente. La firma ZXP no equivale a la notarización de macOS.
- **Actualizaciones:** solo se consultan GitHub Releases; la instalación no es automática.

La primera versión Stable es la **base del canal de actualizaciones**, no una garantía de compatibilidad comprobada con todas las versiones de OS y AE.

## Canales de actualización

| Canal | Versiones recibidas | Formato de etiqueta |
| --- | --- | --- |
| Stable | Solo Stable | `vX.Y.Z` |
| Beta | Stable y Beta | `vX.Y.Z-beta.N` |
| Insider | Todas | `vX.Y.Z-insider.N` |

[Ver versiones](https://github.com/ido-bata/ty-plus/releases) · [Notas de v0.10.1](https://github.com/ido-bata/ty-plus/releases/tag/v0.10.1)

## Ayuda y contribuciones

- [Guía del usuario](docs/user-guide/index.md) (japonés) · [Guía de instalación](docs/user-guide/installation/index.md) (japonés)
- [Informar de errores o proponer mejoras](https://github.com/ido-bata/ty-plus/issues/new/choose)
- [Contribuir](CONTRIBUTING.md) · [Política de seguridad](SECURITY.md)
- [Estado real de CI](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml). La insignia refleja el estado real de GitHub Actions, no una afirmación de que las pruebas hayan pasado. Los fallos previos a la ejecución por facturación están documentados en el [issue #59](https://github.com/ido-bata/ty-plus/issues/61).

Para desarrollar: `mise install` y después `bun install --frozen-lockfile --ignore-scripts`. Consulta [Contributing](CONTRIBUTING.md).

## Licencia

ty-plus se distribuye bajo la [licencia MIT](LICENSE). Los componentes de terceros conservan sus avisos: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
