import { cn, PaperSheet, Portrait } from '@whip/ui';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { usePolitician } from '../../api/hooks';
import type { Article, Newspaper, NewspaperSectionKey } from '../../api/types';
import { formatLongDate } from '../../lib/format';
import { campaignPath } from '../../lib/params';
import { captionFor, mastheadArt, photoFor, type MastheadArt } from './art';
import { headlineClass, paperKind, type PaperKind } from './paper-style';

/** Sections that run down the narrow column beside the main stories. */
const SIDE: readonly NewspaperSectionKey[] = ['and_finally', 'letters', 'weather'];
/** Sections on the back pages, under a heavy rule. */
const BACK: readonly NewspaperSectionKey[] = [
  'constituencies',
  'sport',
  'classifieds',
  'corrections',
];

/* ----------------------------------------------------------------------------
 * Masthead
 * ------------------------------------------------------------------------- */

function Ear({ children, align }: { children: ReactNode; align: 'left' | 'right' }) {
  return (
    <p
      className={cn(
        'w-28 shrink-0 text-[10px] leading-tight font-bold tracking-[0.06em] uppercase max-md:hidden',
        align === 'right' && 'text-right',
      )}
    >
      {children}
    </p>
  );
}

/**
 * The painted masthead: the image is the heading's content and its alt is the paper's title, so
 * the heading keeps its name. width/height reserve the space (no layout shift); it scales down
 * with its box and never past its own width.
 */
function TitleArt({
  art,
  title,
  className,
}: {
  art: MastheadArt;
  title: string;
  className?: string;
}) {
  return (
    <img
      src={art.src}
      width={art.width}
      height={art.height}
      alt={title}
      decoding="async"
      draggable={false}
      className={cn('block h-auto w-full max-w-full select-none', className)}
    />
  );
}

export function PaperMasthead({
  paper,
  kind,
  aside,
  titleId,
}: {
  paper: Newspaper;
  kind: PaperKind;
  aside?: ReactNode;
  titleId?: string;
}) {
  const { title, slogan, price, edition, date } = paper.masthead;
  // Papers without painted art keep the type-set title below.
  const art = mastheadArt(title);
  const dateline = (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 text-[11px] leading-none font-bold tracking-[0.06em] uppercase',
        kind === 'tabloid' ? 'bg-ink px-3 text-paper-bright' : 'border-y border-ink',
      )}
    >
      <span>
        {formatLongDate(date)}
        {/* The Gazette prints its edition in the masthead ear instead. */}
        {kind !== 'record' && <span className="opacity-70"> · {edition}</span>}{' '}
        <span className="md:hidden">· {price}</span>
      </span>
      {aside}
    </div>
  );

  if (kind === 'tabloid') {
    return (
      <header>
        <div className="flex items-stretch gap-3">
          {art ? (
            <div className="flex min-w-0 flex-1 items-center">
              <h2 id={titleId} className="w-full max-w-[36rem]">
                <TitleArt art={art} title={title} />
              </h2>
            </div>
          ) : (
            <div className="flex-1 bg-whip px-4 py-2 text-white [clip-path:polygon(0_0,100%_0,calc(100%-1.2rem)_100%,0_100%)]">
              <h2
                id={titleId}
                className="font-display text-[clamp(2.2rem,5vw,3.8rem)] leading-[0.85] font-black uppercase [font-stretch:62%]"
              >
                {title}
              </h2>
            </div>
          )}
          <div className="flex shrink-0 flex-col items-end justify-center gap-1 text-right">
            <span className="bg-ink px-2 py-1 font-display text-2xl leading-none font-black text-paper-bright [font-stretch:70%]">
              {price}
            </span>
            <span className="max-w-40 text-[11px] leading-tight font-black uppercase max-sm:hidden">
              {slogan}
            </span>
          </div>
        </div>
        <div className="mt-2">{dateline}</div>
      </header>
    );
  }

  if (kind === 'record') {
    return (
      <header>
        {/* The painted Gazette title brings its own double rules. */}
        {!art && <div aria-hidden="true" className="h-[5px] bg-ink" />}
        <div className="flex items-center gap-3 py-2">
          <Ear align="left">{edition}</Ear>
          <div className="min-w-0 flex-1 text-center">
            {art ? (
              <h2 id={titleId} className="mx-auto w-full max-w-[40rem]">
                <TitleArt art={art} title={title} />
              </h2>
            ) : (
              <h2
                id={titleId}
                className="font-display text-[clamp(1.5rem,3.4vw,2.7rem)] leading-none font-black tracking-[0.04em] uppercase [font-stretch:125%]"
              >
                {title}
              </h2>
            )}
            <p className="mt-1 text-[11px] tracking-[0.18em] uppercase opacity-75">{slogan}</p>
          </div>
          <Ear align="right">Price {price}</Ear>
        </div>
        {dateline}
        <div aria-hidden="true" className="mt-[2px] h-px bg-ink" />
      </header>
    );
  }

  return (
    <header>
      <div className="flex items-end gap-3 border-b-2 border-ink pb-2">
        <Ear align="left">{slogan}</Ear>
        {art ? (
          <h2 id={titleId} className="min-w-0 flex-1">
            <TitleArt art={art} title={title} className="mx-auto max-w-[36rem]" />
          </h2>
        ) : (
          <h2
            id={titleId}
            className="min-w-0 flex-1 text-center font-display text-[clamp(1.9rem,4.4vw,3.4rem)] leading-[0.9] font-extrabold tracking-[-0.025em] [font-stretch:100%]"
          >
            {title}
          </h2>
        )}
        <Ear align="right">{price}</Ear>
      </div>
      <div className="mt-[3px]">{dateline}</div>
    </header>
  );
}

