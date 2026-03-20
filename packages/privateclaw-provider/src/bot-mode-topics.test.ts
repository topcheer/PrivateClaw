import assert from "node:assert/strict";
import test from "node:test";
import {
  BOT_MODE_IDLE_TOPICS,
  pickBotModeIdleTopic,
  type BotModeIdleTopic,
} from "./bot-mode-topics.js";

test("bot mode idle topic bank exports 200 unique topics", () => {
  assert.equal(BOT_MODE_IDLE_TOPICS.length, 200);
  assert.equal(
    new Set(BOT_MODE_IDLE_TOPICS.map((topic) => topic.id)).size,
    BOT_MODE_IDLE_TOPICS.length,
  );
  assert.equal(
    new Set(BOT_MODE_IDLE_TOPICS.map((topic) => topic.title)).size,
    BOT_MODE_IDLE_TOPICS.length,
  );
});

test("bot mode idle topic picker avoids immediately repeating the previous topic", () => {
  const topics: ReadonlyArray<BotModeIdleTopic> = [
    { id: "topic-a", title: "Topic A", prompt: "Prompt A" },
    { id: "topic-b", title: "Topic B", prompt: "Prompt B" },
    { id: "topic-c", title: "Topic C", prompt: "Prompt C" },
  ];

  const picked = pickBotModeIdleTopic(topics, "topic-b", 0.5);
  assert.notEqual(picked.id, "topic-b");
});

test("bot mode idle topic picker still works with a single topic", () => {
  const topics: ReadonlyArray<BotModeIdleTopic> = [
    { id: "only-topic", title: "Only Topic", prompt: "Only Prompt" },
  ];

  const picked = pickBotModeIdleTopic(topics, "only-topic", 0.3);
  assert.equal(picked.id, "only-topic");
});
