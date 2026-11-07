import { useState, type ComponentProps, type ReactNode } from "react";
import appPackage from "../package.json";
import { themes, type Appearance } from "../lib/appearance";
import { formatDate } from "../lib/dates";
import { schedule, type ScheduleKind } from "../lib/schedule";
import type { usePwa } from "../lib/use-pwa";
import type { usePush } from "../lib/use-push";
import { AppearanceSettings } from "./appearance-settings";
import { Icon } from "./icon";
import { InstallGuide } from "./install-guide";
import { Sheet } from "./sheets";

type Pwa = ReturnType<typeof usePwa>;
type Push = ReturnType<typeof usePush>;
export type Release = { title: string; notes: string[] };
type IconName = ComponentProps<typeof Icon>["name"];
const version = appPackage.version;
const pages = {
  appearance: { title: "Aparência", icon: "appearance", tint: "blue" },
  notifications: { title: "Notificações", icon: "bell", tint: "amber" },
  installation: { title: "Instalação e offline", icon: "phone", tint: "slate" },
  backup: { title: "Dados e backup", icon: "archive", tint: "purple" },
  about: { title: "Sobre o aplicativo", icon: "info", tint: "blue" },
} as const;
type Page = keyof typeof pages;

function notificationSummary({ status, support, configLoading, configured }: Push) {
  if (status === "on") return "Ativas";
  if (status === "pending" || status === "revoking") return "Pendentes";
  if (support === "install") return "Requer instalação";
  if (support === "unsupported" || (!configLoading && !configured)) return "Indisponíveis";
  if (status === "loading" || configLoading) return "Verificando";
  return status === "expired" ? "Inscrição expirada" : "Desativadas";
}

function SettingsRow({ page, detail, onClick }: { page: Page; detail?: string; onClick: () => void }) {
  const { title, icon, tint } = pages[page];
  return <li><button type="button" className="settings-row" id={`settings-link-${page}`} onClick={onClick}>
    <span className={`settings-tile ${tint}`}><Icon name={icon} size={19} /></span>
    <span className="settings-row-label"><strong>{title}</strong>{detail && <span>{detail}</span>}</span>
    <Icon name="right" size={16} className="settings-chevron" />
  </button></li>;
}

export function Settings({ appearance, previewKind, onAppearancePreview, onAppearanceSave, pending, pwa, push, notifications, backup, error, onClose, releases }: {
  appearance: Appearance; previewKind: ScheduleKind; onAppearancePreview: (value?: Appearance) => void;
  onAppearanceSave: (value: Appearance) => Promise<boolean>; pending: boolean;
  pwa: Pwa; push: Push; notifications: ReactNode; backup: ReactNode; error: string; onClose: () => void; releases: Release[];
}) {
  const [page, setPage] = useState<Page>();
  const [lastPage, setLastPage] = useState<Page>();
  function open(next: Page) {
    setLastPage(next);
    setPage(next);
  }
  return <Sheet settings title={page ? pages[page].title : "Ajustes"} onClose={onClose}
    onBack={page ? () => setPage(undefined) : undefined}
    returnFocusId={!page && lastPage ? `settings-link-${lastPage}` : undefined}>
    {error && <p role="alert" className="storage-alert">{error}</p>}
    <div className="settings-content" key={page ?? "index"}>
      {!page && <>
        <section className="settings-group" aria-labelledby="settings-preferences">
          <h3 id="settings-preferences" className="settings-caption">Preferências</h3>
          <ul className="settings-card">
            <SettingsRow page="appearance" detail={themes[appearance.theme]} onClick={() => open("appearance")} />
            <SettingsRow page="notifications" detail={notificationSummary(push)} onClick={() => open("notifications")} />
          </ul>
        </section>
        <section className="settings-group" aria-labelledby="settings-app">
          <h3 id="settings-app" className="settings-caption">Aplicativo</h3>
          <ul className="settings-card">
            <SettingsRow page="installation" detail={pwa.updateAvailable ? "Atualização disponível" :
              pwa.installed || pwa.installAccepted ? "App instalado" : undefined} onClick={() => open("installation")} />
            <SettingsRow page="backup" onClick={() => open("backup")} />
            <SettingsRow page="about" detail={`Versão ${version}`} onClick={() => open("about")} />
          </ul>
        </section>
      </>}
      {page === "appearance" && <AppearanceSettings appearance={appearance} kind={previewKind}
        onPreview={onAppearancePreview} onSave={onAppearanceSave} pending={pending} />}
      {page === "notifications" && notifications}
      {page === "installation" && <Installation pwa={pwa} pending={pending} />}
      {page === "backup" && backup}
      {page === "about" && <About releases={releases} />}
    </div>
  </Sheet>;
}