/* ----------------------------------------------------------------------------
 * Articles
 * ------------------------------------------------------------------------- */

function PoliticianRef({ campaignId, id }: { campaignId: string; id: string }) {
  const p = usePolitician(campaignId, id);
  const name = p.data?.name;
  return (
    <Link
      to={campaignPath(campaignId, `politicians/${encodeURIComponent(id)}`)}
      className="inline-flex items-center gap-1.5 pr-1 text-[11px] font-bold hover:underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-whip"
      aria-label={name ? `${name}: profile` : 'Profile'}
    >
      <Portrait seed={id} partyColour={p.data?.partyColour} size="xs" />
      {name}
    </Link>
  );
}

function Refs({ article, campaignId }: { article: Article; campaignId: string }) {
  const politicians = article.refs.filter((r) => r.kind === 'politician').slice(0, 3);
  const bill = article.refs.find((r) => r.kind === 'bill' || r.kind === 'division');
  const party = article.refs.find((r) => r.kind === 'party');
  if (!politicians.length && !bill && !party) return null;
  const link =
    'text-[11px] font-bold underline decoration-ink/30 underline-offset-2 hover:decoration-whip focus-visible:outline-2 focus-visible:outline-whip';
  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      {politicians.map((r) => (
        <PoliticianRef key={r.id} campaignId={campaignId} id={r.id} />
      ))}
      {bill && (
        <Link to={campaignPath(campaignId, 'parliament')} className={link}>
          The bill in the Chamber
        </Link>
      )}
      {party && (
        <Link to={campaignPath(campaignId, 'party')} className={link}>
          Party HQ
        </Link>
      )}
    </p>
  );
}

export function ArticleView({
  article,
  kind,
  campaignId,
  as: Tag = 'h4',
  importance,
  className,
  showBody = true,
  photo,
}: {
  article: Article;
  kind: PaperKind;
  campaignId: string;
  as?: 'h3' | 'h4' | 'h5';
  /** Override the article's own importance (for layout). */
  importance?: number;
  className?: string;
  showBody?: boolean;
  /** A picture under the headline (the lead story only), with the text wrapping beside it. */
  photo?: ReactNode;
}) {
  return (
    <article className={cn('min-w-0', photo && 'flow-root', className)}>
      <Tag className={cn('text-balance', headlineClass(kind, importance ?? article.importance))}>
        {article.headline}
      </Tag>
      {photo}
      {article.standfirst && (
        <p
          className={cn(
            'mt-1.5 text-pretty text-ink/85',
            (importance ?? article.importance) >= 4
              ? 'text-[15px] leading-snug'
              : 'text-[13px] leading-snug',
            kind === 'tabloid' && 'font-bold',
          )}
        >
          {article.standfirst}
        </p>
      )}
      {article.byline && (
        <p className="mt-1.5 text-[10px] font-bold tracking-[0.08em] text-ink/65 uppercase">
          {article.byline}
        </p>
      )}
      {showBody && article.body && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink/85">{article.body}</p>
      )}
      <Refs article={article} campaignId={campaignId} />
    </article>
  );
}

/**
 * The lead story's photo: chosen by story (`photoFor`), captioned deadpan, 640w and 1280w
 * through srcset. Floats right of the text from md; full width above it on phones.
 */
