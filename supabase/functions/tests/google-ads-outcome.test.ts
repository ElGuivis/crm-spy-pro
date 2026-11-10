import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { accuracyByKind, classifyAction, evaluateOutcome, isMature, sumWindow, windowsFor, type DayRow, type Window } from "../_shared/google-ads-outcome-core.ts";

const W = (cost: number, value: number, clicks = 100): Window => ({ cost, value, clicks, conversions: 1, days: 7, roas: cost > 0 ? Math.round((value / cost) * 100) / 100 : null });

Deno.test("janelas: antes = 7 dias anteriores; depois = horizonte seguinte; o dia da mudanca fica fora", () => {
  const w = windowsFor(new Date("2026-11-10T15:00:00Z"), 7);
  assertEquals(w, { beforeFrom: "2026-11-03", beforeTo: "2026-11-09", afterFrom: "2026-11-11", afterTo: "2026-11-17" });
  assertEquals(windowsFor(new Date("2026-11-10T01:00:00Z"), 14).afterTo, "2026-11-24");
});

Deno.test("maturidade: so avalia quando a janela depois ja fechou ha 2 dias", () => {
  const applied = new Date("2026-11-10T12:00:00Z");
  assert(!isMature(applied, 7, new Date("2026-11-18T12:00:00Z")));
  assert(isMature(applied, 7, new Date("2026-11-19T12:00:00Z")));
});

Deno.test("sumWindow: soma por periodo e campanha, calcula ROAS e conta dias com gasto", () => {
  const rows: DayRow[] = [
    { campaign_id: 1, date: "2026-11-11", cost_micros: 10e6, clicks: 5, conversions: 1, conversions_value: 60 },
    { campaign_id: 1, date: "2026-11-12", cost_micros: 0, clicks: 0, conversions: 0, conversions_value: 0 },
    { campaign_id: 2, date: "2026-11-11", cost_micros: 99e6, clicks: 9, conversions: 9, conversions_value: 999 },
    { campaign_id: 1, date: "2026-12-01", cost_micros: 50e6, clicks: 1, conversions: 0, conversions_value: 0 },
  ];
  const w = sumWindow(rows, "2026-11-11", "2026-11-17", 1);
  assertEquals([w.cost, w.value, w.clicks, w.days, w.roas], [10, 60, 5, 1, 6]);
  assertEquals(sumWindow(rows, "2026-11-11", "2026-11-17").cost, 109);
});

Deno.test("classifica as entidades do registro de auditoria", () => {
  assertEquals(classifyAction("campaign:9", { status: "ENABLED" }, { status: "PAUSED" }), { kind: "pause", campaignId: 9 });
  assertEquals(classifyAction("campaign:9", { status: "PAUSED" }, { status: "ENABLED" }), { kind: "enable", campaignId: 9 });
  assertEquals(classifyAction("campaign:9", { status: "ENABLED", daily_budget_micros: 1 }, { status: "ENABLED", daily_budget_micros: 2 }), { kind: "budget", campaignId: 9 });
  assertEquals(classifyAction("negatives:5", null, null), { kind: "negatives", campaignId: 5 });
  assertEquals(classifyAction("goal:BEGIN_CHECKOUT~WEBSITE", null, null), { kind: "goal", campaignId: null });
  assertEquals(classifyAction("mode", null, null), null);
});

Deno.test("veredito: compara o ROAS antes x depois; amostra pequena e insuficiente; pausa e esperada", () => {
  assertEquals(evaluateOutcome("budget", W(100, 400), W(120, 600), 4).verdict, "improved"); // 4,0 -> 5,0
  assertEquals(evaluateOutcome("budget", W(100, 400), W(120, 480), 4).verdict, "neutral");  // 4,0 -> 4,0
  assertEquals(evaluateOutcome("budget", W(100, 400), W(120, 360), 4).verdict, "worsened"); // 4,0 -> 3,0
  assertEquals(evaluateOutcome("negatives", W(100, 400), W(10, 60, 5), 4).verdict, "insufficient");
  assertEquals(evaluateOutcome("pause", W(100, 400), W(0, 0, 0), 4).verdict, "expected");
});

Deno.test("sem base de comparacao antes: usa o ROAS minimo", () => {
  assertEquals(evaluateOutcome("enable", W(0, 0, 0), W(100, 450), 4).verdict, "improved");
  assertEquals(evaluateOutcome("enable", W(0, 0, 0), W(100, 350), 4).verdict, "neutral");
  assertEquals(evaluateOutcome("enable", W(5, 0, 2), W(100, 200), 4).verdict, "worsened");
});

Deno.test("taxa de acerto por tipo ignora insuficiente e esperado", () => {
  const acc = accuracyByKind([
    { action_kind: "budget", verdict: "improved" }, { action_kind: "budget", verdict: "neutral" }, { action_kind: "budget", verdict: "worsened" },
    { action_kind: "budget", verdict: "insufficient" }, { action_kind: "pause", verdict: "expected" }, { action_kind: "negatives", verdict: "improved" },
  ]);
  const budget = acc.find((a) => a.kind === "budget")!;
  assertEquals([budget.measured, budget.hit_rate], [3, 67]);
  assert(!acc.some((a) => a.kind === "pause"));
  assertEquals(acc.find((a) => a.kind === "negatives")!.hit_rate, 100);
});