function SettingsSection({ title, icon, children }: { title: string; icon?: IconName; children: ReactNode }) {
  return <section className="settings-card settings-block">
    <h3>{icon && <Icon name={icon} size={20} />} {title}</h3>
    {children}
  </section>;
}

function Installation({ pwa, pending }: { pwa: Pwa; pending: boolean }) {
  return <>
    <SettingsSection title="Instalação" icon="phone">
      <InstallGuide pwa={pwa} />
    </SettingsSection>
    <SettingsSection title="Acesso offline" icon="offline">
      <p role="status">{pwa.offlineState === "ready" ? "A agenda está pronta para uso offline neste dispositivo." :
        pwa.offlineState === "checking" ? "Verificando se a agenda está pronta para uso offline…" :
        "A agenda ainda não está disponível offline. Abra a versão publicada em um navegador compatível, com conexão, para prepará-la."}</p>
      {!pwa.online && <p className="muted">Você está sem conexão. A sincronização de notificações e as atualizações dependem da internet.</p>}
    </SettingsSection>
    <SettingsSection title="Atualizações" icon="download">
      <p role="status">{pwa.applyingUpdate ? "Atualizando o aplicativo…" :
        pwa.updateAvailable ? pwa.online ? "Uma atualização está pronta para ser aplicada." :
        "Conecte-se à internet para aplicar a atualização." :
        "O aplicativo verifica novas versões quando está conectado."}</p>
      {pwa.updateError && <p role="alert" className="form-error">{pwa.updateError}</p>}
      {(pwa.updateAvailable || pwa.applyingUpdate) && <button type="button" className="secondary-button"
        disabled={pending || pwa.applyingUpdate || !pwa.onUpdate} onClick={pwa.onUpdate}>Atualizar agora</button>}
    </SettingsSection>
  </>;
}

function About({ releases }: { releases: Release[] }) {
  const date = (value: string) => formatDate(value, { day: "2-digit", month: "2-digit", year: "numeric" });
  return <>
    <div className="settings-card settings-brand">
      {/* The manifest icon is a static asset and must work offline. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" src="/icon-192.png" width="60" height="60" />
      <div><h3>Jour</h3><p>Versão {version}</p></div>
    </div>
    <SettingsSection title="Agenda oficial" icon="calendar">
      <p>{schedule.source}</p>
      <dl className="settings-facts">
        <div><dt>Período</dt><dd>{date(schedule.contract.start)} a {date(schedule.contract.end)}</dd></div>
        <div><dt>Versão dos dados</dt><dd>{schedule.version}</dd></div>
        <div><dt>Atualizada em</dt><dd>{date(schedule.updatedAt)}</dd></div>
      </dl>
    </SettingsSection>
    <SettingsSection title={`Novidades da versão ${version}`} icon="sparkles">
      <ul className="settings-release-notes">
        {releases[0]?.notes.map((note) => <li key={note}>{note}</li>)}
      </ul>
      {releases.length > 1 && <details className="release-history">
        <summary>Histórico de versões</summary>
        {releases.slice(1).map(({ title, notes }) => <div key={title}>
          <strong>{title}</strong>
          <ul className="settings-release-notes">{notes.map((note) => <li key={note}>{note}</li>)}</ul>
        </div>)}
      </details>}
    </SettingsSection>
  </>;
}