export function LeadPhoto({ article }: { article: Article }) {
  const photo = photoFor(article);
  return (
    <figure
      data-photo={photo.key}
      className="mt-3 mb-1 md:float-right md:mt-2 md:mb-2 md:ml-5 md:w-[46%] lg:w-[44%]"
    >
      <img
        src={photo.src640}
        srcSet={`${photo.src640} 640w, ${photo.src} 1280w`}
        sizes="(min-width: 80rem) 26rem, (min-width: 48rem) 46vw, 100vw"
        width={1280}
        height={854}
        alt={photo.alt}
        loading="lazy"
        decoding="async"
        className="block aspect-[3/2] h-auto w-full bg-ink object-cover"
      />
      <figcaption className="mt-1.5 text-[11px] leading-snug italic opacity-80">
        {captionFor(photo, article.id)}
      </figcaption>
    </figure>
  );
}

function SectionLabel({ kind, children }: { kind: PaperKind; children: ReactNode }) {
  if (kind === 'tabloid') {
    return (
      <h4 className="mb-2 inline-block bg-ink px-2 py-1 font-display text-[13px] leading-none font-black tracking-[0.04em] text-paper-bright uppercase [font-stretch:75%]">
        {children}
      </h4>
    );
  }
  if (kind === 'record') {
    return (
      <h4 className="mb-2 flex items-center gap-2 text-[11px] font-black tracking-[0.2em] uppercase">
        <span aria-hidden="true" className="h-px flex-1 bg-ink" />
        {children}
        <span aria-hidden="true" className="h-px flex-1 bg-ink" />
      </h4>
    );
  }
  return (
    <h4 className="mb-2 border-b border-ink pb-1 font-display text-[13px] font-extrabold tracking-[0.04em] uppercase">
      {children}
    </h4>
  );
}

