import { useEffect, useRef, useState } from "react";
import { capitalize, countdown, formatDate, longDate, monthLabel, nextAnnual, remaining, shortDate } from "../lib/dates";
import { contractProgress, schedule, type Birthday, type Preferences, type upcomingDates } from "../lib/schedule";
import { Icon } from "./icon";
import { contractCountdown, Progress } from "./schedule-views";

type ImportantDate = ReturnType<typeof upcomingDates>[number];
type DateListProps = {
  today: string;
  items: ImportantDate[];
  datePreferences: Preferences["dates"];
  onDate: (item: ImportantDate) => void;
};

const previewCount = 3;
const contractDate = (date: string) => formatDate(date, { day: "numeric", month: "short", year: "numeric" });

export function DatesView({ today, important, preferences, onDate, onBirthday }: {
  today: string;
  important: ImportantDate[];
  preferences: Preferences;
  onDate: (item: ImportantDate) => void;
  onBirthday: (birthday?: Birthday) => void;
}) {
  const [showAllDates, setShowAllDates] = useState(false);
  const changedView = useRef(false);
  const overviewScroll = useRef(0);
  const directoryHeading = useRef<HTMLHeadingElement>(null);
  const allDatesButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!changedView.current) return;
    if (showAllDates) {
      directoryHeading.current?.closest("main")?.scrollTo({ top: 0, behavior: "instant" });
      directoryHeading.current?.focus({ preventScroll: true });
    } else {
      allDatesButton.current?.closest("main")?.scrollTo({ top: overviewScroll.current, behavior: "instant" });
      allDatesButton.current?.focus({ preventScroll: true });
    }
  }, [showAllDates]);

  function changeView(allDates: boolean) {
    if (allDates) overviewScroll.current = allDatesButton.current?.closest("main")?.scrollTop ?? 0;
    changedView.current = true;
    setShowAllDates(allDates);
  }

  if (showAllDates) return <>
    <div className="page-heading dates-directory-heading">
      <button className="text-button dates-back" type="button" onClick={() => changeView(false)}>
        <Icon name="left" size={17} /> Voltar para Datas
      </button>
      <h1 ref={directoryHeading} tabIndex={-1}>Todas as datas</h1>
      <p className="muted">Próximas ocorrências, organizadas por mês.</p>
    </div>
    <DateDirectory today={today} items={important} datePreferences={preferences.dates} onDate={onDate} />
  </>;

  return <>
    <div className="page-heading">
      <p className="eyebrow">Marcos e celebrações</p>
      <h1>Datas</h1>
    </div>
    <div className="dates-layout">
      <ContractOverview today={today} />
      <Birthdays today={today} birthdays={preferences.birthdays} onBirthday={onBirthday} />
      <section className="upcoming-dates" aria-labelledby="upcoming-dates-title">
        <div className="dates-section-heading">
          <h2 id="upcoming-dates-title">Próximas datas</h2>
          {important.length > 0 && <button ref={allDatesButton} type="button" className="text-button" onClick={() => changeView(true)}>
            Ver todas <Icon name="right" size={15} />
          </button>}
        </div>
        {important.length > 0 ?
          <ImportantDateList today={today} items={important.slice(0, previewCount)} datePreferences={preferences.dates} onDate={onDate} /> :
          <p className="dates-empty-message muted">Nenhuma data importante por enquanto.</p>}
      </section>
    </div>
  </>;
}

function ContractOverview({ today }: { today: string }) {
  const days = remaining(today, schedule.contract.end);
  const elapsed = Math.round(contractProgress(today) * 100);

  return <section className="contract-overview" aria-labelledby="contract-title">
    <h2 id="contract-title"><Icon name="flag" size={18} /> Acompanhamento do contrato</h2>
    <p className="contract-count">
      {days > 0 ? <><strong>{days}</strong> <span>{days === 1 ? "dia restante" : "dias restantes"}</span></> :
        <strong>{contractCountdown(today)}</strong>}
    </p>
    <div className="contract-track">
      <div className="contract-progress-label"><span>Tempo de contrato decorrido</span><strong>{elapsed}%</strong></div>
      <Progress today={today} />
    </div>
    <dl className="contract-dates">
      <div><dt>Início</dt><dd><time dateTime={schedule.contract.start}>{contractDate(schedule.contract.start)}</time></dd></div>
      <div><dt>Término</dt><dd><time dateTime={schedule.contract.end}>{contractDate(schedule.contract.end)}</time></dd></div>
    </dl>
  </section>;
}

