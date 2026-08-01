# StreamLoader API — Documentation

Backend Node/Express qui sert de point d'entrée unique pour le frontend. Il gère l'authentification, les paiements et la base de données, et délègue toute la logique de téléchargement vidéo au microservice Python (`video-service`) via un appel serveur-à-serveur transparent pour le client.

## Base URL

```
https://<ton-domaine>/api
```

## Authentification

La plupart des routes utilisateur utilisent un **JWT Bearer token**, obtenu via `/auth/login` ou `/auth/register`.

```
Authorization: Bearer <token>
```

Deux niveaux d'auth selon les routes :
- **`authMiddleware`** — token **obligatoire**, la requête est rejetée (401) sans token valide.
- **`optionalAuth`** — token **facultatif** : si présent et valide, `req.user` est peuplé (utile pour associer un téléchargement à un compte) ; sinon la requête continue en anonyme.

## Rate limiting

| Groupe de routes | Fenêtre | Limite |
|---|---|---|
| Toutes les routes `/api/*` | 15 min | 200 requêtes / IP |
| `/auth/register`, `/auth/login` | 15 min | 10 tentatives / IP |
| `/media/analyze` | 1 min | 15 requêtes / IP |
| `/media/download/start`, `/payment/initiate` | 1 min | 8 requêtes / IP |

Réponse en cas de dépassement : `429 Too Many Requests`
```json
{ "error": "Trop de requêtes. Réessaie dans 15 minutes." }
```

---

## 🔐 Auth

### `POST /api/auth/register`
Crée un nouveau compte utilisateur.

**Auth** : aucune
**Rate limit** : `authLimiter`

**Requête**
```json
{
  "email": "user@example.com",
  "password": "motdepasse123"
}
```

**Réponse `201 Created`**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "a1b2c3d4-...",
    "email": "user@example.com",
    "plan": "free",
    "created_at": "2026-07-27T10:00:00.000Z"
  }
}
```

**Erreurs**
| Code | Cas |
|---|---|
| `400` | Email/mot de passe manquant, email invalide, mot de passe < 6 caractères |
| `409` | Un compte existe déjà avec cet email |
| `500` | Erreur serveur |

---

### `POST /api/auth/login`
Authentifie un utilisateur existant.

**Auth** : aucune
**Rate limit** : `authLimiter`

**Requête**
```json
{
  "email": "user@example.com",
  "password": "motdepasse123"
}
```

**Réponse `200 OK`**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "a1b2c3d4-...",
    "email": "user@example.com",
    "plan": "free",
    "created_at": "2026-07-27T10:00:00.000Z"
  }
}
```

**Erreurs**
| Code | Cas |
|---|---|
| `400` | Champs manquants |
| `401` | Email ou mot de passe incorrect |

---

### `GET /api/auth/me`
Retourne le profil de l'utilisateur connecté.

**Auth** : `authMiddleware` (obligatoire)

**Headers**
```
Authorization: Bearer <token>
```

**Réponse `200 OK`**
```json
{
  "user": {
    "id": "a1b2c3d4-...",
    "email": "user@example.com",
    "plan": "free",
    "created_at": "2026-07-27T10:00:00.000Z"
  }
}
```

**Erreurs**
| Code | Cas |
|---|---|
| `401` | Token absent, invalide, expiré, ou compte introuvable |

---

## 🎬 Media

Toutes les routes ci-dessous font office de **proxy** vers le microservice Python (`video-service`) — le client n'a jamais connaissance de son existence.

### `GET /api/media/analyze`
Analyse une URL vidéo et retourne ses métadonnées + formats disponibles.

**Auth** : `optionalAuth` (facultatif)
**Rate limit** : `analyzeLimiter`

**Query params**
| Param | Type | Requis | Description |
|---|---|---|---|
| `url` | string | ✅ | URL de la vidéo à analyser |

**Exemple**
```
GET /api/media/analyze?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

**Réponse `200 OK`**
```json
{
  "success": true,
  "data": {
    "title": "Rick Astley - Never Gonna Give You Up",
    "duration": 212,
    "uploader": "Rick Astley",
    "thumbnail": "https://i.ytimg.com/vi/.../maxresdefault.jpg",
    "extractor": "Youtube",
    "webpage": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "formats": [
      {
        "id": "137",
        "ext": "mp4",
        "height": 1080,
        "width": 1920,
        "fps": 30,
        "filesize": null,
        "vcodec": "avc1.640028",
        "acodec": null,
        "tbr": 4500
      }
    ]
  }
}
```

**Erreurs**
| Code | Cas |
|---|---|
| `400` | URL manquante ou invalide (vidéo privée, retirée, région bloquée...) |
| `502` | Service vidéo injoignable |
| `504` | Timeout de l'analyse (site lent à répondre) |

---

### `POST /api/media/download/start`
Démarre un job de téléchargement en arrière-plan. Retourne immédiatement un `jobId` — le client suit la progression via `/progress/:jobId`.

**Auth** : `optionalAuth` (facultatif — si connecté, le téléchargement est associé au compte)
**Rate limit** : `downloadLimiter`

**Requête**
```json
{
  "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  "format": "bestvideo+bestaudio/best",
  "title": "Rick Astley - Never Gonna Give You Up"
}
```

| Champ | Type | Requis | Défaut |
|---|---|---|---|
| `url` | string | ✅ | — |
| `format` | string | ❌ | `"bestvideo+bestaudio/best"` |
| `title` | string | ❌ | `"video"` |

**Réponse `200 OK`**
```json
{
  "success": true,
  "jobId": "3f9a1c2b8e4d4a2f9b6c7d8e9f0a1b2c"
}
```

**Erreurs**
| Code | Cas |
|---|---|
| `400` | URL manquante ou invalide |
| `502` | Service vidéo injoignable |

---

### `GET /api/media/progress/:jobId`
Flux **Server-Sent Events (SSE)** de la progression du téléchargement. Se consomme côté client via `EventSource` (GET uniquement, pas de body).

**Auth** : aucune (le `jobId` fait office de token d'accès temporaire)

**Params**
| Param | Description |
|---|---|
| `jobId` | Identifiant retourné par `/download/start` |

**Exemple client**
```js
const evtSource = new EventSource(`/api/media/progress/${jobId}`);
evtSource.onmessage = (e) => console.log(JSON.parse(e.data));
```

**Messages envoyés** (`Content-Type: text/event-stream`)
```
data: {"type":"progress","percent":45.3,"total":"78.50MiB","speed":"1.23MiB/s","eta":"00:45"}

