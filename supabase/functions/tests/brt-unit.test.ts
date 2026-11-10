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

Deno.test("janela de envio: 08h às 21h de Brasília", async () => {
  const { inSendWindow, nextSendWindowStart } = await import("../_shared/brt.ts");
  assertEquals(inSendWindow(new Date("2026-11-10T10:59:00Z")), false); // 07:59 em Brasília
  assertEquals(inSendWindow(new Date("2026-11-10T11:00:00Z")), true);  // 08:00
  assertEquals(inSendWindow(new Date("2026-11-11T00:00:00Z")), false); // 21:00 BRT ja fechou
  assertEquals(inSendWindow(new Date("2026-11-10T23:59:00Z")), true);  // 20:59 BRT
  assertEquals(nextSendWindowStart(new Date("2026-11-10T05:00:00Z")).toISOString(), "2026-11-10T11:00:00.000Z"); // 02:00 -> hoje 08:00
  assertEquals(nextSendWindowStart(new Date("2026-11-11T00:30:00Z")).toISOString(), "2026-11-11T11:00:00.000Z"); // 21:30 -> amanha 08:00
});