function Birthdays({ today, birthdays, onBirthday }: {
  today: string; birthdays: Birthday[]; onBirthday: (birthday?: Birthday) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const entries = birthdays.map((birthday) => ({
    birthday, date: nextAnnual(today, birthday.month, birthday.day),
  })).sort((a, b) => a.date.localeCompare(b.date));

  return <section className="dates-birthdays" aria-labelledby="birthdays-title">
    <div className="dates-section-heading">
      <h2 id="birthdays-title">Aniversários</h2>
      <button type="button" className="text-button birthday-add" onClick={() => onBirthday()}>
        <Icon name="plus" size={17} /> Adicionar
      </button>
    </div>
    {entries.length ? <>
      <ul className="birthday-list" id="birthday-list" role="list">
        {entries.slice(0, expanded ? entries.length : previewCount).map(({ birthday, date }) => {
          const age = birthday.year === undefined ? null : Number(date.slice(0, 4)) - birthday.year;
          return <li key={birthday.id}>
            <button type="button" className="birthday-row" onClick={() => onBirthday(birthday)}>
              <span className="birthday-gift"><Icon name="gift" size={19} /></span>
              <span className="dates-row-copy">
                <strong>{birthday.name}</strong>
                <span><time dateTime={date}>{shortDate(date)}</time>{age !== null && ` · ${age} ${age === 1 ? "ano" : "anos"}`}</span>
              </span>
              <span className="dates-countdown">{countdown(today, date)}</span>
              <Icon name="right" size={15} />
            </button>
          </li>;
        })}
      </ul>
      {entries.length > previewCount && <button type="button" className="text-button birthday-more"
        aria-expanded={expanded} aria-controls="birthday-list" onClick={() => setExpanded(!expanded)}>
        {expanded ? "Mostrar menos" : `Ver todos os ${entries.length} aniversários`}
      </button>}
    </> : <div className="birthday-empty">
      <span className="birthday-gift"><Icon name="gift" size={21} /></span>
      <div><strong>Nenhum aniversário cadastrado</strong>
        <p>Adicione alguém para acompanhar a próxima data.</p></div>
    </div>}
  </section>;
}

function ImportantDateList({ today, items, datePreferences, onDate }: DateListProps) {
  return <ul className="important-dates-list" role="list">
    {items.map((item) => <li key={item.title}>
      <button type="button" className="important-date-row" onClick={() => onDate(item)}>
        <time className="important-day" dateTime={item.date}>
          <span className="sr-only">{longDate(item.date)}</span>
          <strong aria-hidden="true">{Number(item.date.slice(-2))}</strong>
          <span aria-hidden="true">{formatDate(item.date, { month: "short" }).replace(".", "")}</span>
        </time>
        <span className="important-name">{item.title}
          {datePreferences[item.title]?.favorite && <span className="important-favorite">
            <Icon name="dates" size={15} /><span className="sr-only">Favorita</span>
          </span>}
        </span>
        <span className="dates-countdown">{countdown(today, item.date)}</span>
        <Icon name="right" size={15} />
      </button>
    </li>)}
  </ul>;
}

function DateDirectory({ today, items, datePreferences, onDate }: DateListProps) {
  const groups = new Map<string, ImportantDate[]>();
  for (const item of items) {
    const month = item.date.slice(0, 7);
    const group = groups.get(month);
    if (group) group.push(item);
    else groups.set(month, [item]);
  }

  return <div className="dates-directory">
    {[...groups].map(([month, dates]) => <section className="dates-month" key={month} aria-labelledby={`dates-${month}`}>
      <h2 id={`dates-${month}`}>{capitalize(monthLabel(dates[0].date))}</h2>
      <ImportantDateList today={today} items={dates} datePreferences={datePreferences} onDate={onDate} />
    </section>)}
  </div>;
}
