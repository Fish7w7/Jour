import { capitalize, countdown, formatDate, longDate, shortDate, week } from "../lib/dates";
import type { Appearance } from "../lib/appearance";
import { agendaDay, contractProgress, eventHours, kinds, schedule, type ScheduleKind } from "../lib/schedule";
import { Icon } from "./icon";

export type Entry = ReturnType<typeof agendaDay>;
export type DayLookup = (date: string) => Entry;
const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function SectionHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return <div className="section-heading"><h2>{title}</h2>{children}</div>;
}

export function KindIcon({ kind }: { kind: ScheduleKind }) {
  return <span className="tile kind-tile" data-kind={kind}><Icon name={kinds[kind].icon} /></span>;
}

function Marker({ kind }: { kind: ScheduleKind }) {
  return <span className="marker" data-kind={kind} aria-hidden="true" />;
}

export function WeekStrip({ selected, today, onSelect, lookup }: {
  selected: string; today: string; onSelect: (date: string) => void; lookup: DayLookup;
}) {
  return <div className="week-strip panel grid grid-cols-7">
    {week(today).map((date, i) => {
      const { event, personal } = lookup(date);
      return <button type="button" key={date} className="week-day" aria-pressed={date === selected}
        aria-current={date === today ? "date" : undefined}
        aria-label={`${longDate(date)} · ${kinds[event.kind].label} · ${event.title}${personal ? " · Ajuste pessoal" : ""}`}
        onClick={() => onSelect(date)}>
        <span>{weekdays[i]}</span><strong>{Number(date.slice(-2))}</strong>
        <Marker kind={event.kind} />
      </button>;
    })}
  </div>;
}

export function Hero({ selected, today, entry, style, onDetails }: {
  selected: string; today: string; entry: Entry; style: Appearance["cardStyle"]; onDetails?: () => void;
}) {
  const { event, personal, official } = entry;
  const hours = eventHours(event);
  return <section className="hero hero-surface" data-kind={event.kind} data-card-style={style} aria-labelledby="commitment-title">
    <div className="hero-top">
      <span className="hero-icon"><Icon name={kinds[event.kind].icon} size={26} /></span>
      <span className="hero-label">{selected === today ? "Compromisso de hoje" : "Data selecionada"}</span>
    </div>
    <div aria-live="polite" aria-atomic="true">
      <div className="date-reveal" key={selected}>
        <h2 id="commitment-title">{!official && !personal ? "Sem programação" : kinds[event.kind].label}</h2>
        <p>{!official && !personal ? "Fora do calendário oficial" : event.title}</p>
        {selected !== today && <p className="hero-date">{capitalize(formatDate(selected, { weekday: "long", day: "numeric", month: "long" }))}</p>}
      </div>
    </div>
    {(hours || personal || onDetails) && <div className="hero-footer">
      <div className="flex flex-wrap items-center gap-2">
        {hours && <span className="hero-chip"><Icon name="today" size={17} />{hours}</span>}
        {personal && <span className="hero-chip">Ajuste pessoal</span>}
      </div>
      {onDetails && <button type="button" className="hero-action" onClick={onDetails}>Ver detalhes <Icon name="arrow" size={19} /></button>}
    </div>}
  </section>;
}

export function Following({ entry, onOpen }: {
  entry?: Entry; onOpen: (date: string) => void;
}) {
  const event = entry?.event;
  const hours = event ? eventHours(event) : "";
  return <section>
    <SectionHeading title="Próximo compromisso" />
    {event ? <button type="button" className="panel next-appointment" onClick={() => onOpen(event.date)}>
      <span className="next-appointment-header">
        <time dateTime={event.date}>
          <span>{capitalize(formatDate(event.date, { weekday: "long" }))}</span>
          <strong>{formatDate(event.date, { day: "numeric", month: "long", year: "numeric" })}</strong>
        </time>
        <Icon name="right" size={17} />
      </span>
      <span className="next-appointment-body">
        <KindIcon kind={event.kind} />
        <span className="next-appointment-copy">
          <span className="next-appointment-meta">
            <span>{kinds[event.kind].label}</span>
            {hours && <span><Icon name="today" size={14} />{hours}</span>}
          </span>
          {event.title !== kinds[event.kind].label && <strong>{event.title}</strong>}
        </span>
      </span>
    </button> : <p className="panel empty">Não há compromissos agendados depois dessa data.</p>}
  </section>;
}

export function Progress({ today }: { today: string }) {
  const value = Math.round(contractProgress(today) * 100);
  return <progress value={value} max={100} aria-label="Tempo de vigência do contrato decorrido" />;
}

export function contractCountdown(today: string) {
  return today > schedule.contract.end ? "Encerrado" : countdown(today, schedule.contract.end);
}

export function CountSummary({ today, next, onDates }: {
  today: string; next?: { title: string; date: string }; onDates: () => void;
}) {
  return <section>
    <SectionHeading title="Contagens"><button type="button" className="text-button" onClick={onDates}>Ver todas <Icon name="arrow" size={17} /></button></SectionHeading>
    <div className="panel divide">
      <div className="count-row">
        <div className="info-row"><span className="tile blue"><Icon name="flag" /></span>
          <span className="row-content"><strong>Fim do contrato</strong><span>{formatDate(schedule.contract.end, { day: "numeric", month: "short", year: "numeric" })}</span></span>
          <span className="row-date">{contractCountdown(today)}</span>
        </div>
        <Progress today={today} />
      </div>
      {next && <div className="info-row"><span className="tile amber"><Icon name="sparkles" /></span>
        <span className="row-content"><strong>{next.title}</strong><span>Próxima data importante</span></span>
        <span className="row-date">{countdown(today, next.date)}</span>
      </div>}
    </div>
  </section>;
}
