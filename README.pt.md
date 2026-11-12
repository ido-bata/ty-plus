# ty-plus

**Os seus presets e ferramentas, dentro do Adobe After Effects.**  
ty-plus é uma extensão CEP gratuita e de código aberto para organizar ações reutilizáveis e personalizar a área de trabalho.

[![CI](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml?query=branch%3Amain)
[![Stable release](https://img.shields.io/github/v/release/ido-bata/ty-plus?label=stable)](https://github.com/ido-bata/ty-plus/releases/latest)
[![License: MIT](https://img.shields.io/github/license/ido-bata/ty-plus)](LICENSE)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-555)](https://github.com/ido-bata/ty-plus/releases/latest)

**[Descarregar a versão Stable mais recente](https://github.com/ido-bata/ty-plus/releases/latest)** · [Guia de instalação](docs/user-guide/installation/index.md) · [Reportar um erro](https://github.com/ido-bata/ty-plus/issues/new/choose)

**Idiomas:** [English](README.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [简体中文](README.zh.md) · [Español](README.es.md) · [한국어](README.ko.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md)

## O que pode fazer com ty-plus?

Organize presets e scripts em blocos, adicione widgets e adapte os painéis ao seu fluxo de trabalho. As definições e a área de trabalho ficam guardadas localmente.

- **Presets e scripts:** organize e execute ações frequentes do After Effects.
- **Área de trabalho personalizável:** blocos, widgets, disposição dos painéis e aparência.
- **Prioridade ao local:** as funções principais operam sem ligação à Internet, conta ou subscrição.
- **Canais de atualização:** escolha Stable, Beta ou Insider em Definições → Updates; a instalação é manual.

[Ver uma captura antiga da área de trabalho no After Effects](docs/user-guide/main-screen/screenshots/main-06-after-onboarding-workspace.png) (versão de desenvolvimento; a interface publicada pode ser diferente).

## Instalação

1. Abra a **[versão Stable mais recente](https://github.com/ido-bata/ty-plus/releases/latest)**.
2. Descarregue `ty-plus-<version>-windows.zxp` ou `ty-plus-<version>-macos.zxp` para o seu sistema.
3. Instale o ZXP com um instalador compatível com CEP e reinicie o After Effects.
4. Abra **Window → Extensions → ty-plus**.

Cada lançamento inclui também ZIP e manifestos específicos por plataforma para instalação e verificação manuais. Consulte o [guia de instalação](docs/user-guide/installation/index.md) (em japonês).

## Compatibilidade e limitações conhecidas

- **Windows x64 / macOS:** um build de desenvolvimento passou por uma verificação básica no After Effects 2026, mas **o ZXP publicado v0.10.1 ainda não foi testado de ponta a ponta em dispositivos reais**. Consulte a [issue #10](https://github.com/ido-bata/ty-plus/issues/10).
- **Windows:** o worker nativo não possui assinatura Authenticode. O Smart App Control pode bloqueá-lo. Não desative as proteções do sistema para instalar ty-plus.
- **macOS:** o worker nativo da v0.10.1 tem assinatura Developer ID, mas **não está notarizado**. A quarentena ou as políticas de segurança podem impedir a execução.
- **ZXP:** é utilizado um certificado autoassinado persistente. A assinatura ZXP é diferente da notarização de executáveis no macOS.
- **Atualizações:** apenas se consultam as GitHub Releases; não há instalação automática.

O primeiro lançamento Stable é a **base do canal de atualizações**, não uma garantia de testes em todas as combinações de sistemas e versões do AE.

## Canais de atualização

| Canal | Versões recebidas | Formato da tag |
| --- | --- | --- |
| Stable | Apenas Stable | `vX.Y.Z` |
| Beta | Stable e Beta | `vX.Y.Z-beta.N` |
| Insider | Todas | `vX.Y.Z-insider.N` |

[Ver lançamentos](https://github.com/ido-bata/ty-plus/releases) · [Notas da versão v0.10.1](https://github.com/ido-bata/ty-plus/releases/tag/v0.10.1)

## Ajuda e contribuições

- [Guia do utilizador](docs/user-guide/index.md) (japonês) · [Guia de instalação](docs/user-guide/installation/index.md) (japonês)
- [Reportar problemas ou sugerir melhorias](https://github.com/ido-bata/ty-plus/issues/new/choose)
- [Contribuir](CONTRIBUTING.md) · [Política de segurança](SECURITY.md)
- [Estado real do CI](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml). O distintivo mostra o estado real do GitHub Actions e não afirma que os testes passaram. Os erros antes do início das tarefas por problemas de faturação são acompanhados na [issue #59](https://github.com/ido-bata/ty-plus/issues/59).

Para desenvolver: `mise install` e depois `bun install --frozen-lockfile --ignore-scripts`. Consulte [Contributing](CONTRIBUTING.md).

## Licença

ty-plus é distribuído sob a [licença MIT](LICENSE). Os componentes de terceiros mantêm os respetivos avisos: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