data: {"type":"done","jobId":"3f9a1c2b...","title":"video","ext":"mp4"}

data: {"type":"error","message":"Vidéo indisponible (supprimée ou retirée)."}
```

**Erreurs**
| Code | Cas |
|---|---|
| `404` | Job introuvable (expiré ou jamais existé) |
| `502` | Service vidéo injoignable |

---

### `GET /api/media/file/:jobId`
Télécharge le fichier final. **Usage unique** — le fichier est supprimé côté serveur une fois livré.

**Auth** : aucune (le `jobId` fait office de token d'accès temporaire)

**Params**
| Param | Description |
|---|---|
| `jobId` | Identifiant retourné par `/download/start`, une fois le job à `status: "done"` |

**Réponse `200 OK`**
Flux binaire (`video/mp4` ou `audio/mpeg`), avec :
```
Content-Disposition: attachment; filename="titre.mp4"
Content-Type: video/mp4
Content-Length: 15728640
```

**Erreurs**
| Code | Cas |
|---|---|
| `404` | Job non terminé, fichier expiré, ou déjà livré |

---

## 💳 Payment

### `POST /api/payment/initiate`
Démarre une transaction de paiement (accès Premium) auprès d'un des 3 prestataires.

**Auth** : `authMiddleware` (obligatoire)
**Rate limit** : `downloadLimiter`

**Requête**
```json
{
  "provider": "cinetpay",
  "phone": "690000000"
}
```

| Champ | Type | Requis | Valeurs |
|---|---|---|---|
| `provider` | string | ❌ (défaut `"cinetpay"`) | `"cinetpay"` \| `"campay"` \| `"wave"` |
| `phone` | string | ❌ (requis par certains providers pour Mobile Money) | — |

**Réponse `200 OK`**
```json
{
  "success": true,
  "payment_url": "https://checkout.cinetpay.com/payment/xxxxx",
  "transaction_id": "SL-A1B2C3D4E5F6G7H8"
}
```
Le client redirige l'utilisateur vers `payment_url`.

**Erreurs**
| Code | Cas |
|---|---|
| `400` | `provider` invalide |
| `401` | Non authentifié |
| `500` | Prestataire mal configuré (clé API manquante) ou erreur réseau |

---

### `POST /api/payment/webhook/cinetpay`
### `POST /api/payment/webhook/campay`
### `POST /api/payment/webhook/wave`

Webhooks appelés par les prestataires de paiement (pas par le client/navigateur) pour notifier la complétion d'une transaction. Déclenchent l'activation Premium du compte associé.

**Auth** : aucune (validation faite via la vérification serveur-à-serveur auprès du prestataire pour CinetPay ; à sécuriser davantage pour Campay/Wave si le prestataire le permet — ex : vérification de signature)

**Réponse `200 OK`** (toujours, pour accuser réception au prestataire)
```json
{ "code": 0 }
```
ou
```json
{ "status": "OK" }
```

---

### `GET /api/payment/status/:txId`
Consulte le statut d'une transaction.

**Auth** : `authMiddleware` (obligatoire — la transaction doit appartenir à l'utilisateur connecté)

**Params**
| Param | Description |
|---|---|
| `txId` | Identifiant de transaction (`transaction_id` retourné par `/initiate`) |

**Réponse `200 OK`**
```json
{
  "status": "completed",
  "is_premium": true
}
```
`status` : `"pending"` \| `"completed"` \| `"failed"`

**Erreurs**
| Code | Cas |
|---|---|
| `404` | Transaction introuvable ou n'appartenant pas à l'utilisateur |

---

## 🧪 Payment Test (environnement de dev uniquement)

> ⚠️ Ces routes sont prévues pour tester le flux de paiement en local sans dépendre des vrais prestataires. À désactiver ou protéger en production.

### `POST /payment-test/webhook/cinetpay`
Simule un webhook CinetPay réussi, sans appel réel au prestataire.

**Requête**
```json
{ "transaction_id": "SL-A1B2C3D4E5F6G7H8" }
```

**Réponse `200 OK`**
```json
{ "success": true, "simulated": true }
```

### `GET /payment-test/success`
Page HTML de retour "paiement réussi" (redirection automatique après 3s).

### `GET /payment-test/cancel`
Page HTML de retour "paiement annulé" (redirection automatique après 3s).

---

## 🩺 Health

### `GET /api/health`
Vérifie l'état du serveur et des dépendances.

**Auth** : aucune

**Réponse `200 OK`**
```json
{
  "status": "ok",
  "version": "2.1.0",
  "uptime": 12345.678,
  "ytdlp": "❌ non installé",
  "activeJobs": 0,
  "sseClients": 0,
  "payments": {
    "cinetpay": true,
    "campay": false,
    "wave": false
  }
}
```

> Note : `ytdlp` reflète l'état du yt-dlp **local** à l'app Node (probablement absent puisque le téléchargement est délégué au `video-service` Python) — ce champ mériterait d'être mis à jour pour interroger `/health` du `video-service` à la place.