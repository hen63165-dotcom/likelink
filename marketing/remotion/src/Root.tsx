import { Composition } from "remotion";
import { ClipEarbuds, TOTAL_SECONDS } from "./ClipEarbuds";
import { STUDIO_SECONDS, StudioSteps } from "./StudioSteps";
import { BUTTERFLY_SECONDS, ButterflyFix } from "./ButterflyFix";
import { BUTTERFLY_UGC_SECONDS, ButterflyUgc } from "./ButterflyUgc";
import { GARLIC, HandsReel, RINGS, totalSeconds } from "./HandsReel";
import { EARRINGS_SELL, GARLIC_SELL, OIL_SELL, SellReel, sellSeconds } from "./SellReel";
import { TalkSlides, talkSeconds } from "./TalkSlides";
import { TALKS as SLIDES } from "./talk/talk-slides-20261115b";
import { TALKS as SOAP } from "./talk/talk-soap-20261115";

const TALK_MISTAKES = SLIDES.mistakes;
const TALK_RADAR = SLIDES["radar-creators"];
const TALK_SOAP = SOAP.soap;

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
      <Composition
        id="ButterflyFix"
        component={ButterflyFix}
        durationInFrames={Math.round(BUTTERFLY_SECONDS * 30)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="ButterflyUgc"
        component={ButterflyUgc}
        durationInFrames={Math.round(BUTTERFLY_UGC_SECONDS * 30)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="GarlicSell"
        component={SellReel}
        defaultProps={GARLIC_SELL}
        durationInFrames={Math.round(sellSeconds(GARLIC_SELL) * 30)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="EarringsSell"
        component={SellReel}
        defaultProps={EARRINGS_SELL}
        durationInFrames={Math.round(sellSeconds(EARRINGS_SELL) * 30)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="OilSell"
        component={SellReel}
        defaultProps={OIL_SELL}
        durationInFrames={Math.round(sellSeconds(OIL_SELL) * 30)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="GarlicHands"
        component={HandsReel}
        defaultProps={GARLIC}
        durationInFrames={Math.round(totalSeconds(GARLIC) * 30)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="RingsHands"
        component={HandsReel}
        defaultProps={RINGS}
        durationInFrames={Math.round(totalSeconds(RINGS) * 30)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="TalkMistakes"
        component={TalkSlides}
        defaultProps={TALK_MISTAKES}
        durationInFrames={Math.round(talkSeconds(TALK_MISTAKES) * 30)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="TalkSoap"
        component={TalkSlides}
        defaultProps={TALK_SOAP}
        durationInFrames={Math.round(talkSeconds(TALK_SOAP) * 30)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="TalkRadar"
        component={TalkSlides}
        defaultProps={TALK_RADAR}
        durationInFrames={Math.round(talkSeconds(TALK_RADAR) * 30)}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
