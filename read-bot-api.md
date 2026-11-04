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
  "expiresIn": "15m",
  "user": null
}
```

`user` contient le compte lié, ou `null` si le chat Telegram n'est pas encore
lié.

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
