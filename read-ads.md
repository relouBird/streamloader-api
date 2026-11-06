# Redirection vers le site et monétisation optionnelle

## Objectif

Permettre au bot Telegram de rediriger volontairement l'utilisateur vers le
site StreamLoaders, qui propose le même service et peut afficher ses propres
éléments de monétisation, sans transformer une publicité en condition d'accès
au téléchargement.

Le parcours ne doit jamais dire ou laisser entendre :

- « clique pour débloquer le téléchargement » ;
- « regarde la publicité avant de recevoir ta vidéo » ;
- « attends X secondes pour continuer ».

Le téléchargement doit être autorisé par le quota et le plan déterminés par
l'API métier, indépendamment de la visite du site.

## Responsabilité de chaque projet

### Bot Telegram (`testbot-api`)

- reçoit la demande et lance le téléchargement via l'API métier ;
- envoie le résultat à l'utilisateur ;
- demande à l'API, après un téléchargement réussi, si une offre est due ;
- affiche ensuite, au plus une fois toutes les six heures, un bouton
  `Visiter StreamLoaders`, uniquement si l'API le demande ;
- ne connaît jamais le secret utilisé pour vérifier le jeton côté site ;
- ne stocke pas de données publicitaires sensibles ;
- ne transmet jamais la liste d'utilisateurs à un annonceur.

### API métier

- reste la source de vérité pour le plan, les quotas et l'état de la campagne ;
- signe ou vérifie les jetons de redirection ;
- décide si une campagne est active et si l'utilisateur est éligible ;
- conserve, si nécessaire, le dernier affichage par utilisateur et par
  campagne ;
- expose un endpoint interne de vérification au site ;
- peut produire les statistiques agrégées de clics et de conversions.

### Site web

- reçoit le lien provenant du bouton Telegram ;
- appelle l'API de vérification côté serveur ;
- affiche la page StreamLoaders et ses publicités selon sa propre politique ;
- ne valide jamais le jeton uniquement en JavaScript ;
- ne bloque pas l'accès au service sur un clic publicitaire ;
- propose un retour simple vers le bot.

### Annonceur éventuel

Un annonceur ne reçoit ni `telegramId`, ni la base des utilisateurs. Il reçoit
uniquement des statistiques agrégées ou une redirection vers sa propre URL
après consentement et selon les règles de la campagne.

## Parcours recommandé

```text
1. Utilisateur envoie une URL au bot
2. Bot demande analyse/téléchargement à l'API
3. API applique quota et plan
4. Bot envoie la vidéo ou le fichier
5. Bot appelle `POST /api/bot/site-offer` pour cet utilisateur actif
6. Si l'API répond `showSupportButton: true`, bot ajoute un bouton optionnel
7. Bouton -> https://www.example.com/from-telegram?t=<jeton>
8. Le serveur du site envoie t à l'API métier
9. L'API vérifie signature, audience, expiration et campagne
10. Le site affiche sa page et ses publicités autorisées
```

Il n'est pas nécessaire que l'API appelle un endpoint webhook du bot. Le site
peut demander la vérification au moment de la visite : c'est plus simple,
résilient et évite de maintenir un état « visite reçue » dans le bot.

## Jeton de redirection

Ne pas utiliser un lien de confiance comme :

```text
?telegramId=123456789&valid=true
```

Ne pas hasher simplement `telegramId + date` : un hash sans secret est
recalculable et ne prouve pas que le lien a été émis par l'API.

### Option recommandée : jeton signé HMAC

Le bot demande à l'API un jeton opaque avant d'envoyer le bouton, ou l'API
retourne un jeton lors d'une réponse de téléchargement. Le jeton contient
logiquement :

```json
{
  "sub": "identifiant interne ou telegramId chiffré",
  "src": "telegram_bot",
  "campaign": "site_visit",
  "iat": 1790000000,
  "exp": 1790003600,
  "jti": "identifiant-aleatoire"
}
```

Le contenu peut être un JWT signé ou un format `base64url(payload).HMAC`.
Le secret reste uniquement dans l'API et le serveur du site. Le bot n'a pas
besoin de le connaître.

Recommandations :

- expiration courte, par exemple 15 à 60 minutes ;
- `aud` distinct pour le site ;
- `jti` aléatoire si l'usage unique est souhaité ;
- ne pas placer d'e-mail, de clé API ou de données personnelles dans le jeton ;
- transmettre le jeton uniquement en HTTPS ;
- ne pas journaliser l'URL complète.

## Vérification côté API

Contrat proposé :

```http
POST /api/public/telegram-visit/verify
Authorization: Bearer <secret serveur-site>
Content-Type: application/json

{
  "token": "<jeton reçu par le site>",
  "source": "telegram_bot"
}
```

Réponse valide :

```json
{
  "valid": true,
  "campaign": "site_visit",
  "source": "telegram_bot",
  "expiresAt": "2026-11-06T15:00:00.000Z"
}
```

Réponse invalide :

```json
{
  "valid": false,
  "reason": "expired"
}
```

