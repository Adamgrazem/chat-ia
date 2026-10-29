
const MODEL = "gemini-3.1-flash-lite";
const API = "https://generativelanguage.googleapis.com/v1beta";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return json({ error: "Méthode non autorisée." }, 405);
  }

  const key = process.env.GEMINI_API_KEY;

  if (!key) {
    return json({
      error: "Clé Gemini absente dans Netlify."
    }, 503);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Requête invalide." }, 400);
  }

  if (
    !Array.isArray(body.messages) ||
    body.messages.length < 1 ||
    body.messages.length > 30
  ) {
    return json({ error: "Conversation invalide." }, 400);
  }

  const contents = body.messages.map(message => ({
    role: message.role === "user"
      ? "user"
      : message.role === "ai"
      ? "model"
      : "invalid",
    parts: [{
      text: typeof message.text === "string"
        ? message.text.slice(0, 4000)
        : ""
    }]
  }));

  if (
    contents.some(message =>
      message.role === "invalid" ||
      !message.parts[0].text.trim()
    ) ||
    contents[contents.length - 1].role !== "user"
  ) {
    return json({ error: "Messages invalides." }, 400);
  }

  try {
    const response = await fetch(
      `${API}/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": key
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text:
                "Tu es Chat IA, un assistant intelligent, " +
                "utile et chaleureux. Réponds en français."
            }]
          },
          contents,
          generationConfig: {
            maxOutputTokens: 2048
          }
        }),
        signal: AbortSignal.timeout(45000)
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const detail = data.error?.message || "Erreur inconnue";

      console.error(
        "Gemini",
        MODEL,
        "HTTP",
        response.status,
        detail.slice(0, 500)
      );

      if (response.status === 429) {
        return json({
          error:
            "Quota Gemini atteint. Vérifie ton offre " +
            "gratuite dans Google AI Studio."
        }, 429);
      }

      if (
        response.status === 401 ||
        response.status === 403
      ) {
        return json({
          error: "Clé Gemini refusée ou accès non autorisé."
        }, 502);
      }

      if (response.status === 404) {
        return json({
          error:
            "Ce modèle Gemini n'est pas accessible " +
            "avec ton projet Google."
        }, 502);
      }

      return json({
        error:
          `Erreur Gemini HTTP ${response.status}. ` +
          "Consulte les logs Netlify."
      }, 502);
    }

    const reply = data.candidates?.[0]?.content?.parts
      ?.filter(part => typeof part.text === "string")
      .map(part => part.text)
      .join("\n")
      .trim();

    if (!reply) {
      return json({
        error: "Gemini n'a pas généré de réponse."
      }, 502);
    }

    return json({ reply });

  } catch (error) {
    console.error("Gemini error:", error?.message);

    return json({
      error:
        error?.name === "TimeoutError"
          ? "Gemini met trop de temps à répondre."
          : "Erreur de connexion à Gemini."
    }, 502);
  }
}

export const config = {
  path: "/api/chat"
};
