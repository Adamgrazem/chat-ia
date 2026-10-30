
const MODEL = "openai/gpt-oss-120b";
const API = "https://api.groq.com/openai/v1/chat/completions";

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

  const key = process.env.GROQ_API_KEY;

  if (!key) {
    return json({
      error: "Clé Groq absente dans Netlify."
    }, 503);
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return json({ error: "Requête invalide." }, 400);
  }

  if (
    !body ||
    !Array.isArray(body.messages) ||
    body.messages.length < 1 ||
    body.messages.length > 30
  ) {
    return json({ error: "Conversation invalide." }, 400);
  }

  const messages = body.messages.map(message => ({
    role:
      message.role === "user"
        ? "user"
        : message.role === "ai" || message.role === "assistant"
        ? "assistant"
        : "invalid",
    content:
      typeof message.text === "string"
        ? message.text.slice(0, 4000)
        : ""
  }));

  if (
    messages.some(message =>
      message.role === "invalid" ||
      !message.content.trim()
    ) ||
    messages[messages.length - 1].role !== "user"
  ) {
    return json({ error: "Messages invalides." }, 400);
  }

  try {
    const response = await fetch(API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "Tu es Chat IA, un assistant intelligent, " +
              "utile et chaleureux. Réponds en français."
          },
          ...messages
        ],
        max_completion_tokens: 4096,
        reasoning_effort: "low"
      }),
      signal: AbortSignal.timeout(45000)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Groq HTTP",
        response.status,
        data.error?.message || "Erreur inconnue"
      );

      if (response.status === 429) {
        return json({
          error: "Limite gratuite Groq atteinte. Réessaie plus tard."
        }, 429);
      }

      if (response.status === 401 || response.status === 403) {
        return json({
          error: "Clé Groq refusée ou accès non autorisé."
        }, 502);
      }

      return json({
        error: `Erreur Groq HTTP ${response.status}.`
      }, 502);
    }

    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return json({
        error: "Groq n'a pas généré de réponse."
      }, 502);
    }

    return json({ reply });

  } catch (error) {
    console.error("Groq error:", error?.message);

    return json({
      error:
        error?.name === "TimeoutError"
          ? "Groq met trop de temps à répondre."
          : "Erreur de connexion à Groq."
    }, 502);
  }
}

export const config = {
  path: "/api/chat"
};