Le secret de cette route doit être distinct de `X_BOT_SECRET` si le site et
l'API ont des cycles de déploiement différents. Si le site est servi par
l'API elle-même, l'appel peut rester interne et ne pas exposer de secret au
navigateur.

## Règle des six heures

### Ce que le cache du bot peut faire

Le `SessionStore` actuel est un cache LRU en mémoire avec un TTL de 23 heures.
Il peut servir à éviter un affichage répétitif pendant le processus courant,
mais il n'est pas fiable comme règle métier :

- il est perdu au redémarrage ;
- il peut évincer une entrée avant six heures ;
- plusieurs instances ne partagent pas le cache ;
- polling et webhook ne garantissent pas la même mémoire.

Il ne faut donc pas utiliser ce cache pour une restriction commerciale stricte.

### Solution minimale recommandée

Ajouter dans l'API une table ou un stockage clé-valeur minimal :

```text
telegram_ad_touch
- telegram_user_key
- campaign_key
- last_offered_at
- created_at
- updated_at
```

`telegram_user_key` doit être un HMAC serveur de l'identifiant Telegram, par
exemple `HMAC-SHA256(TELEGRAM_USER_HASH_SECRET, telegramId)`. Un hash simple
ou un identifiant Telegram en clair n'est pas nécessaire.

L'API répond au bot via `POST /api/bot/site-offer` :

```json
{
  "showSupportButton": true,
  "redirectToken": "...",
  "nextEligibleAt": "2026-11-06T20:00:00.000Z"
}
```

La décision et l'enregistrement doivent être atomiques pour éviter deux
messages lors de téléchargements simultanés. Si l'API répond
`showSupportButton: false`, le bot n'envoie rien.

Cette route n'est donc pas un envoi publicitaire global. Elle est déclenchée
par une activité réelle et récente : un fichier vient d'être transmis à cet
utilisateur. L'API peut distinguer :

- `offered_at` : le bouton a été proposé dans Telegram ;
- `clicked_at` : le site a reçu une requête avec le jeton ;
- `verified_at` : le jeton a été validé côté serveur ;
- `visited_at` : la page du site a été rendue, selon les limites de mesure
  acceptables.

Le bot ne doit pas prétendre que l'utilisateur a vu le site simplement parce
que le bouton a été envoyé. La mesure fiable commence côté serveur du site.

### Variante sans nouvelle table

Un champ `lastTelegramSiteOfferAt` dans la table utilisateur existante peut
suffire si l'offre est globale et unique. Cette solution est préférable à une
nouvelle table si l'API possède déjà la relation `telegramId -> user`.
Cependant, elle ne couvre pas proprement plusieurs campagnes ou utilisateurs
Telegram non liés à un compte du site.

## Bouton Telegram

Le bouton est informatif et optionnel :

```ts
{
  inline_keyboard: [[
    {
      text: "🌐 Visiter StreamLoaders",
      url: `${SITE_URL}/from-telegram?t=${encodeURIComponent(token)}`
    }
  ]]
}
```

Le téléchargement doit déjà être terminé avant l'envoi de ce bouton. Le
message peut préciser :

```text
🎬 Ton téléchargement est terminé.

Tu peux visiter StreamLoaders pour découvrir les nouveautés et soutenir le
service.
```

Pour les utilisateurs Premium, l'offre peut être masquée ou remplacée par un
message sans publicité.

## Configuration proposée

Dans le `.env` du bot :

```env
SITE_URL=https://streamloaders.example
TELEGRAM_SITE_OFFER_ENABLED=true
TELEGRAM_SITE_OFFER_INTERVAL_HOURS=6
```

Le bot appelle la route uniquement si `TELEGRAM_SITE_OFFER_ENABLED=true` et
si `SITE_URL` est défini. Il ne doit pas recevoir
`TELEGRAM_USER_HASH_SECRET` ni le secret de signature. Il demande une décision
et un jeton à l'API. Une erreur sur cette route est non bloquante : le fichier
déjà téléchargé reste envoyé.

## Anti-abus et confidentialité

- rate-limit sur l'endpoint de vérification ;
- ne pas accepter `telegramId` depuis le navigateur ;
- ne pas faire confiance à `src`, `campaign` ou `valid` venant du client ;
- refuser les jetons expirés ou mal signés ;
- ne pas rediriger vers une URL arbitraire fournie par un annonceur ;
- conserver uniquement des compteurs et dates nécessaires ;
- prévoir une désactivation des offres partenaires ;
- marquer clairement les contenus sponsorisés ;
- ne pas conditionner les téléchargements à une impression, un clic ou une
  visite ;
- ne pas envoyer de messages marketing sans préférence ou base légale adaptée.

## Décision proposée

1. Phase 1 : bouton optionnel vers le site après téléchargement.
2. Phase 2 : endpoint API qui décide l'éligibilité et émet un jeton court.
3. Phase 3 : vérification serveur du site et statistiques agrégées.
4. Phase 4 : stockage API minimal du dernier affichage sur six heures.
5. Ne pas ajouter de webhook API -> bot pour ce parcours.
