# ty-plus

**Vos presets et vos outils, directement dans Adobe After Effects.**  
ty-plus est une extension CEP libre et gratuite pour organiser les actions réutilisables et personnaliser son espace de travail.

[![CI](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml?query=branch%3Amain)
[![Stable release](https://img.shields.io/github/v/release/ido-bata/ty-plus?label=stable)](https://github.com/ido-bata/ty-plus/releases/latest)
[![License: MIT](https://img.shields.io/github/license/ido-bata/ty-plus)](LICENSE)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-555)](https://github.com/ido-bata/ty-plus/releases/latest)

**[Télécharger la dernière version Stable](https://github.com/ido-bata/ty-plus/releases/latest)** · [Guide d’installation](docs/user-guide/installation/index.md) · [Signaler un problème](https://github.com/ido-bata/ty-plus/issues/new/choose)

**Langues:** [English](README.md) · [日本語](README.ja.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [简体中文](README.zh.md) · [Español](README.es.md) · [한국어](README.ko.md) · [Português](README.pt.md) · [Italiano](README.it.md) · [Русский](README.ru.md)

## Que permet ty-plus ?

Organisez vos presets et scripts sous forme de tuiles, ajoutez des widgets et adaptez vos panneaux à votre manière de travailler. Les préférences et l’espace de travail sont enregistrés localement.

- **Presets et scripts :** organisez et lancez vos actions After Effects courantes.
- **Espace personnalisable :** tuiles, widgets, disposition des panneaux et apparence.
- **Priorité au local :** les fonctions principales marchent hors ligne, sans compte ni abonnement.
- **Canaux de mise à jour :** Stable, Beta et Insider dans Paramètres → Updates ; installation manuelle.

[Voir une ancienne capture de l’espace de travail After Effects](docs/user-guide/main-screen/screenshots/main-06-after-onboarding-workspace.png) (version de développement ; l’interface publiée peut différer).

## Installation

1. Ouvrez la **[dernière version Stable](https://github.com/ido-bata/ty-plus/releases/latest)**.
2. Téléchargez `ty-plus-<version>-windows.zxp` ou `ty-plus-<version>-macos.zxp` selon votre système.
3. Installez le ZXP avec un installateur compatible CEP, puis redémarrez After Effects.
4. Ouvrez **Fenêtre → Extensions → ty-plus**.

Des archives ZIP et des manifestes par plateforme sont aussi fournis pour une installation manuelle ou une vérification. Consultez le [guide d’installation](docs/user-guide/installation/index.md) (en japonais).

## Compatibilité et limites connues

- **Windows x64 / macOS :** un build de développement a fait l’objet de tests de démarrage sous After Effects 2026. Le **ZXP publié v0.10.1 n’a pas encore été validé de bout en bout sur les machines cibles**. Voir [l’issue #10](https://github.com/ido-bata/ty-plus/issues/10).
- **Windows :** le worker natif n’est pas signé avec Authenticode ; Smart App Control peut le bloquer. Ne désactivez pas la protection du système pour installer ty-plus.
- **macOS :** le worker natif v0.10.1 est signé avec Developer ID, mais **non notarié**. La quarantaine ou les politiques de sécurité peuvent empêcher son lancement.
- **ZXP :** le paquet utilise un certificat autosigné conservé pour les futures versions. La signature ZXP ne remplace pas la notarisation macOS.
- **Mises à jour :** consultation de GitHub Releases uniquement ; pas d’installation automatique.

La première version Stable constitue une **référence de canal**, pas une garantie de validation sur toutes les versions d’OS et d’After Effects.

## Canaux de mise à jour

| Canal | Versions reçues | Format du tag |
| --- | --- | --- |
| Stable | Stable uniquement | `vX.Y.Z` |
| Beta | Stable et Beta | `vX.Y.Z-beta.N` |
| Insider | Toutes | `vX.Y.Z-insider.N` |

[Toutes les versions](https://github.com/ido-bata/ty-plus/releases) · [Notes de version v0.10.1](https://github.com/ido-bata/ty-plus/releases/tag/v0.10.1)

## Aide et contributions

- [Guide utilisateur](docs/user-guide/index.md) (japonais) · [Guide d’installation](docs/user-guide/installation/index.md) (japonais)
- [Signaler un bug ou proposer une amélioration](https://github.com/ido-bata/ty-plus/issues/new/choose)
- [Contribuer](CONTRIBUTING.md) · [Politique de sécurité](SECURITY.md)
- [État réel de la CI](https://github.com/ido-bata/ty-plus/actions/workflows/ci.yml). Le badge reflète l’état de GitHub Actions, sans prétendre que les tests ont réussi. Les échecs avant démarrage liés à la facturation sont suivis dans [l’issue #59](https://github.com/ido-bata/ty-plus/issues/59).

Pour développer : `mise install`, puis `bun install --frozen-lockfile --ignore-scripts`. Voir le [guide de contribution](CONTRIBUTING.md).

## Licence

ty-plus est distribué sous [licence MIT](LICENSE). Les composants tiers conservent leurs propres mentions : [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