/** A small back-of-paper section: label, then short items. */
function SmallSection({
  section,
  kind,
  campaignId,
}: {
  section: Newspaper['sections'][number];
  kind: PaperKind;
  campaignId: string;
}) {
  return (
    <section aria-label={section.title} className="min-w-0">
      <SectionLabel kind={kind}>{section.title}</SectionLabel>
      <ul className="grid gap-3">
        {section.articles.map((a) => (
          <li
            key={a.id}
            className={cn(section.key === 'classifieds' && 'border border-ink/40 p-2')}
          >
            <ArticleView
              article={a}
              kind={kind}
              campaignId={campaignId}
              as="h5"
              importance={Math.min(a.importance, 2)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ----------------------------------------------------------------------------
 * Filler: a house advert for when the news runs short
 * ------------------------------------------------------------------------- */

const HOUSE_ADS: Record<PaperKind, readonly { kicker: string; title: string; body: string }[]> = {
  broadsheet: [
    {
      kicker: 'Advertisement',
      title: 'The Morning Whip Wine Club',
      body: 'Twelve reds chosen by our Political Editor, who has never once been asked to resign over any of them.',
    },
    {
      kicker: 'Notice',
      title: 'This space was reserved for a correction',
      body: 'None was required this week. The Editor is as surprised as you are.',
    },
  ],
  tabloid: [
    {
      kicker: 'Competition',
      title: 'Win a day with a junior minister',
      body: 'Second prize: two days. Text WHIP to 80080. Calls cost more than you think.',
    },
    {
      kicker: 'Advertisement',
      title: 'Clarion Bingo',
      body: 'Eyes down for the Chancellor’s numbers. Nobody else can read them either.',
    },
  ],
  record: [
    {
      kicker: 'Public notice',
      title: 'The Gazette regrets',
      body: 'This space was set aside for the Opposition’s alternative budget, which did not arrive.',
    },
    {
      kicker: 'Official notice',
      title: 'Statutory instruments laid this week',
      body: 'A full list is available on request, to anyone who has requested it. Nobody has.',
    },
  ],
};

function HouseAd({ kind, seed }: { kind: PaperKind; seed: string }) {
  const pool = HOUSE_ADS[kind];
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const ad = pool[h % pool.length]!;
  return (
    <aside
      aria-label={ad.kicker}
      className={cn(
        'flex min-h-[7rem] flex-1 flex-col items-center justify-center gap-2 px-6 py-5 text-center',
        kind === 'tabloid' ? 'bg-ink text-paper-bright' : 'outline-2 -outline-offset-2 outline-ink',
      )}
    >
      <p className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-70">{ad.kicker}</p>
      <p
        className={cn(
          'max-w-[24ch] text-balance',
          kind === 'broadsheet'
            ? 'font-display text-[1.7rem] leading-[1.02] font-extrabold tracking-[-0.02em]'
            : kind === 'tabloid'
              ? 'font-display text-[2.1rem] leading-[0.88] font-black uppercase [font-stretch:64%]'
              : 'font-display text-[1.35rem] leading-tight font-black tracking-[0.06em] uppercase [font-stretch:115%]',
        )}
      >
        {ad.title}
      </p>
      <p className="max-w-[46ch] text-[13px] leading-snug text-pretty opacity-85">{ad.body}</p>
    </aside>
  );
}

/** Height difference above which a back-page section moves up into the shorter column. */
const PULL_AT = 180;
/** Height difference still left after that, above which a house advert fills the gap. */
const AD_AT = 120;

type Column = 'main' | 'aside';

/**
 * Keep the two columns level. Whichever column runs short (the news, or the narrow column with
 * the insert and gossip) takes back-page sections one by one, and if the gap is still wide a
 * house advert fills it. Only from lg, where the columns sit side by side (stacked layouts use
 * display: contents and have no box to measure, so nothing moves).
 */
function useBalancedColumns(backCount: number) {
  const mainRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState<{ n: number; into: Column | null }>({ n: 0, into: null });
  const [slack, setSlack] = useState(0);
  const live = useRef({ pull, backCount, width: 0 });
  useEffect(() => {
    live.current.pull = pull;
    live.current.backCount = backCount;
  });

  useEffect(() => {
    const main = mainRef.current;
    const aside = asideRef.current;
    if (!main || !aside || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const width = main.parentElement?.parentElement?.getBoundingClientRect().width ?? 0;
      if (Math.abs(width - live.current.width) > 1) {
        // A new width: start again from the printed order.
        live.current.width = width;
        if (live.current.pull.n !== 0) {
          setPull({ n: 0, into: null });
          return;
        }
      }
      const m = main.getBoundingClientRect();
      const a = aside.getBoundingClientRect();
      if (!m.height || !a.height) {
        setSlack(0);
        return;
      }
      // Positive: the narrow column runs longer; negative: the news does.
      const gap = a.bottom - m.bottom;
      const { n, into } = live.current.pull;
      const want: Column | null = gap > PULL_AT ? 'main' : gap < -PULL_AT ? 'aside' : null;
      if (want && (into === null || into === want) && n < live.current.backCount) {
        setPull({ n: n + 1, into: want });
        return;
      }
      setSlack(gap);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(main);
    ro.observe(aside);
    measure();
    return () => ro.disconnect();
  }, [pull]);

  const adIn: Column | null = slack > AD_AT ? 'main' : slack < -AD_AT ? 'aside' : null;
  return { mainRef, asideRef, pull: pull.n, into: pull.into, adIn };
}

/* ----------------------------------------------------------------------------
 * The page
 * ------------------------------------------------------------------------- */

const SHEET: Record<PaperKind, string> = {
  broadsheet: 'bg-paper',
  tabloid: 'bg-paper-bright',
  record: 'bg-paper-deep',
};

/**
 * A newspaper front page from a `Newspaper` DTO: masthead in the paper's own style, the lead
 * story, the Politics column, a narrow column for And Finally / Letters / Weather / Corrections
 * (with an optional `insert` at its top, e.g. the turn report's "Your week"), and back pages.
 */
export function NewspaperPage({
  paper,
  campaignId,
  insert,
  aside,
  compact = false,
  titleId,
  className,
}: {
  paper: Newspaper;
  campaignId: string;
  /** Boxed panel at the top of the narrow column (the player's results). */
  insert?: ReactNode;
  /** Right end of the dateline (e.g. a "last week's paper" button). */
  aside?: ReactNode;
  /** Office briefing: fewer politics stories, no back pages. */
  compact?: boolean;
  titleId?: string;
  className?: string;
}) {
  const kind = paperKind(paper.masthead.title);
  const politics = paper.sections.filter((s) => s.key === 'politics').flatMap((s) => s.articles);
  const politicsTitle = paper.sections.find((s) => s.key === 'politics')?.title ?? 'Politics';
  const side = paper.sections.filter((s) => SIDE.includes(s.key) && s.articles.length);
  const back = paper.sections.filter((s) => BACK.includes(s.key) && s.articles.length);
  const stories = compact ? politics.slice(0, 4) : politics;
  const narrow = compact ? side.slice(0, 2) : side;
  const hasSide = !!insert || narrow.length > 0;
  const backPages = compact ? [] : back;
  const { mainRef, asideRef, pull, into, adIn } = useBalancedColumns(
    hasSide ? backPages.length : 0,
  );
  const pulled = backPages.slice(0, pull);
  const rest = backPages.slice(pull);
  const ad = <HouseAd kind={kind} seed={`${paper.masthead.edition}:${paper.masthead.date}`} />;

  return (
    <PaperSheet
      className={cn('px-4 pt-4 pb-6 md:px-7', SHEET[kind], className)}
      aria-labelledby={titleId}
    >
      <PaperMasthead paper={paper} kind={kind} aside={aside} {...(titleId ? { titleId } : {})} />

      <div
        className={cn(
          'mt-4 grid gap-x-7 gap-y-6',
          hasSide && 'lg:grid-cols-[minmax(0,1fr)_minmax(14rem,19rem)]',
        )}
      >
        {/*
          Phones read lead, your-week insert, politics, then the small sections (CSS order on
          display:contents wrappers); from lg the two columns are real grid items again.
        */}
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div ref={mainRef} className="contents lg:grid lg:content-start lg:gap-5">
            {/* Lead story. The tabloid reverses it out of a black band. */}
            <div
              className={cn(
                'order-1',
                kind === 'tabloid' && 'bg-ink p-4 text-paper-bright [&_*]:text-inherit',
              )}
            >
              <ArticleView
                article={paper.lead}
                kind={kind}
                campaignId={campaignId}
                as="h3"
                importance={5}
                photo={compact ? undefined : <LeadPhoto article={paper.lead} />}
              />
            </div>
            {stories.length > 0 && (
              <section aria-label={politicsTitle} className="order-3">
                <SectionLabel kind={kind}>{politicsTitle}</SectionLabel>
                <div className="grid gap-x-6 gap-y-4 md:grid-cols-2 md:[&>*:nth-child(even)]:border-l md:[&>*:nth-child(even)]:border-ink/25 md:[&>*:nth-child(even)]:pl-6">
                  {stories.map((a, i) => (
                    <ArticleView
                      key={a.id}
                      article={a}
                      kind={kind}
                      campaignId={campaignId}
                      importance={Math.min(a.importance, i < 2 ? 4 : 3)}
                      showBody={!compact}
                    />
                  ))}
                </div>
              </section>
            )}
            {into === 'main' && pulled.length > 0 && (
              <div className="order-5 grid gap-x-6 gap-y-5 border-t-[3px] border-ink pt-3 sm:grid-cols-2">
                {pulled.map((s) => (
                  <SmallSection key={s.key} section={s} kind={kind} campaignId={campaignId} />
                ))}
              </div>
            )}
          </div>
          {adIn === 'main' && ad}
        </div>
        {hasSide && (
          <aside
            aria-label="Also in this edition"
            className="contents lg:flex lg:flex-col lg:gap-5 lg:border-l lg:border-ink lg:pl-6"
          >
            <div ref={asideRef} className="contents lg:grid lg:content-start lg:gap-5">
              {insert && <div className="order-2">{insert}</div>}
              {narrow.length > 0 && (
                <div className="order-4 grid content-start gap-5 max-lg:border-t max-lg:border-ink max-lg:pt-4">
                  {narrow.map((s) => (
                    <SmallSection key={s.key} section={s} kind={kind} campaignId={campaignId} />
                  ))}
                </div>
              )}
              {into === 'aside' && pulled.length > 0 && (
                <div className="order-5 grid content-start gap-5 border-t-[3px] border-ink pt-3">
                  {pulled.map((s) => (
                    <SmallSection key={s.key} section={s} kind={kind} campaignId={campaignId} />
                  ))}
                </div>
              )}
            </div>
            {adIn === 'aside' && ad}
          </aside>
        )}
      </div>

      {rest.length > 0 && (
        <div
          className={cn(
            'mt-6 grid gap-x-6 gap-y-5 border-t-[3px] border-ink pt-3 sm:grid-cols-2',
            rest.length >= 4 ? 'lg:grid-cols-4' : rest.length === 3 && 'lg:grid-cols-3',
          )}
        >
          {rest.map((s) => (
            <SmallSection key={s.key} section={s} kind={kind} campaignId={campaignId} />
          ))}
        </div>
      )}
    </PaperSheet>
  );
}
