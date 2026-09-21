# 07 — Sécurité

## 1. Authentification et autorisation

L'API utilise JWT via `djangorestframework-simplejwt`.

Les permissions métier sont vérifiées côté backend :

- `IsDistributeur` impose un utilisateur authentifié avec rôle `DISTRIBUTEUR` ;
- `IsSiege` impose un utilisateur authentifié avec rôle `SIEGE`.

Les routes distributeur filtrent également les demandes par `distributeur=request.user`. Le fait de connaître l'UUID d'un autre dossier ne donne donc pas accès à ce dossier.

## 2. Transitions d'état côté serveur

Le frontend ne décide pas seul de ce qu'un utilisateur peut modifier.

Le backend vérifie notamment :

- modification FDR uniquement en `BROUILLON` ;
- ajout/suppression de pièces uniquement en `BROUILLON` ;
- création/modification du projet distributeur uniquement en `EN_COURS` ;
- traitement SIÈGE uniquement pour une demande encore traitable ;
- validation d'attestation impossible si elle est déjà validée.

## 3. Verrouillage concurrent

Les opérations critiques utilisent `select_for_update()` dans une transaction.

Cela limite les courses entre deux requêtes concurrentes, par exemple deux validations, deux relances ou deux décisions SIÈGE sur la même demande.

## 4. Fichiers privés

Le backend ne configure pas de `MEDIA_URL` public.

En développement, les fichiers sont dans `backend/media`. En environnement Azure, le stockage par défaut peut être remplacé par un conteneur Blob privé.

Les fichiers SIÈGE sont servis par des vues Django après contrôle de rôle et de contexte métier.

## 5. Noms de fichiers et chemins opaques

Le chemin physique d'un justificatif ne réutilise pas le nom fourni par le client.

Le serveur :

- conserve le nom original séparément pour l'affichage ;
- reprend seulement l'extension ;
- construit un chemin avec UUID.

Cela évite d'utiliser directement une chaîne client comme chemin de stockage.

## 6. Validation des uploads

Les justificatifs sont limités à :

- `.pdf` + `application/pdf` ;
- `.jpg` / `.jpeg` + `image/jpeg` ;
- `.png` + `image/png`.

Le contrôle combine extension et type MIME déclaré.

Limites :

- pas de limite de taille explicite dans le code applicatif ;
- pas d'analyse antivirus/antimalware ;
- le type MIME fourni n'est pas une preuve du contenu binaire réel.

Ces points sont des évolutions de sécurité pertinentes pour une version de production.

## 7. Sanitization HTML

Les contenus WYSIWYG sont nettoyés côté backend avec Bleach avant persistance.

Balises autorisées :

```text
p br strong em u h1 h2 h3 ul ol li blockquote
```

Aucun attribut HTML n'est autorisé.

La sécurité ne dépend donc pas d'une transformation effectuée uniquement côté navigateur.

## 8. Prompt injection et IA

Le contrôle de cohérence :

- transforme l'attestation en texte après sanitization ;
- demande explicitement au modèle d'ignorer les instructions contenues dans les documents ;
- impose une réponse structurée Pydantic ;
- interdit les champs supplémentaires ;
- masque les erreurs internes du SDK.

L'IA n'exécute aucune action métier et ne peut pas accepter/refuser une demande.

## 9. Secrets

Le code attend les secrets par variables d'environnement :

- `SECRET_KEY` ;
- credentials PostgreSQL ou `DATABASE_URL` ;
- credentials Azure Storage ;
- SMTP ;
- `MISTRAL_API_KEY`.

Les `.env` sont ignorés par Git et seuls les `.env.example` sont versionnés.

Aucun mot de passe de démonstration n'est fourni par la documentation.

## 10. Configuration HTTP de production

Lorsque `DEBUG=False`, le backend active :

- `SECURE_PROXY_SSL_HEADER` pour un reverse proxy terminant TLS ;
- `SESSION_COOKIE_SECURE` ;
- `CSRF_COOKIE_SECURE` ;
- `SECURE_CONTENT_TYPE_NOSNIFF` ;
- HSTS configurable via `SECURE_HSTS_SECONDS`.

`ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS` et `CORS_ALLOWED_ORIGINS` sont fournis par environnement.

Le défaut de `SECURE_HSTS_SECONDS` est `0` : l'activation d'HSTS doit être faite explicitement après validation du domaine HTTPS.

## 11. Documentation API en développement uniquement

Les routes OpenAPI/Swagger et les endpoints de test de rôle ne sont ajoutés que lorsque `DEBUG=True`.

Cela réduit l'exposition d'outils de développement dans l'environnement de production.

## 12. JWT dans `localStorage`

La version actuelle stocke access et refresh token dans `localStorage`.

Avantage : intégration simple avec la SPA et le Bearer token.

Risque : en cas de XSS, un script exécuté dans l'origine peut lire ces tokens.

Une évolution de sécurité naturelle serait de déplacer le mécanisme de session vers des cookies `HttpOnly`, `Secure` et `SameSite`, avec une stratégie CSRF adaptée.

## 13. Suppression des fichiers

La suppression d'un brouillon supprime les justificatifs du stockage avant la suppression DB.

La génération d'un PDF final prévoit également un nettoyage du fichier créé lorsqu'une exception intervient après l'écriture stockage mais avant la fin de l'opération.

Cette logique est nécessaire car une transaction SQL ne rollbacke pas automatiquement un objet dans un stockage externe.

## 14. Hypothèse de compte SIÈGE unique

Les notifications d'envoi et relances résolvent **exactement un** compte `SIEGE`.

S'il y en a zéro ou plusieurs, le backend considère la configuration comme invalide plutôt que de choisir un compte arbitrairement.

Cette règle est une simplification applicative actuelle, pas un mécanisme d'assignation scalable.
