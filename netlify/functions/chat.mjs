
const API = 'https://generativelanguage.googleapis.com/v1beta';
const preferred = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  }
});

async function getModels(key, signal) {
  const response = await fetch(`${API}/models?pageSize=100`, {
    headers: { 'x-goog-api-key': key },
    signal
  });

  if (!response.ok) {
    console.error('Gemini models list HTTP', response.status);
    return { status: response.status, models: [] };
  }

  const data = await response.json();

  return {
    status: 200,
    models: (data.models || [])
      .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
      .map(m => m.name.replace(/^models\//, ''))
  };
}

export default async function handler(request) {
  if (request.method !== 'POST') {
    return json({ error: 'Méthode non autorisée.' }, 405);
  }

  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    return json({ error: 'Clé GEMINI_API_KEY non configurée sur Netlify.' }, 503);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: 'Format JSON invalide.' }, 400);
  }

  if (
    !Array.isArray(body.messages) ||
    body.messages.length < 1 ||
    body.messages.length > 30
  ) {
    return json({ error: 'Conversation invalide.' }, 400);
  }

  const messages = body.messages.map(m => ({
    role: m.role === 'user' ? 'user' : m.role === 'ai' ? 'model' : 'invalid',
    parts: [{
      text: typeof m.text === 'string' ? m.text.slice(0, 4000) : ''
    }]
  }));

  if (
    messages.some(m => m.role === 'invalid' || !m.parts[0].text.trim()) ||
    messages.at(-1).role !== 'user'
  ) {
    return json({ error: 'Messages invalides.' }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);

  try {
    const available = await getModels(key, controller.signal);

    if (available.status === 401 || available.status === 403) {
      return json({
        error: 'Clé Gemini refusée. Vérifie la clé et les restrictions du projet Google.'
      }, 502);
    }

    if (available.status === 429) {
      return json({ error: 'Limite Gemini atteinte. Réessaie plus tard.' }, 429);
    }

    if (available.status !== 200) {
      return json({
        error: `Impossible de vérifier les modèles Gemini (HTTP ${available.status}).`
      }, 502);
    }

    const selected =
      preferred.find(name => available.models.includes(name)) ||
      available.models.find(name => /^gemini-/.test(name) && /flash/.test(name)) ||
      available.models.find(name => /^gemini-/.test(name));

    if (!selected) {
      return json({
        error: 'Aucun modèle Gemini compatible avec generateContent disponible pour cette clé.'
      }, 502);
    }

    const response = await fetch(
      `${API}/models/${encodeURIComponent(selected)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': key,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: 'Tu es Chat IA, un assistant utile, clair, chaleureux et honnête. Réponds principalement en français.'
            }]
          },
          contents: messages,
          generationConfig: { maxOutputTokens: 1600 }
        }),
        signal: controller.signal
      }
    );

    if (!response.ok) {
      let detail = '';

      try {
        detail = (await response.json()).error?.message || '';
      } catch {}

      console.error(
        'Gemini generateContent HTTP',
        response.status,
        'model',
        selected,
        detail.slice(0, 400)
      );

      if (response.status === 429) {
        return json({
          error: 'Quota Gemini atteint. Réessaie plus tard ou vérifie ton quota gratuit.'
        }, 429);
      }

      if (response.status === 401 || response.status === 403) {
        return json({
          error: 'Accès Gemini refusé. Vérifie les autorisations de ta clé API.'
        }, 502);
      }

      if (response.status === 404) {
        return json({
          error: `Modèle ${selected} introuvable ou indisponible. Consulte les logs Netlify.`
        }, 502);
      }

      return json({
        error: `Gemini a renvoyé une erreur HTTP ${response.status}. Consulte les logs Netlify.`
      }, 502);
    }

    const data = await response.json();

    const reply = data.candidates?.[0]?.content?.parts
      ?.filter(p => typeof p.text === 'string')
      .map(p => p.text)
      .join('\n');

    if (!reply?.trim()) {
      return json({
        error: 'Gemini n’a pas généré de texte. Réessaie.'
      }, 502);
    }

    return json({ reply });

  } catch (error) {
    console.error('Gemini function', error?.name || 'Error');

    return json({
      error: error?.name === 'AbortError'
        ? 'Gemini met trop de temps à répondre.'
        : 'Erreur de connexion à Gemini.'
    }, 502);

  } finally {
    clearTimeout(timeout);
  }
}

export const config = { path: '/api/chat' };
