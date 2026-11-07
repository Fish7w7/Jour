import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { capitalize, countdown, longDate } from "../lib/dates";
import { eventHours, kinds, schedule, validBirthday, type Birthday, type DatePreference, type Override, type ScheduleKind } from "../lib/schedule";
import { personalReminderTime, validTime } from "../lib/notifications";
import { PersonalReminder } from "./notification-settings";
import { Icon } from "./icon";
import { CalendarDayDates } from "./calendar-views";
import type { Entry } from "./schedule-views";

const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
const birthdayMonths = Array.from({ length: 12 }, (_, index) =>
  capitalize(monthFormat.format(new Date(Date.UTC(2000, index, 1))).replace(".", "")));

export function Sheet({ title, children, onClose, settings, onBack, returnFocusId, variant }: {
  title: string; children: ReactNode; onClose: () => void; settings?: boolean; onBack?: () => void; returnFocusId?: string;
  variant?: "important-date";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
    const target = returnFocusId ? document.getElementById(returnFocusId) : heading.current;
    target?.focus();
  }, [title, returnFocusId]);
  const datePanel = variant === "important-date";
  return <dialog ref={ref} className={settings ? "sheet settings-sheet" : datePanel ? "sheet date-preferences-sheet" : "sheet"} aria-labelledby="sheet-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="sheet-content">
      <div className="sheet-heading">
        {onBack && <button type="button" className="icon-button settings-back" aria-label="Voltar para Ajustes" onClick={onBack}><Icon name="left" /></button>}
        {datePanel ? <div className="date-preferences-title">
          <span className="date-preferences-icon"><Icon name="calendar" size={21} /></span>
          <div><p className="eyebrow">Data importante</p><h2 id="sheet-title" ref={heading} tabIndex={-1}>{title}</h2></div>
        </div> : <h2 id="sheet-title" ref={heading} tabIndex={-1}>{title}</h2>}
        <button type="button" className="icon-button" aria-label="Fechar painel" onClick={onClose}><Icon name="close" /></button>
      </div>
      {settings ? <div ref={body} className="settings-scroll">{children}</div> : children}
    </div>
  </dialog>;
}

export function Details({ entry, birthdayNames, extraDates, onEdit }: {
  entry: Entry; birthdayNames: string[]; extraDates: string[]; onEdit: () => void;
}) {
  const { event, official, personal } = entry;
  const hours = eventHours(event);
  return <div className="day-details">
    <div className="day-overview">
      <time className="summary-date" dateTime={event.date}>{capitalize(longDate(event.date))}</time>
      {(official || personal) && event.title !== kinds[event.kind].label &&
        <p className="day-kind" data-kind={event.kind}>{kinds[event.kind].label}</p>}
      <h3>{event.title}</h3>
      {hours && <p className="day-hours"><Icon name="today" size={17} />{hours}</p>}
      {personal && <p className="muted">Ajuste pessoal</p>}
    </div>
    <CalendarDayDates birthdayNames={birthdayNames} extraDates={extraDates} />
    {event.notes && <div className="day-notes"><h4>Observações</h4><p>{event.notes}</p></div>}
    <button type="button" className="secondary-button" onClick={onEdit}><Icon name="edit" size={18} /> {personal ? "Editar ajuste pessoal" : "Criar ajuste pessoal"}</button>
    <details className="day-source">
      <summary>Informações da agenda</summary>
      <dl className="detail-list">
        <div><dt>Origem</dt><dd>{personal ? "Ajuste pessoal" : official ? schedule.source : "Fora do período da agenda"}</dd></div>
        {official && <div><dt>{personal ? "Programação oficial" : "Descrição original"}</dt><dd>{personal ? official.title : official.original}</dd></div>}
      </dl>
    </details>
  </div>;
}

