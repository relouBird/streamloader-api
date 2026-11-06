# API dédiée au bot Telegram

Le bot ne doit plus importer `database/queries` et ne doit plus appliquer les
quotas ou vérifier le plan localement. L'API est la source de vérité pour le
compte lié, le plan, les quotas, la durée maximale et les autorisations.

## Configuration du bot

Dans l'environnement du bot :

```env
API_URL=https://api.example.com/api
X_BOT_SECRET=<même secret long que sur l'API>
```

`X_BOT_SECRET` est un secret inter-services. Il ne doit jamais être envoyé à
Telegram, au navigateur ou dans une URL.

## 1. Obtenir une session bot

Le bot renouvelle sa session au démarrage et lorsqu'elle expire :

```http
POST /api/bot/session
x-bot-token: <X_BOT_SECRET>
Content-Type: application/json

{"telegramId":123456789}
```

Réponse :

```json
{
  "success": true,
  "token": "<JWT valable 15 minutes>",
  "expiresIn": "1d",
  "user": null
}
```

`user` contient le compte lié, ou `null` si le chat Telegram n'est pas encore
lié.

Chaque appel à `/session` crée l'utilisateur Telegram dans l'API s'il
n'existe pas encore et actualise `last_seen_at`. Cela fonctionne aussi pour
les utilisateurs qui n'ont pas lié de compte StreamLoaders.

## 2. Lier un compte

Le bot envoie la clé API saisie en message privé uniquement à l'API :

```http
POST /api/bot/link
x-bot-token: <X_BOT_SECRET>
Content-Type: application/json

{"telegramId":123456789,"apiKey":"sl_..."}
```

La réponse contient une nouvelle session bot et les informations publiques du
compte. La clé API ne doit pas être conservée par le bot et ne doit jamais être
journalisée.

## 3. Utiliser la session

Pour les appels suivants, utiliser uniquement :

```http
Authorization: Bearer <JWT de session bot>
```

### Profil

```http
GET /api/bot/me
```

### Analyse

```http
GET /api/bot/media/analyze?url=https%3A%2F%2Fexample.com%2Fvideo
```

### Démarrer un téléchargement

```http
POST /api/bot/media/download/start
Content-Type: application/json

{"url":"https://example.com/video","quality":"1080p","title":"video"}
```

### Musique

```http
POST /api/bot/media/music/start
Content-Type: application/json

{"query":"artist title official audio","title":"title","artist":"artist","coverUrl":null}
```

### Progression et fichier

```http
GET /api/bot/media/progress/<jobId>
GET /api/bot/media/file/<jobId>
```

Le endpoint de progression est un flux SSE et doit conserver
`Accept: text/event-stream`.

## 4. Demander une offre de visite

Après l'envoi réussi du fichier, le bot peut demander une offre avec sa
session JWT :

```http
POST /api/bot/site-offer
Authorization: Bearer <JWT de session bot>
Content-Type: application/json
```

Le body est vide. L'API récupère `telegramId` depuis le JWT.

Utilisateur éligible :

```json
{
  "showSupportButton": true,
  "redirectToken": "<JWT opaque pour le site>",
  "expiresAt": "2026-11-06T16:59:00.000Z",
  "nextEligibleAt": "2026-11-06T22:29:00.000Z"
}
```

Si l'offre est encore bloquée par le délai de six heures :

```json
{
  "showSupportButton": false,
  "nextEligibleAt": "2026-11-06T22:29:00.000Z"
}
```

Un utilisateur Premium reçoit également `showSupportButton: false` avec
`reason: "premium"`. Le bot ne doit afficher le bouton que lorsque cette
valeur est `true`. Une erreur sur cette route ne doit pas empêcher l'envoi du
fichier déjà téléchargé.

Le token est court (30 minutes), signé uniquement par l'API et ne contient
pas de `telegramId`. Le bot ne doit ni le décoder ni le modifier.

## Règles à retirer du bot

- `queries.getUserByTelegramId`
- `queries.linkTelegramAccount`
- `queries.consumeDailyDownload`
- les contrôles locaux du plan Premium et de la durée maximale
- l'en-tête `x-bot-token` sur les routes `/media/*` après migration vers
  `/api/bot/*`

Le bot peut conserver les contrôles purement ergonomiques, comme vérifier
qu'un texte ressemble à une URL avant de l'envoyer. Toute décision de sécurité
ou de quota doit rester dans l'API.

## Renouvellement

Sur une réponse `401` provenant d'une route `/api/bot/*`, le bot doit refaire
`POST /api/bot/session` avec son `telegramId`, puis rejouer la requête une seule
fois. Il ne doit pas boucler indéfiniment.
