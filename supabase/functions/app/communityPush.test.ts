import { expect, it } from "vitest";
import { communityPushPlan, communityPushUrl, LIKE_TITLE } from "./communityPush.ts";

const now = Date.parse("2026-11-07T12:00:00Z");
const ago = (min: number) => new Date(now - min * 60_000).toISOString();

it("respostas saem logo", () => {
  expect(communityPushPlan({ title: "Nova resposta à sua publicação", created_at: ago(0) }, { now, notify: true })).toBe("push");
  expect(communityPushPlan({ title: "A sua publicação tem uma resposta oficial", created_at: ago(1) }, { now, notify: true })).toBe("push");
});

it("gostos esperam 30 minutos para agrupar", () => {
  expect(communityPushPlan({ title: LIKE_TITLE, created_at: ago(5) }, { now, notify: true })).toBe("wait");
  expect(communityPushPlan({ title: LIKE_TITLE, created_at: ago(31) }, { now, notify: true })).toBe("push");
});

it("lido no site ou avisos desligados: sem push", () => {
  expect(communityPushPlan({ title: "Nova resposta à sua publicação", created_at: ago(0), read_at: ago(0) }, { now, notify: true })).toBe("skip");
  expect(communityPushPlan({ title: LIKE_TITLE, created_at: ago(40) }, { now, notify: false })).toBe("skip");
});

it("o link do push fica no site", () => {
  expect(communityPushUrl("/comunidade/p/abc123")).toBe("/comunidade/p/abc123");
  expect(communityPushUrl("https://mau.example/x")).toBe("/comunidade");
  expect(communityPushUrl("//mau.example")).toBe("/comunidade");
  expect(communityPushUrl(null)).toBe("/comunidade");
});
