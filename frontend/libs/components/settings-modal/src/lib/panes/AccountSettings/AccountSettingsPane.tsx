import { ArtcraftAccountBlock } from "./ArtcraftAccountBlock";

interface AccountSettingsPaneProps {
  globalAccountLogoutCallback: () => void;
}

export const AccountSettingsPane = ({
  globalAccountLogoutCallback,
}: AccountSettingsPaneProps) => {
  return (
    <div className="flex flex-col gap-5 pt-3 text-base-fg">
      <ArtcraftAccountBlock
        globalAccountLogoutCallback={globalAccountLogoutCallback}
      />
    </div>
  );
};
