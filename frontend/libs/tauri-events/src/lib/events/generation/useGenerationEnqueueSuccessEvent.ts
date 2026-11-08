import { useEffect } from "react";
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { SoundManager } from "@storyteller/soundboard";
import { GenerationAction, GenerationModel, GenerationServiceProvider } from "./common";
import { BasicEventWrapper } from "../../common/BasicEventWrapper";

type GenerationEnqueueSuccessEvent = {
  action: GenerationAction,
  service: GenerationServiceProvider,
  model?: GenerationModel | string,
}; 

export const useGenerationEnqueueSuccessEvent = () => {
  useEffect(() => {
    let isUnmounted = false;
    let unlisten: Promise<UnlistenFn>;

    const setup = async () => {
      unlisten = listen<BasicEventWrapper<GenerationEnqueueSuccessEvent>>('generation-enqueue-success-event', async (event) => {
        console.log("Generation enqueue success event received:", event);
        await SoundManager.playEnqueueSuccess();
      });

      if (isUnmounted) {
        unlisten.then(f => f()); // Unsubscribe if unmounted early.
      }
    };

    setup();
    
    return () => {
      isUnmounted = true;
      unlisten.then(f => f());
    };

  }, []);
}
