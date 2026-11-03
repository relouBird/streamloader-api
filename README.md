# StreamLoaders API

API Node.js/Express de StreamLoaders. Elle fournit l'authentification, les
comptes, les téléchargements vidéo, les paiements et les avis.

## Prérequis

- Node.js 18 ou supérieur
- MySQL accessible par l'application
- Les variables d'environnement définies dans `.env` (voir `.env.example`)

## Installation et développement

```bash
npm ci
npm run build
npm start
```

Le serveur écoute sur `PORT` (3000 par défaut). Le détail des routes est
disponible dans [read-api.md](./read-api.md).

## Build des assets

Le code TypeScript est compilé dans `dist/`. Le script de build copie également
`src/public` vers `dist/public`, afin que l'interface HTML/CSS soit disponible
en production.

## Déploiement automatique

Les workflows GitHub Actions ciblent le serveur Planethoster :

- [first-deployment.yml](./.github/workflows/first-deployment.yml) initialise
  une nouvelle installation après création de `$HOME/back/.env` sur le serveur.
- [main.yml](./.github/workflows/main.yml) déploie automatiquement chaque push
  sur `main`, ou peut être lancé manuellement.

Configurer dans GitHub les secrets `SERVER_HOST`, `SERVER_USER`,
`SERVER_SSH_KEY` et, si nécessaire, `SERVER_SSH_PORT`.

Le serveur doit disposer de l'environnement Node CloudLinux dans
`$HOME/nodevenv/back/22/`. Le workflow ne copie jamais `.env` depuis GitHub et
ne réinitialise pas la base de données. Les fichiers de documentation Markdown
à la racine sont supprimés après le build et ne restent pas dans le répertoire
de l'application exécutée.

## Sécurité

Ne jamais versionner `.env`, les mots de passe, les clés JWT ou les secrets de
webhook. Utiliser des secrets longs et aléatoires en production.
