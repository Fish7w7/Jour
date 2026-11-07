import { useEffect, useRef, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { capitalize, dateKey, formatDate, longDate, monthLabel, moveMonth, shortDate } from "../lib/dates";
import { eventHours, kinds } from "../lib/schedule";
import { Icon } from "./icon";
import { type DayLookup, type Entry } from "./schedule-views";

type CalendarMode = "month" | "week";
type DayDates = { birthdayNames: string[]; extraDates: string[] };
const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const markedKinds = ["hospital", "senac", "holiday"] as const;

export function CalendarGrid({ dates, selected, today, mode, lookup, hasPersonal, onSelect, onMove, onToday, onMode, onPeriod }: {
  dates: string[]; selected: string; today: string; mode: CalendarMode; lookup: DayLookup;
  hasPersonal: (date: string) => boolean; onSelect: (date: string) => void; onMove: (step: number) => void;
  onToday: () => void; onMode: (mode: CalendarMode) => void; onPeriod: () => void;
}) {
  const label = mode === "month" ? capitalize(monthLabel(selected)) : `${shortDate(dates[0])} – ${shortDate(dates[6])}`;
  return <section className="panel calendar-panel" aria-label="Grade da agenda">
    <div className="calendar-controls">
      <div className="segmented" role="group" aria-label="Visualização do calendário">
        <button type="button" aria-pressed={mode === "month"} onClick={() => onMode("month")}>Mês</button>
        <button type="button" aria-pressed={mode === "week"} onClick={() => onMode("week")}>Semana</button>
      </div>
      <button type="button" className="text-button calendar-today" onClick={onToday}>Hoje</button>
    </div>
    <div className="calendar-heading">
      <h2 aria-live="polite">
        <button type="button" className="calendar-period" aria-haspopup="dialog" onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          onPeriod();
        }}>
          <span>{label}</span><span className="sr-only">, escolher mês e ano</span>
          <Icon name="right" size={15} />
        </button>
      </h2>
      <div className="calendar-arrows">
        <button type="button" className="icon-button" aria-label={mode === "month" ? "Mês anterior" : "Semana anterior"} onClick={() => onMove(-1)}><Icon name="left" size={19} /></button>
        <button type="button" className="icon-button" aria-label={mode === "month" ? "Próximo mês" : "Próxima semana"} onClick={() => onMove(1)}><Icon name="right" size={19} /></button>
      </div>
    </div>
    <div className="calendar-grid date-reveal" key={mode}>
      {weekdays.map((name) => <span className="weekday" aria-hidden="true" key={name}>{name}</span>)}
      {dates.map((date) => {
        const { event, personal } = lookup(date);
        const hasExtra = hasPersonal(date);
        const adjacent = mode === "month" && selected.slice(0, 7) !== date.slice(0, 7);
        return <button type="button" key={date} className="calendar-day" aria-pressed={date === selected}
          aria-current={date === today ? "date" : undefined} onClick={() => onSelect(date)}
          data-adjacent={adjacent}
          aria-label={`${longDate(date)} · ${event.kind === "free" ? "" : kinds[event.kind].label + " · "}${event.title}${personal ? " · Ajuste pessoal" : ""}${hasExtra ? " · Datas pessoais" : ""}`}>
          <span className="calendar-number">{Number(date.slice(-2))}</span>
          <span className="calendar-markers" aria-hidden="true">
            {!adjacent && event.kind !== "free" && <span className="marker" data-kind={event.kind} />}
            {!adjacent && (personal || hasExtra) && <span className="personal-marker" />}
          </span>
        </button>;
      })}
    </div>
    {mode === "month" && <ul className="calendar-legend" role="list" aria-label="Legenda">
      {markedKinds.map((kind) => <li key={kind}><span className="marker" data-kind={kind} aria-hidden="true" />{kinds[kind].label}</li>)}
      <li><span className="personal-marker" aria-hidden="true" />Pessoal</li>
    </ul>}
  </section>;
}

const months = Array.from({ length: 12 }, (_, index) =>
  capitalize(formatDate(dateKey(2000, index + 1, 1), { month: "long" })));

export function CalendarPeriodForm({ selected, onSelect }: { selected: string; onSelect: (date: string) => void }) {
  const [year, month] = selected.split("-").map(Number);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const nextYear = Number(values.get("year"));
    const nextMonth = Number(values.get("month"));
    onSelect(moveMonth(selected, (nextYear - year) * 12 + nextMonth - month));
  }

  return <form className="form-stack" onSubmit={submit}>
    <div className="form-columns calendar-period-fields">
      <div className="field">
        <label htmlFor="calendar-month">Mês</label>
        <select id="calendar-month" name="month" defaultValue={month}>
          {months.map((name, index) => <option value={index + 1} key={name}>{name}</option>)}
        </select>
      </div>
      <label>Ano<input type="number" name="year" min={100} max={9998} required inputMode="numeric" defaultValue={year} /></label>
    </div>
    <button type="submit" className="primary-button">Ir para o período</button>
  </form>;
}

export function CalendarDayDates({ birthdayNames, extraDates }: DayDates) {
  if (!birthdayNames.length && !extraDates.length) return null;

  return <ul className="calendar-day-dates" role="list" aria-label="Aniversários e datas importantes">
    {birthdayNames.map((name, index) => <li key={index}><Icon name="gift" size={16} /><span>Aniversário de {name}</span></li>)}
    {extraDates.map((title) => <li key={title}><Icon name="sparkles" size={16} /><span>{title}</span></li>)}
  </ul>;
}

