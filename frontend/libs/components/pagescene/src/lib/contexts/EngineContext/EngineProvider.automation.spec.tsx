import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];
const instances: unknown[] = [];

vi.mock("../../engine/editor", () => ({
  default: class FakeEditor {
    constructor() {
      instances.push(this);
    }
    initialize = vi.fn();
    isEngineDataLoaded = () => false;
    unmountEngine = vi.fn(() => order.push("unmountEngine"));
  },
}));

vi.mock("../../sceneMetadata", () => ({ getSceneGenerationMetaData: vi.fn() }));

const uninstall = vi.fn(() => order.push("uninstallAutomation"));
const installStageAutomation = vi.fn((_editor: unknown) => {
  order.push("install");
  return uninstall;
});
vi.mock("../../automation/stageAutomation", () => ({
  installStageAutomation: (e: unknown) => installStageAutomation(e),
}));

import { EngineProvider } from "./EngineProvider";
import { getActiveEditor } from "./EngineContext";
import { usePageSceneStore } from "../../PageSceneStore";
import type { PageSceneAdapter } from "../../adapter";

function setNodes(on: boolean) {
  act(() => {
    usePageSceneStore.setState({
      sceneContainerEl: on ? document.createElement("div") : null,
      editorCanvasEl: on ? document.createElement("canvas") : null,
      camViewCanvasEl: on ? document.createElement("canvas") : null,
    });
  });
}

afterEach(() => {
  order.length = 0;
  instances.length = 0;
  vi.clearAllMocks();
  setNodes(false);
});

describe("EngineProvider stage automation wiring", () => {
  it("does not install before the canvases exist", () => {
    render(
      <EngineProvider adapter={{} as PageSceneAdapter}>
        <div />
      </EngineProvider>,
    );
    expect(installStageAutomation).not.toHaveBeenCalled();
  });

  it("installs with the created Editor after it becomes active, and removes it before unmountEngine", () => {
    setNodes(true);
    const { unmount } = render(
      <EngineProvider adapter={{} as PageSceneAdapter}>
        <div />
      </EngineProvider>,
    );
    expect(instances).toHaveLength(1);
    expect(installStageAutomation).toHaveBeenCalledTimes(1);
    expect(installStageAutomation).toHaveBeenCalledWith(instances[0]);
    expect(getActiveEditor()).toBe(instances[0]);

    unmount();
    expect(uninstall).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["install", "uninstallAutomation", "unmountEngine"]);
  });

  it("re-installs for a new Editor when the scene token changes", () => {
    setNodes(true);
    const { rerender, unmount } = render(
      <EngineProvider adapter={{} as PageSceneAdapter} sceneToken="a">
        <div />
      </EngineProvider>,
    );
    rerender(
      <EngineProvider adapter={{} as PageSceneAdapter} sceneToken="b">
        <div />
      </EngineProvider>,
    );
    expect(instances).toHaveLength(2);
    expect(installStageAutomation.mock.calls.map((c) => c[0])).toEqual(instances);
    expect(uninstall).toHaveBeenCalledTimes(1);
    unmount();
    expect(uninstall).toHaveBeenCalledTimes(2);
  });

  it("removes the hook when the canvases unmount", () => {
    setNodes(true);
    render(
      <EngineProvider adapter={{} as PageSceneAdapter}>
        <div />
      </EngineProvider>,
    );
    setNodes(false);
    expect(uninstall).toHaveBeenCalledTimes(1);
    expect(order.slice(-2)).toEqual(["uninstallAutomation", "unmountEngine"]);
  });
});
