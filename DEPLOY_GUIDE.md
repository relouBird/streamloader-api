# StreamLoader v2.1 — Guide de déploiement complet

## Structure du projet

```
streamloader_web/
├── server.js          → Backend Express (API, auth, SSE, paiements)
├── database.js        → SQLite (users, transactions, downloads)
├── package.json       → Dépendances Node.js
├── nixpacks.toml      → Config Railway (yt-dlp + ffmpeg auto)
├── .env.example       → Variables d'environnement (à copier en .env)
├── .gitignore
└── public/
    └── index.html     → Frontend complet (design + JS)
```

---

## ÉTAPE 1 — Tester en local (Windows / Mac / Linux)

### 1.1 Installer les prérequis

**Node.js 18+**
→ https://nodejs.org → télécharger LTS → installer

**Python + pip**
→ https://python.org → installer Python 3.11+
→ Lors de l'installation Windows : cocher ✅ "Add Python to PATH"

**yt-dlp**
```bash
pip install yt-dlp
```

**FFmpeg** (pour conversion audio MP3)
→ https://ffmpeg.org/download.html
→ Windows : télécharger, extraire, ajouter le dossier `bin/` au PATH système

### 1.2 Installer et démarrer

```bash
# Dans le dossier du projet
cd streamloader_web

# Installer les dépendances Node
npm install

# Copier le fichier d'environnement
cp .env.example .env
# Ouvrir .env et modifier JWT_SECRET (obligatoire !)

# Démarrer
npm start

# → Ouvrir http://localhost:3000
```

### 1.3 Vérifier que tout fonctionne

```
http://localhost:3000/api/health
```

Réponse attendue :
```json
{
  "status": "ok",
  "ytdlp": "2026.x.x",
  "payments": { "cinetpay": false, "campay": false, "wave": false }
}
```

---

## ÉTAPE 2 — Déployer sur Railway (hébergement cloud)

Railway est la plateforme recommandée : gratuit pour démarrer, Node.js et yt-dlp supportés nativement.

### 2.1 Créer un compte GitHub et pousser le projet

```bash
# Dans le dossier streamloader_web
git init
git add .
git commit -m "StreamLoader v2.1 — initial commit"

# Créer un repo sur github.com (bouton +, New repository)
# Puis connecter :
git remote add origin https://github.com/TON_USERNAME/streamloader-web.git
git push -u origin main
```

### 2.2 Déployer sur Railway

1. Aller sur **https://railway.app** → Sign up (avec GitHub)
2. Cliquer **"New Project"** → **"Deploy from GitHub repo"**
3. Sélectionner le repo `streamloader-web`
4. Railway détecte automatiquement `nixpacks.toml` et installe yt-dlp + ffmpeg ✅

### 2.3 Configurer les variables d'environnement sur Railway

Railway Dashboard → ton projet → **Variables** → ajouter :

```
NODE_ENV          = production
PORT              = 3000
APP_URL           = https://ton-domaine.com   ← mettre temporairement l'URL Railway
JWT_SECRET        = [générer une clé longue et aléatoire, min 64 caractères]
DB_PATH           = /data/streamloader.db
```

**Générer un JWT_SECRET sécurisé :**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 2.4 Ajouter un Volume (pour que la BDD persiste entre redémarrages)

Railway Dashboard → ton projet → ton service → **Settings** → **Add Volume**
- Mount Path : `/data`
- Cela garantit que la base de données SQLite n'est pas perdue lors des redéploiements

### 2.5 Déployer

Cliquer **Deploy** → attendre 2-3 minutes.
Railway fournit une URL du type : `https://streamloader-web-prod.railway.app`

Tester : `https://streamloader-web-prod.railway.app/api/health`

---

## ÉTAPE 3 — Nom de domaine

### 3.1 Acheter un domaine

