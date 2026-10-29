# Chat IA + Google Gemini — déploiement Netlify

## Installation
1. Créer une clé API Gemini sur https://aistudio.google.com/apikey (vérifier l'éligibilité au quota gratuit).
2. Créer un dépôt GitHub **privé** et y envoyer le contenu de ce dossier (index.html, netlify.toml, netlify/functions/chat.mjs).
3. Dans https://app.netlify.com : Add new project > Import an existing project > GitHub > sélectionner le dépôt. Build command : vide ; Publish directory : `.` ; Functions directory : `netlify/functions` (déjà dans netlify.toml).
4. Dans Netlify > Project configuration > Environment variables, créer `GEMINI_API_KEY` et y mettre la clé. Ne jamais placer la clé dans index.html ou GitHub.
5. Déclencher un nouveau déploiement après avoir ajouté la variable.
6. Ouvrir l'URL Netlify et envoyer une question. Le navigateur appelle `/api/chat` ; la fonction Netlify appelle Gemini.

## Limitations importantes
- L'offre gratuite Gemini a des quotas et une éligibilité variables. Aucun fonctionnement illimité garanti.
- Ce projet est une **version de test**. Il manque une protection anti-abus, une authentification, des quotas par visiteur, et de la surveillance. Ne pas ouvrir massivement le service sans ces protections.
- Le panneau admin caché `#admin` et `DEMO-ADMIN` sont **non sécurisés** : pas de données réelles ni de gestion des utilisateurs.
- Les statistiques, abonnements, paiements, vidéos et codes promo sont des démonstrations, non persistants.
- Les discussions ne sont pas sauvegardées côté serveur.
- La voix dépend du navigateur et de ses permissions.
- Si l'API ne répond pas, inspecter les logs de la fonction `chat` dans Netlify.
