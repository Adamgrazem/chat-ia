
const API = "https://generativelanguage.googleapis.com/v1beta";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

const preferredModels = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-flash-latest"
];

async function googleRequest(url, key, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "x-goog-api-key": key,
      ...(options.headers || {})
    }
  });

  let data = {};
  try {
    data = await response.json();
  } catch {}

  return {
    status: response.status,
    ok: response.ok,
    data
  };
}

async function findModels(key, signal) {
  const result = await googleRequest(
    `${API}/models?pageSize=100`,
    key,
    { signal }
  );

  if (!result.ok) {
    return {
      error: result.data.error?.message ||
        `Erreur Google HTTP ${result.status}`,
      status: result.status,
      models: []
    };
  }

  const models = (result.data.models || [])
    .filter(model =>
      model.supportedGenerationMethods?.includes("generateContent")
    )
    .map(model => model.name.replace(/^models\//, ""));

  const ordered = [
    ...preferredModels.filter(name => models.includes(name)),
    ...models.filter(name =>
      name.startsWith("gemini-") &&
      name.includes("flash") &&
      !preferredModels.includes(name)
    )
  ];

  return {
    status: 200,
    models: [...new Set(ordered)]
  };
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return json({ error: "Méthode non autorisée." }, 405);
  }

  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    return json({
      error: "Clé GEMINI_API_KEY absente dans Netlify."
    }, 503);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Message JSON invalide." }, 400);
  }

  if (
    !Array.isArray(body.messages) ||
    body.messages.length === 0 ||
    body.messages.length > 30
  ) {
    return json({ error: "Conversation invalide." }, 400);
  }

  const messages = body.messages.map(message => ({
    role:
      message.role === "user" ? "user" :
      message.role === "ai" ? "model" :
      "invalid",
    parts: [{
      text: typeof message.text === "string"
        ? message.text.slice(0, 4000)
        : ""
    }]
  }));

  if (
    messages.some(message =>
      message.role === "invalid" ||
      !message.parts[0].text.trim()
    ) ||
    messages[messages.length - 1].role !== "user"
  ) {
    return json({ error: "Messages invalides." }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    25000
  );

  try {
    const available = await findModels(
      key,
      controller.signal
    );

    if (available.status !== 200) {
      console.error(
        "Gemini model listing:",
        available.status,
        available.error
      );

      return json({
        error:
          available.status === 429
            ? "Quota Gemini atteint. Réessaie plus tard."
            : available.status === 401 ||
              available.status === 403
            ? "Clé Gemini refusée ou accès interdit."
            : `Impossible de récupérer les modèles Gemini (HTTP ${available.status}).`
      }, available.status === 429 ? 429 : 502);
    }

    if (!available.models.length) {
      return json({
        error: "Aucun modèle Gemini Flash disponible avec cette clé."
      }, 502);
    }

    let lastError = "";

    for (const model of available.models.slice(0, 5)) {
      const result = await googleRequest(
        `${API}/models/${model}:generateContent`,
        key,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{
                text:
                  "Tu es Chat IA, un assistant intelligent, " +
                  "clair, utile et chaleureux. " +
                  "Réponds principalement en français."
              }]
            },
            contents: messages,
            generationConfig: {
              maxOutputTokens: 2048
            }
          }),
          signal: controller.signal
        }
      );

      if (result.ok) {
        const reply = result.data.candidates?.[0]
          ?.content?.parts
          ?.filter(part => typeof part.text === "string")
          .map(part => part.text)
          .join("\n")
          .trim();

        if (reply) {
          return json({ reply });
        }

        lastError = "Gemini n'a généré aucun texte.";
        continue;
      }

      lastError =
        result.data.error?.message ||
        `Erreur HTTP ${result.status}`;

      console.error(
        "Gemini:",
        model,
        "HTTP",
        result.status,
        lastError.slice(0, 500)
      );

      if (result.status === 404) {
        continue;
      }

      if (result.status === 429) {
        return json({
          error:
            "Quota Gemini atteint ou offre gratuite indisponible. " +
            "Vérifie les quotas de ton projet Google AI Studio."
        }, 429);
      }

      if (
        result.status === 401 ||
        result.status === 403
      ) {
        return json({
          error:
            "Google refuse l'accès. Vérifie la clé Gemini " +
            "et les autorisations du projet."
        }, 502);
      }

      return json({
        error:
          `Erreur Gemini HTTP ${result.status}. ` +
          "Consulte les logs Netlify pour le détail."
      }, 502);
    }

    console.error("Gemini final error:", lastError);

    return json({
      error:
        "Aucun modèle Gemini essayé n'a répondu. " +
        "Consulte les logs Netlify pour le détail."
    }, 502);

  } catch (error) {
    console.error(
      "Gemini function error:",
      error?.message || error
    );

    return json({
      error:
        error?.name === "AbortError"
          ? "Gemini met trop de temps à répondre."
          : "Erreur de connexion au service Gemini."
    }, 502);

  } finally {
    clearTimeout(timeout);
  }
}

export const config = {
  path: "/api/chat"
};
