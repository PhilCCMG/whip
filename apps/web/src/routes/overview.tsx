import { useCampaignState } from '../api/hooks';
import { Briefing } from '../features/office/briefing';
import { CharacterSheet } from '../features/office/character-sheet';
import { Inbox, Whispers } from '../features/office/desk-notes';
import { Diary } from '../features/office/diary';
import { Dispatches } from '../features/office/dispatches';
import { GameScreenHeader } from '../game-ui/game-screen';
import { useCampaignId } from '../lib/params';

/**
 * OFFICE: the Member's desk. The week's diary is the centrepiece; dispatches that need an answer
 * sit to its right; the morning paper below; the character sheet, whispers and inbox down the side.
 */
export function Component() {
  const id = useCampaignId();
  const { data } = useCampaignState(id);
  if (!data) return null;
  return (
    <div className="flex min-h-full flex-col">
      <GameScreenHeader
        title="Office"
        kicker={`${data.player.name} · Member for ${data.player.constituencyName}`}
        crop="58% 38%"
      />
      {/*
        One column on narrow screens, in reading order: diary, dispatches, paper, sheet, notes.
        From xl the side column becomes its own stack beside the diary and the paper.
      */}
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-9 px-4 py-6 md:px-8 md:py-7 xl:grid-cols-[minmax(0,1fr)_24rem] xl:grid-rows-[auto_1fr] xl:gap-x-10 2xl:grid-cols-[minmax(0,1fr)_27rem]">
        <div className="order-1 xl:col-start-1 xl:row-start-1">
          <Diary overview={data} />
        </div>
        <div className="order-3 xl:col-start-1 xl:row-start-2">
          <Briefing overview={data} />
        </div>
        <div className="contents xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:grid xl:content-start xl:gap-9">
          <div className="order-2">
            <Dispatches overview={data} />
          </div>
          <div className="order-4">
            <CharacterSheet overview={data} />
          </div>
          <div className="order-5">
            <Whispers overview={data} />
          </div>
          <div className="order-6">
            <Inbox overview={data} />
          </div>
        </div>
      </div>
    </div>
  );
}
