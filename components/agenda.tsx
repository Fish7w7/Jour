"use client";

import { useEffect, useRef, useState } from "react";
import { resolveAppearance, type Appearance } from "../lib/appearance";
import { addDays, annualDate, capitalize, formatDate, monthGrid, moveMonth, saoPauloToday, week } from "../lib/dates";
import { notificationDefaults } from "../lib/notifications";
import { agendaDay, defaultDatePreference, defaultPreferences, nextCommitment, upcomingDates, type Birthday, type Preferences } from "../lib/schedule";
import { readPreferences, savePreferences } from "../lib/storage";
import { usePwa } from "../lib/use-pwa";
import { usePush } from "../lib/use-push";
import { BackupPanel } from "./backup-panel";
import { DatesView } from "./dates-view";
import { Icon } from "./icon";
import { InstallGuide, InstallInvite } from "./install-guide";
import { NotificationPanel } from "./notification-settings";
import { CalendarGrid, CalendarPeriodForm, DaySummary, WeeklyAgenda } from "./calendar-views";
import { CountSummary, Following, Hero, SectionHeading, WeekStrip } from "./schedule-views";
import { BirthdayForm, DateForm, Details, OverrideForm, Sheet } from "./sheets";
import { Settings, type Release } from "./settings";

const tabs = [
  { id: "today", name: "Hoje" },
  { id: "calendar", name: "Calendário" },
  { id: "dates", name: "Datas" },
] as const;
type Tab = typeof tabs[number]["id"];
type Overlay =
  | { kind: "settings" }
  | { kind: "install" }
  | { kind: "calendar-period" }
  | { kind: "details" | "override"; date: string }
  | { kind: "birthday"; birthday?: Birthday }
  | { kind: "important"; title: string; date: string };

