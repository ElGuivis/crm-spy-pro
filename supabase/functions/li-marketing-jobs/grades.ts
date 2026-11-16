import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { liFetch } from "../_shared/li-marketing.ts";

type Supabase = ReturnType<typeof createClient>;
interface LiVariation { id: number; nome: string | null }
interface LiGrade { id: number; nome: string | null; nome_visivel: string | null }

const PAGE = 100; // a API não devolve mais que 100 por página
/** até quantos ids faltando numa grade vale buscar um a um em vez de listar a grade inteira */
const ONE_BY_ONE_MAX = 5;

async function getJson<T>(auth: string, path: string): Promise<T> {
  const res = await liFetch(auth, path);
  if (!res.ok) throw new Error(`Loja Integrada respondeu ${res.status} em ${path.split("?")[0]}`);
  return await res.json() as T;
}

/**
 * Nomes das variações de grade (Tamanho/Cor/Gênero) que os produtos usam e ainda não estão em li_grade_variations.
 * O catálogo WhatsApp usa isso para dar nome às variações que a loja devolve como "Sem nome".
 */
export async function runGrades(supabase: Supabase, integ: { id: string; tenant_id: string }, auth: string) {
  const { data: missing, error } = await supabase.rpc("get_missing_li_grade_variations", { p_integration_id: integ.id });
  if (error) throw error;
  const rows = (missing ?? []) as { grade_id: number; variation_id: number }[];
  if (!rows.length) return { integration: integ.id, missing: 0, saved: 0 };

  const grades = await getJson<{ objects: LiGrade[] }>(auth, "/v1/grades?limit=50");
  const gradeName = new Map(grades.objects.map((g) => [Number(g.id), (g.nome_visivel || g.nome || "Variação").trim()]));

  const byGrade = new Map<number, Set<number>>();
  for (const r of rows) {
    if (!byGrade.has(Number(r.grade_id))) byGrade.set(Number(r.grade_id), new Set());
    byGrade.get(Number(r.grade_id))!.add(Number(r.variation_id));
  }

  const found: Record<string, unknown>[] = [];
  for (const [gradeId, ids] of byGrade) {
    const keep = (v: LiVariation) => {
      if (!ids.has(Number(v.id)) || !v.nome) return;
      ids.delete(Number(v.id));
      found.push({
        integration_id: integ.id, tenant_id: integ.tenant_id, variation_id: Number(v.id), grade_id: gradeId,
        grade_name: gradeName.get(gradeId) ?? "Variação", name: v.nome.trim(), updated_at: new Date().toISOString(),
      });
    };
    if (ids.size <= ONE_BY_ONE_MAX) {
      for (const id of [...ids]) {
        const res = await liFetch(auth, `/v1/grade/${gradeId}/variacao/${id}`);
        if (res.ok) keep(await res.json() as LiVariation);
      }
      continue;
    }
    for (let offset = 0; ids.size > 0; offset += PAGE) {
      const page = await getJson<{ meta: { total_count: number }; objects: LiVariation[] }>(auth, `/v1/grade/${gradeId}/variacao?limit=${PAGE}&offset=${offset}`);
      page.objects.forEach(keep);
      if (page.objects.length < PAGE || offset + PAGE >= page.meta.total_count) break;
    }
  }

  for (let i = 0; i < found.length; i += 200) {
    const { error: upErr } = await supabase.from("li_grade_variations").upsert(found.slice(i, i + 200), { onConflict: "integration_id,variation_id" });
    if (upErr) throw upErr;
  }
  return { integration: integ.id, missing: rows.length, saved: found.length };
}
