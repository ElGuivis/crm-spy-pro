import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { publicCorsHeaders as corsHeaders } from "../_shared/cors.ts";

const RATING_PAGE = () => `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Avalie nosso atendimento</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9fafb;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1rem}
    .card{background:#fff;border-radius:16px;padding:2rem;max-width:380px;width:100%;box-shadow:0 4px 24px rgba(0,0,0,.08);text-align:center}
    h1{font-size:1.25rem;font-weight:700;color:#111;margin-bottom:.5rem}
    p{color:#6b7280;font-size:.9rem;margin-bottom:1.5rem}
    .stars{display:flex;justify-content:center;gap:.75rem;margin-bottom:1rem}
    .star{font-size:2.5rem;cursor:pointer;transition:transform .1s;user-select:none}
    .star:hover,.star:focus{transform:scale(1.2);outline:none}
    .label{font-size:.8rem;color:#6b7280;min-height:1.2em;margin-bottom:1rem}
    .btn{display:none;background:#111;color:#fff;border:none;border-radius:8px;padding:.75rem 2rem;font-size:1rem;cursor:pointer;width:100%}
    .btn:hover{background:#333}
    .btn.visible{display:block}
  </style>
</head>
<body>
<div class="card">
  <h1>Como foi seu atendimento?</h1>
  <p>Sua opinião nos ajuda a melhorar!</p>
  <div class="stars" id="stars">
    <span class="star" data-v="1" tabindex="0" role="button" aria-label="1 estrela">⭐</span>
    <span class="star" data-v="2" tabindex="0" role="button" aria-label="2 estrelas">⭐</span>
    <span class="star" data-v="3" tabindex="0" role="button" aria-label="3 estrelas">⭐</span>
    <span class="star" data-v="4" tabindex="0" role="button" aria-label="4 estrelas">⭐</span>
    <span class="star" data-v="5" tabindex="0" role="button" aria-label="5 estrelas">⭐</span>
  </div>
  <div class="label" id="lbl"></div>
  <button class="btn" id="btn">Enviar avaliação</button>
</div>
<script>
  const labels=["","Péssimo","Ruim","Regular","Bom","Ótimo"];
  let sel=0;
  const stars=document.querySelectorAll('.star');
  const lbl=document.getElementById('lbl');
  const btn=document.getElementById('btn');
  function highlight(n){stars.forEach((s,i)=>{s.style.opacity=i<n?'1':'.3';});}
  function pick(n){sel=n;highlight(n);lbl.textContent=labels[n]||'';btn.classList.toggle('visible',n>0);}
  stars.forEach(s=>{
    s.addEventListener('click',()=>pick(+s.dataset.v));
    s.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')pick(+s.dataset.v);});
    s.addEventListener('mouseover',()=>highlight(+s.dataset.v));
    s.addEventListener('mouseleave',()=>highlight(sel));
  });
  btn.addEventListener('click',async()=>{
    if(!sel)return;
    btn.disabled=true;btn.textContent='Enviando...';
    const r=await fetch(location.href+'&score='+sel,{method:'POST'});
    if(r.ok){document.querySelector('.card').innerHTML='<div style="padding:1rem"><div style="font-size:3rem;margin-bottom:1rem">'+'⭐'.repeat(sel)+'</div><h1 style="font-size:1.25rem;font-weight:700">Obrigado!</h1><p style="color:#6b7280;margin-top:.5rem">Sua avaliação foi registrada.</p></div>';}
    else{btn.disabled=false;btn.textContent='Enviar avaliação';alert('Erro ao enviar. Tente novamente.');}
  });
  highlight(0);
</script>
</body>
</html>`;

// PUBLIC — no auth. Customer opens link, picks stars, score is stored.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const params = new URL(req.url).searchParams;
    const token = params.get("token");
    const scoreStr = params.get("score");

    if (!token) {
      return new Response(JSON.stringify({ success: false, error: "token é obrigatório" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // No score → serve the rating page
    if (!scoreStr) {
      return new Response(RATING_PAGE(), {
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      });
    }

    const score = parseInt(scoreStr, 10);
    if (isNaN(score) || score < 1 || score > 5) {
      return new Response(JSON.stringify({ success: false, error: "score deve ser entre 1 e 5" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: conv, error: findErr } = await supabase
      .from("conversations")
      .select("id, csat_score")
      .eq("csat_token", token)
      .maybeSingle();

    if (findErr || !conv) {
      return new Response(JSON.stringify({ success: false, error: "Link inválido ou expirado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (conv.csat_score !== null) {
      return new Response(JSON.stringify({ success: true, already_submitted: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("conversations")
      .update({ csat_score: score, csat_submitted_at: new Date().toISOString() })
      .eq("csat_token", token);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