**Recommandé :** [Namecheap.com](https://namecheap.com)
- `.com` : ~$9-12/an
- `.app` : ~$12-15/an ← recommandé pour une appli web
- `.cm` (Cameroun) : ~$30-50/an

Suggestions : `streamloader.app`, `streamloader.cm`, `streamloaderfr.com`

### 3.2 Connecter le domaine à Railway

1. Railway Dashboard → ton projet → **Settings** → **Domains**
2. Cliquer **"Add Custom Domain"** → saisir `streamloader.app`
3. Railway affiche un enregistrement CNAME à créer

### 3.3 Configurer les DNS (exemple Namecheap)

Namecheap Dashboard → Domain List → ton domaine → **Advanced DNS** :

| Type  | Host | Value                        | TTL  |
|-------|------|------------------------------|------|
| CNAME | @    | XXXXXX.railway.app           | Auto |
| CNAME | www  | XXXXXX.railway.app           | Auto |

⏳ Propagation DNS : 15 min à 48h

### 3.4 Mettre à jour APP_URL

Une fois le domaine actif, mettre à jour dans Railway Variables :
```
APP_URL = https://streamloader.app
```

Puis **redéployer** (Railway → Deployments → Redeploy).

---

## ÉTAPE 4 — Paiements (CinetPay recommandé)

### 4.1 Créer un compte CinetPay

1. Aller sur **https://cinetpay.com**
2. Cliquer **"Créer un compte"** → type : Entreprise ou Particulier
3. Remplir nom, email, téléphone
4. Vérifier l'email reçu
5. Compléter le KYC (pièce d'identité) pour activer les paiements réels

### 4.2 Récupérer les clés API

Dashboard CinetPay → **Paramètres** → **API** → copier :
- `API Key`
- `Site ID`

### 4.3 Ajouter dans Railway Variables

```
CINETPAY_API_KEY = ta_cle_api
CINETPAY_SITE_ID = ton_site_id
```

### 4.4 Configurer le Webhook CinetPay

Dashboard CinetPay → **Paramètres** → **Notifications IPN** :
```
URL de notification : https://streamloader.app/api/payment/webhook/cinetpay
```

### 4.5 Tester un paiement

Utiliser les numéros de test CinetPay (disponibles dans leur documentation Dashboard).

---

## ÉTAPE 5 — Publicités Google AdSense

### 5.1 Créer un compte AdSense

1. Aller sur **https://adsense.google.com**
2. Ajouter ton site (`streamloader.app`)
3. Coller le code de vérification AdSense dans `<head>` de `index.html`
4. Attendre l'approbation : 2 à 14 jours

### 5.2 Intégrer AdSense dans index.html

Chercher la fonction `loadAdScripts()` dans `index.html`.

Décommenter le bloc **OPTION 1 : Google AdSense** et remplacer `ca-pub-XXXXXXXXXXXXXXXX` :

```javascript
const adSenseScript = document.createElement('script');
adSenseScript.async = true;
adSenseScript.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-TON_ID_ICI';
adSenseScript.crossOrigin = 'anonymous';
// ...
```

### 5.3 Ajouter les blocs ins dans les slots

Dans chaque `<div class="ad-slot-inner">`, coller le code généré par AdSense Dashboard.

**Note :** Les membres Premium ne voient jamais ces pubs (masquées automatiquement par `updateAdVisibility()`).

---

## ÉTAPE 6 — Maintenance

### Mettre à jour yt-dlp manuellement

Si des sites arrêtent de fonctionner, forcer une mise à jour :

```bash
# En local
pip install yt-dlp --upgrade

# Sur Railway → Variables → ajouter une variable temporaire
# pour déclencher un redéploiement, puis supprimer
```

Le serveur fait une mise à jour automatique toutes les 24h au démarrage.

### Surveiller les logs Railway

Railway Dashboard → ton projet → **Deployments** → cliquer sur le dernier → **View Logs**

### Sauvegarder la base de données

Railway Dashboard → ton projet → **Volumes** → **Download** (backup SQLite)

---

## Récapitulatif des coûts (année 1)

| Poste                  | Coût estimé         |
|------------------------|---------------------|
| Domaine `.app`         | ~15 $/an            |
| Railway Hobby plan     | ~5 $/mois = 60 $/an |
| CinetPay               | 3.5% par transaction|
| **Total fixe/an**      | **~75 $**           |
| **Potentiel revenus**  | **300-800 $/mois**  |

---

## Checklist avant mise en ligne

- [ ] `npm start` fonctionne en local
- [ ] `/api/health` répond `"status":"ok"` avec yt-dlp détecté
- [ ] Analyse d'une URL YouTube fonctionne (miniature visible)
- [ ] Téléchargement d'un fichier fonctionne (barre de progression réelle)
- [ ] Création de compte fonctionne (email + password)
- [ ] Connexion fonctionne
- [ ] Déployé sur Railway
- [ ] Volume `/data` ajouté sur Railway
- [ ] `JWT_SECRET` changé (clé longue et aléatoire)
- [ ] `APP_URL` mis à jour avec le vrai domaine
- [ ] Domaine acheté et DNS configuré
- [ ] HTTPS actif (automatique sur Railway)
- [ ] CinetPay configuré + webhook actif
- [ ] Test paiement sandbox réussi
- [ ] AdSense soumis pour approbation
- [ ] `updateAdVisibility()` testé : pubs visibles en gratuit, cachées en premium
