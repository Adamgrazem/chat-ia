export default async (request) => {
  const json = (body, status = 200) => new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  if (request.method !== 'POST') return json({error:'Méthode non autorisée.'},405);
  const key = process.env.GEMINI_API_KEY;
  if (!key) return json({error:'Clé GEMINI_API_KEY non configurée sur Netlify.'},503);
  try {
    const body = await request.json();
    if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 30) return json({error:'Conversation invalide.'},400);
    const messages = body.messages.map(m=>({role:m.role==='user'?'user':m.role==='ai'?'model':'invalid',parts:[{text:typeof m.text==='string'?m.text.slice(0,4000):''}]}));
    if(messages.some(m=>m.role==='invalid'||!m.parts[0].text) || messages.at(-1).role!=='user') return json({error:'Messages invalides.'},400);
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(),25000);
    let upstream;
    try {
      upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',{
        method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},
        body:JSON.stringify({systemInstruction:{parts:[{text:'Tu es Chat IA, un assistant utile, clair, chaleureux et honnête. Réponds principalement en français.'}]},contents:messages,generationConfig:{maxOutputTokens:1200}}),signal:controller.signal
      });
    } finally {clearTimeout(timeout)}
    if (!upstream.ok) {
      console.error('Gemini upstream status',upstream.status);
      return json({error:upstream.status===429?'Quota gratuit Gemini atteint : réessaie plus tard.':upstream.status===403||upstream.status===401?'Clé Gemini refusée : vérifie sa configuration.':'Le service Gemini est momentanément indisponible.'},upstream.status===429?429:502);
    }
    const data=await upstream.json();
    const reply=data.candidates?.[0]?.content?.parts?.filter(p=>typeof p.text==='string').map(p=>p.text).join('\n');
    if(!reply?.trim())return json({error:'Gemini n’a pas généré de réponse. Réessaie avec une autre question.'},502);
    return json({reply});
  }catch(err){console.error('Gemini function:',err?.name||'Error');return json({error:err?.name==='AbortError'?'Gemini met trop de temps à répondre.':'Impossible de traiter la demande.'},502)}
};
export const config = {path:'/api/chat'};
