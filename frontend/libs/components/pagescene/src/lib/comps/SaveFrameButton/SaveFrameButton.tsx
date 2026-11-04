import { useContext } from "react";
import { ImageDownIcon } from "lucide-react";
import { Button } from "@storyteller/ui-button";
import { Tooltip } from "@storyteller/ui-tooltip";
import { EngineContext } from "../../contexts/EngineContext";
import { ToastTypes } from "../../enums";
import { TOOLBAR_BUTTON_CLASS_NAME } from "../toolbarStyles";

// Saves the current render-camera frame as a PNG: through the host when it
// implements `saveFrame`, otherwise as a browser download.
export const SaveFrameButton = () => {
  const editor = useContext(EngineContext);

  const handleClick = async () => {
    const snap = editor?.snapShotOfCurrentFrame(false);
    if (!editor || !snap) return;
    const { adapter } = editor;
    if (!adapter.saveFrame) {
      const url = URL.createObjectURL(snap.file);
      const link = document.createElement("a");
      link.download = `${Date.now()}.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    try {
      await adapter.saveFrame(snap.file);
      adapter.showToast(ToastTypes.SUCCESS, "Frame saved");
    } catch (err) {
      console.error("saveFrame failed", err);
      adapter.showToast(ToastTypes.ERROR, "Could not save the frame");
    }
  };

  return (
    <Tooltip content="Save frame as PNG" position="bottom" delay={300}>
      <Button
        type="button"
        variant="secondary"
        icon={ImageDownIcon}
        onClick={handleClick}
        className={TOOLBAR_BUTTON_CLASS_NAME}
      >
        Save frame
      </Button>
    </Tooltip>
  );
};

export default SaveFrameButton;
