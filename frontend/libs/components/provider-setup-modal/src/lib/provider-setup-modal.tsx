import { Modal } from "@storyteller/ui-modal";
import { ArrowRightIcon, WandSparklesIcon } from "lucide-react";
import { Button } from "@storyteller/ui-button";
import { useState } from "react";
import { useShowProviderLoginModalEvent } from "@storyteller/tauri-events";
import { GenerationProvider } from "@storyteller/common";

interface ProviderSetupModalProps {
}

export function ProviderSetupModal({
}: ProviderSetupModalProps) {
  const [showModal, setShowModal] = useState(false);
  const [provider, setProvider] = useState<GenerationProvider>(GenerationProvider.Artcraft);

  useShowProviderLoginModalEvent(async (event) => {
    console.log("Show provider login modal event received from Tauri:", event);
    setProvider(event.provider);
    setShowModal(true);
  });

  const serviceProviderName = getServiceProviderName(provider);

  const modalTitle = `Set up ${serviceProviderName}`;
  const modalSubTitle = `Add your ${serviceProviderName} account to H0x Video Studio!`;

  const modalDescription = `You can add your ${serviceProviderName} account to H0x Video Studio by simply logging in. Use your credits and account directly within H0x Video Studio. You can add all of your AI accounts to H0x Video Studio to use them all in one place and build the ultimate AI art tool.`;

  const modalButtonText = `Set up ${serviceProviderName}`;

  const buttonOnClick = () => {
    setShowModal(false);
  };

  return (
    <Modal
      //title={modalTitle}
      isOpen={showModal}
      onClose={() => {
        setShowModal(false);
      }}
      className="max-w-xl p-6"
      showClose={true}
    >
      <div className="flex flex-col gap-6 text-base-fg">
        <div className="flex flex-col gap-3">
          <p className="hud-label flex items-center gap-2 text-base-fg/55">
            <WandSparklesIcon aria-hidden className="h-3.5 w-3.5" />
            Connect account
          </p>
          <h1 className="font-display text-3xl font-medium leading-[1.05] tracking-[-0.03em]">
            {modalTitle}
          </h1>
          <p className="text-base font-medium text-base-fg/80">
            {modalSubTitle}
          </p>
          <p className="text-sm leading-relaxed text-base-fg/60">
            {modalDescription}
          </p>
        </div>

        <Button
          className="h-10 px-4"
          icon={ArrowRightIcon}
          iconFlip={true}
          onClick={() => {
            buttonOnClick();
          }}
        >
          {modalButtonText}
        </Button>
      </div>
    </Modal>
  );
}

function getServiceProviderName(provider: GenerationProvider) : string {
  switch (provider) {
    case GenerationProvider.Fal:
      return "Fal";
    case GenerationProvider.Higgsfield:
      return "Higgsfield";
    case GenerationProvider.Krea:
      return "Krea";
    case GenerationProvider.Leonardo:
      return "Leonardo";
    case GenerationProvider.Magnific:
      return "Magnific";
    case GenerationProvider.Openart:
      return "OpenArt";
    case GenerationProvider.Picsart:
      return "Picsart";
    case GenerationProvider.Pixverse:
      return "PixVerse";
    case GenerationProvider.Runway:
      return "Runway";
    case GenerationProvider.Artcraft:
    default:
      return "H0x Video Studio";
  }
}

export default ProviderSetupModal;