export function Agenda({ initialToday, releases }: { initialToday: string; releases: Release[] }) {
  const [today, setToday] = useState(initialToday);
  const [tab, setTab] = useState<Tab>("today");
  const [weekDate, setWeekDate] = useState<string>();
  const [calendarDate, setCalendarDate] = useState<string>();
  const [mode, setMode] = useState<"month" | "week">("month");
  const [overlay, setOverlay] = useState<Overlay>();
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [appearancePreview, setAppearancePreview] = useState<Appearance>();
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState("");
  const mainRef = useRef<HTMLElement>(null);
  const savingRef = useRef(false);
  const pwa = usePwa();
  const push = usePush(pwa, preferences, ready);
  const appearance = resolveAppearance(preferences);
  const { theme, accent, cardStyle } = appearancePreview ?? appearance;

  useEffect(() => {
    const update = () => setToday(saoPauloToday());
    update();
    const timer = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pageshow", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("pageshow", update);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void readPreferences().then((stored) => {
      if (!active) return;
      if (stored) setPreferences(stored);
      setReady(true);
    }).catch(() => {
      if (active) setStorageError("O armazenamento local está indisponível neste navegador.");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const system = matchMedia("(prefers-color-scheme: dark)");
    const setColor = () => {
      const dark = theme === "dark" || (theme === "auto" && system.matches);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#10151f" : "#f7f8fb");
    };
    setColor();
    system.addEventListener("change", setColor);
    return () => system.removeEventListener("change", setColor);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
  }, [accent]);

  async function persist(update: (current: Preferences) => Preferences, close = true) {
    if (!ready || savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    setStorageError("");
    try {
      setPreferences(await savePreferences(update, defaultPreferences));
      if (close) setOverlay(undefined);
      return true;
    } catch {
      setStorageError("O navegador não conseguiu salvar a alteração. Tente novamente.");
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function navigate(target: Tab) {
    if (target === "today") setWeekDate(undefined);
    if (target === "calendar" && tab !== "calendar") {
      setCalendarDate(undefined);
      setMode("month");
    }
    setTab(target);
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }

  function openDetails(date: string) {
    setOverlay({ kind: "details", date });
  }

  const lookup = (date: string) => agendaDay(date, preferences.overrides);
  const birthdaysOn = (date: string) => preferences.birthdays.filter((birthday) =>
    birthday.showInCalendar && annualDate(Number(date.slice(0, 4)), birthday.month, birthday.day) === date &&
    (birthday.year === undefined || birthday.year <= Number(date.slice(0, 4))));
  const extraDatesOn = (date: string) => upcomingDates(date).filter((item) =>
    item.date === date && preferences.dates[item.title]?.showInCalendar !== false &&
    lookup(date).event.title !== item.title);
  const getDayDates = (date: string) => ({
    birthdayNames: birthdaysOn(date).map(({ name }) => name),
    extraDates: extraDatesOn(date).map(({ title }) => title),
  });
  const selectedWeek = weekDate && week(today).includes(weekDate) ? weekDate : today;
  const heroEntry = lookup(selectedWeek);
  const hasHeroDetails = tab === "today" && (
    heroEntry.event.kind !== "free" || heroEntry.personal || heroEntry.event.notes?.trim() ||
    birthdaysOn(selectedWeek).length > 0 || extraDatesOn(selectedWeek).length > 0
  );
  const isOtherDay = tab === "today" && selectedWeek !== today;
  const selectedCalendar = calendarDate ?? today;
  const calendarDays = tab !== "calendar" ? [] : mode === "month" ? monthGrid(selectedCalendar) : week(selectedCalendar);
  const important = upcomingDates(today);
  const blocked = !ready || saving;
  const closeOverlay = () => { if (!savingRef.current) setOverlay(undefined); };

  let sheetTitle = "";
  let sheetContent: React.ReactNode;
  if (overlay?.kind === "install") {
    sheetTitle = "Como instalar";
    sheetContent = <InstallGuide pwa={pwa} />;
  } else if (overlay?.kind === "calendar-period") {
    sheetTitle = "Escolher mês e ano";
    sheetContent = <CalendarPeriodForm selected={selectedCalendar} onSelect={(date) => {
      setCalendarDate(date);
      closeOverlay();
    }} />;
  } else if (overlay?.kind === "details" || overlay?.kind === "override") {
    const { date } = overlay;
    const entry = lookup(date);
    if (overlay.kind === "details") {
      sheetTitle = "Detalhes do dia";
      sheetContent = <Details entry={entry} {...getDayDates(date)} onEdit={() => setOverlay({ kind: "override", date })} />;
    } else {
      sheetTitle = entry.personal ? "Editar ajuste pessoal" : "Novo ajuste pessoal";
      sheetContent = <OverrideForm entry={entry} pending={blocked}
        onSave={(value) => void persist((current) => ({ ...current, overrides: { ...current.overrides, [date]: value } }))}
        onDelete={() => void persist((current) => {
          const overrides = { ...current.overrides };
          delete overrides[date];
          return { ...current, overrides };
        })} />;
    }
  } else if (overlay?.kind === "birthday") {
    const birthday = overlay.birthday;
    sheetTitle = birthday ? "Editar aniversário" : "Novo aniversário";
    sheetContent = <BirthdayForm birthday={birthday} today={today} pending={blocked}
      onSave={(value) => void persist((current) => ({
        ...current, birthdays: [...current.birthdays.filter(({ id }) => id !== value.id), value],
      }))}
      onDelete={() => void persist((current) => ({
        ...current, birthdays: current.birthdays.filter(({ id }) => id !== birthday?.id),
      }))} />;
  } else if (overlay?.kind === "important") {
    const { title } = overlay;
    sheetTitle = title;
    sheetContent = <DateForm date={overlay.date} today={today} pending={blocked} preference={preferences.dates[title] ?? defaultDatePreference}
      onSave={(value) => void persist((current) => ({ ...current, dates: { ...current.dates, [title]: value } }))} />;
  }

  return <div className="app-frame">
    <header className="app-header">
      <div className="brand"><img className="brand-icon" alt="" src="/icon-192.png" width="38" height="38" />
        <span><strong>Jour</strong></span>
      </div>
      <div className="flex items-center gap-3">
        {!pwa.online && <span className="offline-pill" role="status"><Icon name="offline" size={16} /> Offline</span>}
        <button type="button" className="icon-button settings-button" aria-label={pwa.updateAvailable ?
          "Abrir ajustes, atualização disponível" : "Abrir ajustes"} onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          setOverlay({ kind: "settings" });
        }}><Icon name="settings" />
          {pwa.updateAvailable && <span className="update-dot" aria-hidden="true" />}
        </button>
      </div>
    </header>
    <main className="app-main" id="main" ref={mainRef}>
      {tab !== "dates" && <div className="page-heading">
        <div className={isOtherDay ? "selected-day-heading" : undefined}>
          <p className="eyebrow">{tab === "today" ? formatDate(selectedWeek, { weekday: "long", day: "numeric", month: "long" })
            : "Programação da turma"}</p>
          {isOtherDay && <button type="button" className="text-button" onClick={() => setWeekDate(undefined)}>
            Voltar para hoje
          </button>}
        </div>
        <h1>{isOtherDay ? "Dia selecionado" : tabs.find(({ id }) => id === tab)?.name}</h1>
      </div>}
      {storageError && !overlay && <p role="alert" className="storage-alert">{storageError}</p>}
      {tab === "today" && <div className="today-layout">
        <div className="stack">
          <Hero today={today} selected={selectedWeek} entry={heroEntry} style={cardStyle}
            onDetails={hasHeroDetails ? () => openDetails(selectedWeek) : undefined} />
          <section>
            <SectionHeading title="Sua semana" />
            <WeekStrip selected={selectedWeek} today={today} onSelect={setWeekDate} lookup={lookup} />
          </section>
          {pwa.showUpdateCard && <section className="update-card" aria-labelledby="update-title">
            <span className="install-tile"><Icon name="download" size={21} /></span>
            <div className="update-copy">
              <h2 id="update-title">Atualização pronta</h2>
              <p role="status">{pwa.applyingUpdate ? "Atualizando o aplicativo…" : pwa.online ?
                "Carregue a nova versão da agenda quando quiser." : "Conecte-se à internet para atualizar."}</p>
              {pwa.updateError && <p role="alert" className="form-error">{pwa.updateError}</p>}
              <div className="update-actions">
                <button type="button" className="secondary-button" disabled={!pwa.onUpdate || blocked || push.busy || pwa.applyingUpdate}
                  onClick={pwa.onUpdate}>Atualizar agora</button>
                <button type="button" className="text-button" disabled={pwa.applyingUpdate}
                  onClick={pwa.deferUpdate}>Depois</button>
              </div>
            </div>
          </section>}
          {!pwa.updateAvailable && !pwa.applyingUpdate && pwa.updateError && <p role="alert" className="form-error">{pwa.updateError}</p>}
          {!pwa.showUpdateCard && pwa.showInstallInvite && <InstallInvite onOpen={() => setOverlay({ kind: "install" })}
            onDismiss={pwa.dismissInstallInvite} />}
        </div>
        <div className="stack">
          <Following entry={nextCommitment(selectedWeek, preferences.overrides)} onOpen={openDetails} />
          <CountSummary today={today} next={important[0]} onDates={() => navigate("dates")} />
        </div>
      </div>}
      {tab === "calendar" && <div className="calendar-layout" data-mode={mode}>
        <CalendarGrid dates={calendarDays}
          today={today} selected={selectedCalendar} mode={mode} lookup={lookup}
          hasPersonal={(date) => birthdaysOn(date).length > 0 || extraDatesOn(date).length > 0}
          onSelect={setCalendarDate}
          onMove={(step) => setCalendarDate((date) => mode === "month" ? moveMonth(date ?? today, step) : addDays(date ?? today, step * 7))}
          onMode={setMode}
          onPeriod={() => setOverlay({ kind: "calendar-period" })}
          onToday={() => setCalendarDate(undefined)} />
        {mode === "month" ? <DaySummary entry={lookup(selectedCalendar)} isToday={selectedCalendar === today}
          {...getDayDates(selectedCalendar)} onDetails={() => openDetails(selectedCalendar)} /> :
        <WeeklyAgenda dates={calendarDays} lookup={lookup} getDayDates={getDayDates}
          selected={selectedCalendar} onOpen={(date) => {
            setCalendarDate(date);
            openDetails(date);
          }} />}
      </div>}
      {tab === "dates" && <DatesView today={today} important={important} preferences={preferences}
        onDate={(item) => setOverlay({ kind: "important", ...item })} onBirthday={(birthday) => setOverlay({ kind: "birthday", birthday })} />}
    </main>
    <nav className="tab-dock" aria-label="Navegação principal">
      <div className="tab-bar">
        {tabs.map(({ id, name }) => <button type="button" key={id} aria-current={tab === id ? "page" : undefined}
          onClick={() => navigate(id)}><Icon name={id} size={23} /><span>{name}</span></button>)}
      </div>
    </nav>
    {overlay?.kind === "settings" ? <Settings appearance={appearance} previewKind={heroEntry.event.kind}
      onAppearancePreview={setAppearancePreview} pending={blocked || push.busy} pwa={pwa} releases={releases}
      pushSummary={push.status === "on" ? "Ativas" : push.status === "pending" || push.status === "revoking" ? "Pendentes" :
        push.support === "install" ? "Requer instalação" : push.support === "unsupported" || (!push.configLoading && !push.configured) ? "Indisponíveis" :
        push.status === "loading" || push.configLoading ? "Verificando" : push.status === "expired" ? "Inscrição expirada" : "Desativadas"}
      error={storageError} onClose={closeOverlay}
      onAppearanceSave={(value) => persist((current) => ({ ...current, ...value }), false)}
      notifications={<NotificationPanel push={push} online={pwa.online} pending={blocked} settings={preferences.notifications}
        onSave={(updates) => void persist((current) => ({
          ...current, notifications: { ...(current.notifications ?? notificationDefaults), ...updates },
        }), false)} />}
      backup={<BackupPanel today={today} preferences={preferences} pending={blocked}
        onImport={(imported) => persist(() => imported, false)} />} /> : overlay && <Sheet title={capitalize(sheetTitle)}
      variant={overlay.kind === "important" ? "important-date" : undefined} onClose={closeOverlay}>
      {storageError && <p role="alert" className="storage-alert">{storageError}</p>}
      {sheetContent}
    </Sheet>}
  </div>;
}
