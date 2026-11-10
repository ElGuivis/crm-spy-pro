import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { birthMonthDay, brtDate, brtDateAfter, brtDayStartIso, brtHHMM, brtParts } from "../_shared/brt.ts";

Deno.test("brtDate: 23:30 em Brasília ainda é o mesmo dia (02:30Z do dia seguinte)", () => {
  assertEquals(brtDate(new Date("2026-11-11T02:30:00Z")), "2026-11-10");
});
Deno.test("brtDate: 00:10 em Brasília já é o dia novo", () => {
  assertEquals(brtDate(new Date("2026-11-10T03:10:00Z")), "2026-11-10");
  assertEquals(brtDate(new Date("2026-11-10T02:59:00Z")), "2026-11-09");
});
Deno.test("brtParts: hora e dia da semana de Brasília", () => {
  const p = brtParts(new Date("2026-11-10T15:45:00Z")); // terça 12:45
  assertEquals([p.hour, p.minute, p.weekday, p.day, p.month], [12, 45, 2, 10, 11]);
  assertEquals(brtHHMM(new Date("2026-11-10T02:05:00Z")), "23:05");
});
Deno.test("brtDateAfter: soma dias no calendário de Brasília", () => {
  assertEquals(brtDateAfter(7, new Date("2026-11-11T01:00:00Z")), "2026-11-17");
  assertEquals(brtDateAfter(-3, new Date("2026-11-11T01:00:00Z")), "2026-11-07");
});
Deno.test("brtDayStartIso: meia-noite de Brasília = 03:00Z", () => {
  assertEquals(brtDayStartIso(new Date("2026-11-10T20:00:00Z")), "2026-11-10T03:00:00.000Z");
  assertEquals(brtDayStartIso(new Date("2026-11-11T01:00:00Z")), "2026-11-10T03:00:00.000Z");
});
Deno.test("birthMonthDay: lê o dia sem converter fuso", () => {
  assertEquals(birthMonthDay("1990-05-12"), { month: 5, day: 12 });
  assertEquals(birthMonthDay("1990-05-12T00:00:00Z"), { month: 5, day: 12 });
  assertEquals(birthMonthDay(null), null);
  assertEquals(birthMonthDay("12/05/1990"), null);
});