export function DaySummary({ entry, isToday, birthdayNames, extraDates, onDetails }: DayDates & {
  entry: Entry; isToday: boolean; onDetails: () => void;
}) {
  const { event, personal, official } = entry;
  const hours = eventHours(event);
  return <section className="panel summary" aria-label="Resumo do dia">
    <div aria-live="polite" aria-atomic="true">
      <div className="date-reveal day-overview" key={event.date}>
        <p className="summary-date">
          {isToday && <span className="summary-today">Hoje</span>}
          <time dateTime={event.date}>{capitalize(longDate(event.date))}</time>
        </p>
        {(official || personal) && event.title !== kinds[event.kind].label &&
          <p className="day-kind" data-kind={event.kind}>{kinds[event.kind].label}</p>}
        <h2>{event.title}</h2>
        {hours && <p className="day-hours"><Icon name="today" size={17} />{hours}</p>}
        {personal && <p className="muted">Ajuste pessoal</p>}
        <CalendarDayDates birthdayNames={birthdayNames} extraDates={extraDates} />
      </div>
    </div>
    <button type="button" className="text-button summary-link" onClick={(event) => {
      event.currentTarget.focus({ preventScroll: true });
      onDetails();
    }}>Ver detalhes <Icon name="right" size={16} /></button>
  </section>;
}

export function WeeklyAgenda({ dates, lookup, getDayDates, selected, onOpen }: {
  dates: string[]; lookup: DayLookup; getDayDates: (date: string) => DayDates;
  selected: string; onOpen: (date: string) => void;
}) {
  const pointerRow = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function clearPointerFocus() {
      pointerRow.current?.removeAttribute("data-pointer-focus");
      pointerRow.current = null;
    }

    document.addEventListener("keydown", clearPointerFocus, true);
    return () => document.removeEventListener("keydown", clearPointerFocus, true);
  }, []);

  function openFromRow(date: string, event: MouseEvent<HTMLButtonElement>) {
    pointerRow.current?.removeAttribute("data-pointer-focus");
    // WebKit can match :focus-visible when the dialog restores focus after a tap.
    pointerRow.current = event.detail > 0 ? event.currentTarget : null;
    pointerRow.current?.setAttribute("data-pointer-focus", "");
    event.currentTarget.focus({ preventScroll: true });
    onOpen(date);
  }

  const days = dates.map((date) => {
    const entry = lookup(date);
    const dayDates = getDayDates(date);
    const showEvent = entry.event.kind !== "free" || Boolean(entry.personal);
    const hasItems = showEvent || dayDates.birthdayNames.length > 0 || dayDates.extraDates.length > 0;
    return { date, ...entry, ...dayDates, showEvent, hasItems };
  });
  const weekend = days.slice(5);
  const weekendFree = weekend.every(({ official, hasItems }) => official && !hasItems);
  const selectedWeekend = weekendFree ? weekend.find(({ date }) => date === selected) : undefined;
  const entries = (weekendFree ? days.slice(0, 5) : days).filter(({ date, hasItems }) => hasItems || date === selected);

  return <section className="weekly-agenda" aria-labelledby="weekly-agenda-title">
    <h2 id="weekly-agenda-title">Agenda da semana</h2>
    {!days.some(({ hasItems }) => hasItems) && <p className="weekly-empty muted">Nenhum compromisso ou data importante nesta semana.</p>}
    <ul className="weekly-list" role="list">
      {entries.map(({ date, event, personal, birthdayNames, extraDates, showEvent, hasItems }) => {
        const hours = eventHours(event);
        return <WeekDayRow key={date} date={date} selected={date === selected} onOpen={openFromRow}>
          {showEvent && <>
            <span className="weekly-event">
              <span className="weekly-event-label">
                <span className="weekly-kind" data-kind={event.kind}>
                  <Icon name={kinds[event.kind].icon} size={15} />{kinds[event.kind].label}
                </span>
                {event.title !== kinds[event.kind].label && <strong>{event.title}</strong>}
              </span>
              {hours && <span className="weekly-hours"><Icon name="today" size={14} />{hours}</span>}
            </span>
            {personal && <span className="muted">Ajuste pessoal</span>}
          </>}
          {!hasItems && <span className="weekly-free"><Icon name="sun" size={16} />{event.title}</span>}
          {birthdayNames.map((name, index) => <span className="weekly-extra" key={index}><Icon name="gift" size={15} /> Aniversário de {name}</span>)}
          {extraDates.map((title) => <span className="weekly-extra" key={title}><Icon name="sparkles" size={15} /> {title}</span>)}
        </WeekDayRow>;
      })}
      {weekendFree && (selectedWeekend ?
        <WeekDayRow key="weekend" date={selectedWeekend.date} selected onOpen={openFromRow}>
          <span className="weekly-free"><Icon name="sun" size={16} />Fim de semana livre</span>
        </WeekDayRow> : <li key="weekend" className="weekly-entry weekly-weekend">
          <span className="weekly-free"><Icon name="sun" size={16} />Fim de semana livre</span>
        </li>)}
    </ul>
  </section>;
}

function WeekDayRow({ date, selected, onOpen, children }: {
  date: string; selected: boolean; onOpen: (date: string, event: MouseEvent<HTMLButtonElement>) => void; children: ReactNode;
}) {
  return <li className="weekly-entry" data-selected={selected}>
    <button type="button" className="weekly-open" aria-current={selected ? "true" : undefined} onClick={(event) => onOpen(date, event)}>
      <time dateTime={date} className="weekly-date">
        <span className="sr-only">{longDate(date)}</span>
        <span aria-hidden="true">{capitalize(formatDate(date, { weekday: "short" })).replace(/\.$/, "")}</span>
        <strong aria-hidden="true">{Number(date.slice(-2))}</strong>
      </time>
      <span className="weekly-content">{children}</span>
      <Icon name="right" size={16} />
    </button>
  </li>;
}
