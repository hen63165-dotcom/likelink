import { Composition } from "remotion";
import { ClipEarbuds, TOTAL_SECONDS } from "./ClipEarbuds";
import { STUDIO_SECONDS, StudioSteps } from "./StudioSteps";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ClipEarbuds"
        component={ClipEarbuds}
        durationInFrames={Math.round(TOTAL_SECONDS * 30)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="StudioSteps"
        component={StudioSteps}
        durationInFrames={Math.round(STUDIO_SECONDS * 30)}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
