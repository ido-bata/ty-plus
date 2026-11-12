# ty-plus

**Preset e strumenti direttamente in Adobe After Effects.**  
ty-plus è un'estensione CEP gratuita e open source per organizzare le azioni riutilizzabili e personalizzare lo spazio di lavoro.

[![CI](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml?query=branch%3Amain)
[![Stable release](https://img.shields.io/github/v/release/ido-bata/ty-plus?label=stable)](https://github.com/ido-bata/ty-plus/releases/latest)
[![License: MIT](https://img.shields.io/github/license/ido-bata/ty-plus)](LICENSE)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-555)](https://github.com/ido-bata/ty-plus/releases/latest)

**[Scarica l'ultima versione Stable](https://github.com/ido-bata/ty-plus/releases/latest)** · [Guida all'installazione](docs/user-guide/installation/index.md) · [Segnala un problema](https://github.com/ido-bata/ty-plus/issues/new/choose)

**Lingue:** [English](README.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [简体中文](README.zh.md) · [Español](README.es.md) · [한국어](README.ko.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md)

## Cosa offre ty-plus?

Organizza preset e script in riquadri, aggiungi widget e disponi i pannelli secondo il tuo flusso di lavoro. Impostazioni e spazio di lavoro vengono salvati in locale.

- **Preset e script:** organizza e avvia le azioni usate spesso in After Effects.
- **Spazio personalizzabile:** riquadri, widget, disposizione dei pannelli e aspetto.
- **Approccio locale:** le funzioni principali lavorano offline, senza account né abbonamento.
- **Canali di aggiornamento:** scegli Stable, Beta o Insider in Impostazioni → Updates; installazione manuale.

[Visualizza una precedente schermata dello spazio di lavoro in After Effects](docs/user-guide/main-screen/screenshots/main-06-after-onboarding-workspace.png) (build di sviluppo; l'interfaccia pubblicata potrebbe differire).

## Installazione

1. Apri l'**[ultima versione Stable](https://github.com/ido-bata/ty-plus/releases/latest)**.
2. Scarica `ty-plus-<tag>-windows.zxp` oppure `ty-plus-<tag>-macos.zxp` per il tuo sistema.
3. Installa il file ZXP con un programma compatibile con CEP e riavvia After Effects.
4. Apri **Finestra → Estensioni → ty-plus**.

Ogni versione comprende anche ZIP e manifest specifici per piattaforma per l'installazione manuale e la verifica. Consulta la [guida all'installazione](docs/user-guide/installation/index.md) (in giapponese).

## Compatibilità e limitazioni note

- **Windows x64 / macOS:** un build di sviluppo è stato sottoposto a un controllo di avvio in After Effects 2026, ma **lo ZXP pubblico v0.10.1 non è ancora stato verificato completamente su dispositivi reali**. Vedi [issue #10](https://github.com/ido-bata/ty-plus/issues/10).
- **Windows:** il worker nativo non ha firma Authenticode. Smart App Control può bloccarlo. Non disattivare le protezioni del sistema per installare ty-plus.
- **macOS:** il worker nativo v0.10.1 è firmato con Developer ID, ma **non è notarizzato**. Quarantena o policy di sicurezza potrebbero impedirne l'avvio.
- **ZXP:** il pacchetto usa un certificato autofirmato persistente. La firma ZXP non equivale alla notarizzazione macOS.
- **Aggiornamenti:** vengono controllate le GitHub Releases, ma non è prevista l'installazione automatica.

La prima versione Stable è il **riferimento del canale aggiornamenti**, non una garanzia di test per ogni combinazione di OS e After Effects.

## Canali di aggiornamento

| Canale | Versioni ricevute | Formato tag |
| --- | --- | --- |
| Stable | Solo Stable | `vX.Y.Z` |
| Beta | Stable e Beta | `vX.Y.Z-beta.N` |
| Insider | Tutte | `vX.Y.Z-insider.N` |

[Visualizza le versioni](https://github.com/ido-bata/ty-plus/releases) · [Note di rilascio v0.10.1](https://github.com/ido-bata/ty-plus/releases/tag/v0.10.1)

## Supporto e contributi

- [Guida utente](docs/user-guide/index.md) (giapponese) · [Guida all'installazione](docs/user-guide/installation/index.md) (giapponese)
- [Segnala bug o proponi miglioramenti](https://github.com/ido-bata/ty-plus/issues/new/choose)
- [Come contribuire](CONTRIBUTING.md) · [Politica di sicurezza](SECURITY.md)
- [Stato reale della CI](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml). Il badge mostra lo stato effettivo di GitHub Actions; non implica che i test siano passati. I blocchi di avvio dovuti alla fatturazione sono tracciati nella [issue #59](https://github.com/ido-bata/ty-plus/issues/61).

Per lo sviluppo: `mise install`, poi `bun install --frozen-lockfile --ignore-scripts`. Vedi [Contributing](CONTRIBUTING.md).

## Licenza

ty-plus è distribuito sotto [licenza MIT](LICENSE). I componenti di terzi mantengono le proprie note: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
