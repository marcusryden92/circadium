// Smoke tests for the in-browser BYOK tool-use loop (assistantEngine): the
// Anthropic client is mocked with scripted streams so the tests pin the loop
// mechanics — text dispatch, deterministic-op execution with fromOps forest
// events, tool_results fed back into the next turn, and the done callback —
// without touching the network.

import type { DraftNode } from "@/utils/draft/plannerTreeToJson";
import type { DraftForest } from "@/utils/draft/plannerForestToJson";
import { runAssistantTurn } from "@/utils/draft/assistantEngine";
import { createBrowserAnthropicClient } from "@/utils/draft/assistantEngine/anthropicClient";

// Relative specifier on purpose: @/ imports are rewritten by the SWC
// transform, but jest.mock's string literal is not, so the alias doesn't
// resolve here.
jest.mock("../../utils/draft/assistantEngine/anthropicClient", () => ({
  createBrowserAnthropicClient: jest.fn(),
}));

const mockCreateClient = createBrowserAnthropicClient as jest.Mock;

interface ScriptedTurn {
  events: unknown[];
  finalMessage: { stop_reason: string; content: unknown[] };
}

function installScript(turns: ScriptedTurn[]): jest.Mock {
  const stream = jest.fn();
  turns.forEach((turn) => {
    stream.mockImplementationOnce(() => ({
      async *[Symbol.asyncIterator]() {
        for (const event of turn.events) {
          await Promise.resolve();
          yield event;
        }
      },
      finalMessage: () => Promise.resolve(turn.finalMessage),
    }));
  });
  mockCreateClient.mockReturnValue({ messages: { stream } });
  return stream;
}

function node(overrides: Partial<DraftNode> & { id: string }): DraftNode {
  return {
    title: overrides.id,
    plannerType: "task",
    duration: 30,
    deadline: null,
    priority: 4,
    isReady: null,
    categoryId: null,
    children: [],
    ...overrides,
  };
}

function makeForest(): DraftForest {
  return {
    goals: [
      node({
        id: "goal-a",
        title: "Learn Spanish",
        plannerType: "goal",
        deadline: "2026-12-01",
        children: [node({ id: "a1", title: "Install Anki" })],
      }),
    ],
  };
}

function baseArgs(forest: DraftForest) {
  return {
    currentForest: forest,
    currentTemplates: [],
    currentPrecedence: { queues: [], dependencies: [] },
    currentHabits: { buckets: [], habits: [] },
    recurringPlanIds: [],
    history: [{ role: "user" as const, content: "hello" }],
    focus: null,
    categories: [],
    locations: [],
    today: "2026-07-17",
    intent: null,
    apiKey: "sk-ant-test",
  };
}

function collectCallbacks() {
  return {
    onText: jest.fn(),
    onForest: jest.fn(),
    onTemplates: jest.fn(),
    onWindows: jest.fn(),
    onPrecedence: jest.fn(),
    onHabits: jest.fn(),
    onShow: jest.fn(),
    onStatus: jest.fn(),
    onDone: jest.fn(),
    onError: jest.fn(),
  };
}

const textDelta = (text: string) => ({
  type: "content_block_delta",
  delta: { type: "text_delta", text },
});

beforeEach(() => {
  mockCreateClient.mockReset();
});

describe("runAssistantTurn", () => {
  it("streams text and finishes with onDone on a plain end_turn", async () => {
    installScript([
      {
        events: [textDelta("Hello "), textDelta("there.")],
        finalMessage: { stop_reason: "end_turn", content: [] },
      },
    ]);
    const callbacks = collectCallbacks();
    await runAssistantTurn({ ...baseArgs(makeForest()), ...callbacks });

    expect(
      (callbacks.onText.mock.calls as [string][]).map((c) => c[0]).join(""),
    ).toBe("Hello there.");
    expect(callbacks.onDone).toHaveBeenCalledWith("end_turn");
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(mockCreateClient).toHaveBeenCalledWith("sk-ant-test", undefined);
  });

  it("executes update_items, emits a fromOps forest event, and feeds the tool_result back", async () => {
    const stream = installScript([
      {
        events: [
          {
            type: "content_block_start",
            content_block: { type: "tool_use", id: "tu_1", name: "update_items" },
          },
        ],
        finalMessage: {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tu_1",
              name: "update_items",
              input: { updates: [{ id: "a1", duration: 90 }] },
            },
          ],
        },
      },
      {
        events: [textDelta("Updated it.")],
        finalMessage: { stop_reason: "end_turn", content: [] },
      },
    ]);
    const callbacks = collectCallbacks();
    await runAssistantTurn({ ...baseArgs(makeForest()), ...callbacks });

    // The op's result reaches the caller as a complete (fromOps) forest event
    // carrying the updated root.
    expect(callbacks.onForest).toHaveBeenCalledTimes(1);
    const payload = (callbacks.onForest.mock.calls as [unknown][])[0][0] as {
      complete: boolean;
      proposal: { goals: DraftNode[] };
    };
    expect(payload.complete).toBe(true);
    expect(payload.proposal.goals[0].id).toBe("goal-a");
    expect(payload.proposal.goals[0].children[0].duration).toBe(90);

    // The second Anthropic turn receives the tool_result for tu_1.
    expect(stream).toHaveBeenCalledTimes(2);
    const secondCallMessages = (
      (stream.mock.calls as [unknown][])[1][0] as {
        messages: { role: string; content: unknown }[];
      }
    ).messages;
    const lastMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(lastMessage.role).toBe("user");
    expect(lastMessage.content).toEqual([
      expect.objectContaining({ type: "tool_result", tool_use_id: "tu_1" }),
    ]);

    expect(callbacks.onStatus).toHaveBeenCalledWith({
      tool: "update_items",
      count: 1,
    });
    expect(callbacks.onDone).toHaveBeenCalledWith("end_turn");
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it("rejects a propose_goals tree for an unfetched existing goal", async () => {
    const stream = installScript([
      {
        events: [],
        finalMessage: {
          stop_reason: "tool_use",
          content: [
            {
              type: "tool_use",
              id: "tu_2",
              name: "propose_goals",
              input: {
                goals: [
                  {
                    id: "goal-a",
                    title: "Learn Spanish",
                    plannerType: "goal",
                    duration: 30,
                    children: [],
                  },
                ],
              },
            },
          ],
        },
      },
      {
        events: [],
        finalMessage: { stop_reason: "end_turn", content: [] },
      },
    ]);
    const callbacks = collectCallbacks();
    await runAssistantTurn({ ...baseArgs(makeForest()), ...callbacks });

    const secondCallMessages = (
      (stream.mock.calls as [unknown][])[1][0] as {
        messages: { role: string; content: { content?: string }[] }[];
      }
    ).messages;
    const toolResult =
      secondCallMessages[secondCallMessages.length - 1].content[0];
    expect(toolResult.content).toContain("REJECTED");
    expect(toolResult.content).toContain("goal-a");
    // The blind complete-tree replacement never reaches the caller — the
    // stamped re-emit goes out with the rejected goal filtered away (an
    // empty proposal, which folds as a no-op).
    for (const [payload] of callbacks.onForest.mock.calls as [
      { proposal: { goals: unknown[] } },
    ][]) {
      expect(payload.proposal.goals).toHaveLength(0);
    }
  });
});
