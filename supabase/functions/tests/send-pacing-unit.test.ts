import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { paceQuota, runsLeftToday } from "../_shared/send-pacing.ts";

const at = (h: number) => new Date(`2026-11-10T${String(h).padStart(2, "0")}:05:00-03:00`);

Deno.test("execucoes restantes na janela 08h-21h", () => {
  assertEquals(runsLeftToday(at(8)), 13);
  assertEquals(runsLeftToday(at(14)), 7);
  assertEquals(runsLeftToday(at(20)), 1);
});
Deno.test("cota divide o que falta pelas execucoes que restam", () => {
  assertEquals(paceQuota(20, at(14)), 3);
  assertEquals(paceQuota(10, at(8)), 1);
  assertEquals(paceQuota(10, at(20)), 10);
  assertEquals(paceQuota(0, at(14)), 0);
  assertEquals(paceQuota(1, at(20)), 1);
});