export function OverrideForm({ entry, onSave, onDelete, pending }: {
  entry: Entry; onSave: (value: Override) => void; onDelete: () => void; pending: boolean;
}) {
  const event = entry.event;
  const [kind, setKind] = useState(event.kind);
  const [error, setError] = useState("");
  const timed = kind === "hospital" || kind === "senac";
  function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const fields = new FormData(formEvent.currentTarget);
    const title = String(fields.get("title")).trim();
    const notes = String(fields.get("notes")).trim();
    const startTime = String(fields.get("startTime") ?? "");
    const endTime = String(fields.get("endTime") ?? "");
    if (!title) {
      setError("Preencha o título da atividade.");
      return;
    }
    if (timed && (!startTime || !endTime || startTime >= endTime)) {
      setError("O horário final precisa ser depois do início.");
      return;
    }
    onSave({ kind, title, ...(notes && { notes }), ...(timed && { startTime, endTime }) });
  }
  return <form className="form-stack" onSubmit={submit}>
    <p>{capitalize(longDate(event.date))}. O ajuste aparece apenas neste dispositivo.</p>
    <div className="field"><label htmlFor="override-kind">Tipo</label><select id="override-kind" value={kind} onChange={(e) => setKind(e.target.value as ScheduleKind)}>
      {Object.entries(kinds).map(([key, meta]) => <option value={key} key={key}>{meta.label}</option>)}
    </select></div>
    <label>Título<input required maxLength={100} name="title" defaultValue={event.title} /></label>
    {timed && <div className="form-columns">
      <label>Início<input required name="startTime" type="time" defaultValue={event.startTime ?? "13:00"} /></label>
      <label>Fim<input required name="endTime" type="time" defaultValue={event.endTime ?? "17:00"} /></label>
    </div>}
    <label>Observações<textarea name="notes" maxLength={500} rows={3} defaultValue={event.notes} /></label>
    {error && <p role="alert" className="form-error">{error}</p>}
    <button className="primary-button" disabled={pending}>Salvar ajuste</button>
    {entry.personal && <button className="text-button danger" type="button" disabled={pending} onClick={onDelete}>Restaurar programação oficial</button>}
  </form>;
}

export function BirthdayForm({ birthday, today, onSave, onDelete, pending }: {
  birthday?: Birthday; today: string; onSave: (birthday: Birthday) => void; onDelete: () => void; pending: boolean;
}) {
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get("name")).trim();
    const day = Number(fields.get("day"));
    const month = Number(fields.get("month"));
    const year = fields.get("year") ? Number(fields.get("year")) : undefined;
    const reminderTime = fields.get("reminder-time") ?? birthday?.reminderTime ?? personalReminderTime;
    if (!name || !validBirthday(month, day, year, today)) {
      setError(!name ? "Preencha o nome." : "Informe uma data de nascimento válida.");
      return;
    }
    if (!validTime(reminderTime)) {
      setError("Informe um horário válido para o lembrete.");
      return;
    }
    onSave({
      id: birthday?.id ?? crypto.randomUUID(), name, day, month, year,
      showInCalendar: fields.has("calendar"), reminder: fields.has("reminder"), reminderTime,
    });
  }
  return <form className="form-stack" onSubmit={submit}>
    <label>Nome<input name="name" required maxLength={80} defaultValue={birthday?.name} /></label>
    <div className="form-columns birthday-fields">
      <label>Dia<input name="day" type="number" inputMode="numeric" required min={1} max={31} defaultValue={birthday?.day} /></label>
      <div className="field"><label htmlFor="birthday-month">Mês</label><select id="birthday-month" name="month" defaultValue={birthday?.month ?? 1}>
        {birthdayMonths.map((month, index) => <option key={index} value={index + 1}>{month}</option>)}
      </select></div>
      <label>Ano (opcional)<input name="year" type="number" inputMode="numeric" min={1} max={Number(today.slice(0, 4))} defaultValue={birthday?.year} /></label>
    </div>
    <p className="muted">Aniversários de 29 de fevereiro aparecem em 28 de fevereiro nos anos não bissextos.</p>
    <label className="check-row"><input name="calendar" type="checkbox" defaultChecked={birthday?.showInCalendar ?? true} /> Mostrar no meu calendário</label>
    <PersonalReminder checked={birthday?.reminder ?? false} time={birthday?.reminderTime ?? personalReminderTime} name="aniversário" />
    {error && <p role="alert" className="form-error">{error}</p>}
    <button className="primary-button" disabled={pending}>Salvar aniversário</button>
    {birthday && (confirmDelete
      ? <div className="form-columns"><button className="text-button danger" type="button" disabled={pending} onClick={onDelete}>Confirmar exclusão</button><button className="text-button" type="button" onClick={() => setConfirmDelete(false)}>Cancelar</button></div>
      : <button className="text-button danger" type="button" onClick={() => setConfirmDelete(true)}>Excluir aniversário</button>)}
  </form>;
}

