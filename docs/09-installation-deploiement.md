# 09 — Installation et déploiement

## 1. Prérequis

### Backend

- Python 3.12, conformément au `Dockerfile` ;
- PostgreSQL ;
- dépendances de `backend/requirements.txt`.

### Frontend

Le `package.json` déclare :

```text
Node ^22.12.0 ou >=24.0.0
```

Utiliser `npm ci` pour respecter le lockfile.

## 2. Lancer PostgreSQL localement

Le dépôt contient un `docker-compose.yml` uniquement pour la base.

```bash
docker compose up -d db
```

Le service publie PostgreSQL sur le port local `5433`.

## 3. Configuration backend locale

Créer un fichier local à partir de l'exemple :

```bash
cp backend/.env.example backend/.env
```

Variables minimales en développement :

```env
SECRET_KEY=une-valeur-locale
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
POSTGRES_DB=attestation_db
POSTGRES_USER=attestation_user
POSTGRES_PASSWORD=attestation_pwd
POSTGRES_HOST=localhost
POSTGRES_PORT=5433
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

Le backend choisit `DATABASE_URL` si elle est fournie ; sinon les variables `POSTGRES_*` sont utilisées.

## 4. Installer et lancer le backend

Depuis la racine :

```bash
python -m venv .venv
source .venv/bin/activate        # Windows : .venv\Scripts\activate
pip install -r backend/requirements.txt
cd backend
python manage.py migrate
python manage.py runserver
```

API locale :

```text
http://localhost:8000/api
```

Swagger en développement :

```text
http://localhost:8000/api/docs/
```

Probe santé :

```text
http://localhost:8000/healthz
```

## 5. Créer les comptes locaux

Le dépôt ne contient ni fixture ni commande de seed.

L'application attend au moins :

- un utilisateur `DISTRIBUTEUR` ;
- **exactement un** utilisateur `SIEGE` pour les notifications d'envoi et les relances.

Exemple depuis `python manage.py shell` :

```python
from comptes.models import Role, Utilisateur

Utilisateur.objects.create_user(
    username="distributeur_local",
    password="<mot-de-passe-local>",
    role=Role.DISTRIBUTEUR,
)

Utilisateur.objects.create_user(
    username="siege_local",
    password="<mot-de-passe-local>",
    email="siege@example.test",
    role=Role.SIEGE,
)
```

Ces identifiants sont des exemples locaux et ne doivent pas être utilisés tels quels en production.

## 6. Frontend local

```bash
cp frontend/.env.example frontend/.env
cd frontend
npm ci
npm run dev
```

Exemple :

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

Un build de production sans `VITE_API_BASE_URL` échoue volontairement au démarrage du code frontend.

## 7. Email

Le défaut local utilise le backend console Django :

```env
EMAIL_BACKEND=django.core.mail.backends.console.EmailBackend
```

Pour un SMTP réel :

```env
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_HOST_USER=...
EMAIL_HOST_PASSWORD=...
EMAIL_USE_TLS=True
EMAIL_USE_SSL=False
DEFAULT_FROM_EMAIL=...
```

Ne jamais versionner `EMAIL_HOST_PASSWORD`.

La relance n'est persistée que si l'envoi SMTP réussit.

## 8. IA

### Simulation locale

```env
AI_COHERENCE_BACKEND=simulation
```

Aucune clé externe n'est nécessaire.

### Mistral

```env
AI_COHERENCE_BACKEND=mistral
MISTRAL_API_KEY=...
MISTRAL_MODEL=mistral-medium-latest
```

## 9. Stockage fichier

### Local

Sans variable Azure, le stockage Django utilise :

```text
backend/media
```

### Azure Blob Storage

Le backend bascule sur `django-storages` si au moins une des variables de compte/connexion est présente.

Configuration par connection string :

```env
AZURE_STORAGE_CONNECTION_STRING=...
AZURE_STORAGE_CONTAINER=media
```

ou compte + clé :

```env
AZURE_STORAGE_ACCOUNT_NAME=...
AZURE_STORAGE_ACCOUNT_KEY=...
AZURE_STORAGE_CONTAINER=media
```

Le conteneur métier doit rester privé ; aucun `MEDIA_URL` public n'est prévu.

## 10. PostgreSQL managé

La voie la plus simple pour un environnement déployé est :

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
```

Le backend active :

- `CONN_MAX_AGE`, 60 secondes par défaut ;
- `CONN_HEALTH_CHECKS=True`.

## 11. Construire le backend Docker

Depuis la racine :

```bash
docker build -t attestation-backend ./backend
```

Le conteneur :

- écoute sur `8000` ;
- exécute Gunicorn ;
- tourne sous l'utilisateur non root `app` ;
- écrit ses logs sur stdout/stderr.

Commande d'exécution définie :

```text
gunicorn config.wsgi:application \
  --bind 0.0.0.0:8000 \
  --workers 2 \
  --timeout 60
```

## 12. Variables backend de production

Variables principales :

| Variable | Usage |
| --- | --- |
| `SECRET_KEY` | secret Django |
| `DEBUG` | doit être `False` |
| `ALLOWED_HOSTS` | hosts Django |
| `CSRF_TRUSTED_ORIGINS` | origines HTTPS de confiance |
| `CORS_ALLOWED_ORIGINS` | origine du frontend |
| `DATABASE_URL` | PostgreSQL déployé |
| `DB_CONN_MAX_AGE` | pool de connexions Django |
| `AZURE_STORAGE_*` | stockage de fichiers |
| `EMAIL_*` | transport SMTP |
| `AI_COHERENCE_BACKEND` | `simulation` ou `mistral` |
| `MISTRAL_API_KEY` | clé IA |
| `MISTRAL_MODEL` | modèle IA |
| `SECURE_HSTS_SECONDS` | HSTS après validation HTTPS |
| `LOG_LEVEL` | niveau de logs |

## 13. Azure Static Web Apps

Le dépôt contient :

```text
.github/workflows/azure-static-web-apps-thankful-field-0e278271e.yml
```

Le workflow :

- s'exécute sur `master` et les pull requests associées ;
- utilise `Azure/static-web-apps-deploy@v1` ;
- prend `frontend` comme `app_location` ;
- utilise `dist` comme `output_location` ;
- injecte `VITE_API_BASE_URL` au build.

Le token Azure Static Web Apps est lu depuis les secrets GitHub.

## 14. Azure Container Apps

Le dépôt ne contient pas de workflow ou d'Infrastructure as Code pour le backend. Le `Dockerfile` et l'endpoint `/healthz` sont toutefois directement compatibles avec un déploiement de type Azure Container Apps.

Pour un environnement de production, le service conteneur doit fournir au minimum :

- les variables/secrets backend ;
- accès PostgreSQL ;
- accès au stockage privé ;
- sortie SMTP ;
- exposition TLS vers le port applicatif 8000 ;
- probe HTTP sur `/healthz`.

## 15. Migrations lors du déploiement

Les migrations Django doivent être exécutées explicitement sur la base cible :

```bash
python manage.py migrate
```

Le `Dockerfile` exécute `collectstatic` au build, mais n'exécute pas `migrate` au démarrage du conteneur.

Cette séparation évite que plusieurs réplicas lancent automatiquement la même migration en concurrence, mais elle impose une étape de déploiement contrôlée.