export function DateForm({ date, today, preference, pending, onSave }: {
  date: string; today: string; preference: DatePreference; pending: boolean; onSave: (value: DatePreference) => void;
}) {
  const [error, setError] = useState("");
  const [reminder, setReminder] = useState(preference.reminder);
  const [time, setTime] = useState(preference.reminderTime ?? personalReminderTime);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const reminderTime = fields.get("reminder-time") ?? preference.reminderTime ?? personalReminderTime;
    if (!validTime(reminderTime)) {
      setError("Informe um horário válido para o lembrete.");
      return;
    }
    onSave({ favorite: fields.has("favorite"), showInCalendar: fields.has("calendar"), reminder: fields.has("reminder"), reminderTime });
  }

  return <form className="form-stack date-preferences-form" onSubmit={submit}>
    <div className="date-preferences-meta">
      <time dateTime={date}>{capitalize(longDate(date))}</time>
      <span>{countdown(today, date)}</span>
    </div>
    <fieldset className="date-options">
      <legend>Personalização</legend>
      <div className="date-option-card">
        <DateSwitch name="favorite" icon="dates" defaultChecked={preference.favorite}>Marcar como favorita</DateSwitch>
        <DateSwitch name="calendar" icon="calendar" defaultChecked={preference.showInCalendar}>Mostrar no meu calendário</DateSwitch>
        <p className="date-calendar-note">A programação oficial continua visível no calendário.</p>
      </div>
    </fieldset>
    <fieldset className="date-options">
      <legend>Notificações</legend>
      <div className="date-option-card">
        <DateSwitch name="reminder" icon="bell" checked={reminder} onChange={setReminder}>Lembrar no dia</DateSwitch>
        {reminder && <div className="date-reminder-details">
          <label>Horário do lembrete
            <span className="date-reminder-time">
              <input name="reminder-time" type="time" required value={time} onChange={(event) => setTime(event.target.value)} />
            </span>
          </label>
          <p>Horário de São Paulo. O aviso depende da ativação das notificações em Ajustes.</p>
        </div>}
      </div>
    </fieldset>
    {error && <p role="alert" className="form-error">{error}</p>}
    <button type="submit" className="primary-button date-save" disabled={pending}><Icon name="check" size={18} /> Salvar preferências</button>
  </form>;
}

function DateSwitch({ name, icon, children, defaultChecked, checked, onChange }: {
  name: string; icon: "dates" | "calendar" | "bell"; children: ReactNode;
  defaultChecked?: boolean; checked?: boolean; onChange?: (value: boolean) => void;
}) {
  return <label className="date-switch">
    <Icon name={icon} size={18} />
    <span>{children}</span>
    <input type="checkbox" role="switch" name={name} className="sr-only" defaultChecked={defaultChecked} checked={checked}
      onChange={onChange && ((event) => onChange(event.target.checked))} />
    <span className="date-switch-track" aria-hidden="true" />
  </label>;
}
