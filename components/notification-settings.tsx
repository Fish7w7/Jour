import { useState, type FormEvent } from "react";
import { notificationDefaults, validTime, type DepartureReminder, type NotificationSettings } from "../lib/notifications";
import type { usePush } from "../lib/use-push";
import { Icon } from "./icon";

type Push = ReturnType<typeof usePush>;

export function NotificationPanel({ push, online, settings, pending, onSave }: {
  push: Push; online: boolean; settings?: NotificationSettings; pending: boolean; onSave: (settings: Partial<NotificationSettings>) => void;
}) {
  const { support, status, configured, configLoading, permission, busy } = push;
  const capabilities = support === "supported" && configured;
  const { departure, ...regularSettings } = settings ?? notificationDefaults;
  const permitted = permission === "granted" ? "Permitida" : permission === "denied" ? "Bloqueada" : "Ainda não solicitada";
  const display = {
    loading: "Verificando a inscrição.",
    off: "Notificações desativadas.",
    on: "Notificações ativas neste dispositivo.",
    pending: "Alterações pendentes de sincronização. Os últimos horários confirmados podem continuar ativos.",
    revoking: "Cancelamento pendente. A inscrição será removida quando o serviço estiver acessível.",
    expired: "A inscrição expirou. Ative novamente para receber avisos.",
  }[status];
  return <>
    <section className="settings-card settings-block" aria-labelledby="notification-settings">
    <h3 id="notification-settings"><Icon name="bell" size={20} /> Neste dispositivo</h3>
    {support === "checking" && <p role="status">Verificando suporte a notificações…</p>}
    {support === "install" && <p>Instale o Jour na Tela de Início e abra pelo ícone para habilitar os avisos no iPhone ou iPad (iOS/iPadOS 16.4 ou posterior).</p>}
    {support === "unsupported" && <p>As notificações Web Push estão indisponíveis neste navegador ou contexto. Use um navegador compatível em HTTPS.</p>}
    {support === "supported" && <>
      <p className="muted">Permissão do navegador: {permitted}.</p>
      {permission === "denied" && <p>Para voltar a receber avisos, libere a permissão nos ajustes do navegador ou em Ajustes → Notificações no iPhone.</p>}
      {!online && <p>Você está offline. Alterações locais serão enviadas quando abrir o app com conexão.</p>}
      {online && !configured && <p>{configLoading ? "Verificando o serviço de notificações…" : "O serviço de notificações está indisponível."}</p>}
    </>}
    {(capabilities || status === "pending" || status === "revoking" || status === "expired") && <p role="status">{display}</p>}
    {push.canEnable && <>
      <p>Receba avisos com o app fechado. Para aniversários, o servidor recebe dia, mês, horário e um identificador aleatório. Nomes e anos ficam neste dispositivo.</p>
      <button type="button" className="primary-button" disabled={busy} onClick={push.enable}>Ativar notificações</button>
    </>}
    {capabilities && status === "on" && <button type="button" className="secondary-button" disabled={busy || !online} onClick={push.sendTest}>Enviar notificação de teste</button>}
    {capabilities && online && status === "pending" &&
      <button type="button" className="text-button justify-self-start" disabled={busy} onClick={push.retry}>Sincronizar agora</button>}
    {push.hasDevice && status !== "revoking" &&
      <button type="button" className="text-button danger justify-self-start" disabled={busy} onClick={push.disable}>Desativar notificações</button>}
    {status === "revoking" && online &&
      <button type="button" className="text-button justify-self-start" disabled={busy} onClick={push.disable}>Tentar cancelar novamente</button>}
    {push.message && <p role="status">{push.message}</p>}
    </section>
    {capabilities && <>
      <DepartureSettings key={JSON.stringify(departure)} settings={departure}
        pending={pending || busy} onSave={(departure) => onSave({ departure })} />
      <ReminderSettings key={JSON.stringify(regularSettings)} settings={regularSettings}
        pending={pending || busy} onSave={onSave} />
    </>}
  </>;
}

function DepartureSettings({ settings, pending, onSave }: {
  settings?: DepartureReminder; pending: boolean; onSave: (settings: DepartureReminder) => void;
}) {
  const [enabled, setEnabled] = useState(settings?.enabled ?? false);
  const [hospital, setHospital] = useState(settings?.hospital ?? "");
  const [senac, setSenac] = useState(settings?.senac ?? "");
  const [error, setError] = useState("");
  const changed = enabled !== (settings?.enabled ?? false) ||
    hospital !== (settings?.hospital ?? "") || senac !== (settings?.senac ?? "");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ([hospital, senac].some((time) => time !== "" && !validTime(time))) {
      setError("Informe horários válidos ou deixe o campo vazio.");
      return;
    }
    setError("");
    onSave({ enabled, ...(hospital && { hospital }), ...(senac && { senac }) });
  }

  return <form className="settings-card settings-block departure-form" aria-labelledby="departure-settings" onSubmit={submit}>
    <h3 id="departure-settings"><Icon name="arrow" size={20} /> Hora de sair</h3>
    <p className="muted">Escolha quando receber o aviso nos dias de Hospital ou Senac da agenda oficial. Horários de São Paulo.</p>
    <label className="date-switch departure-switch">
      <span>Ativar Hora de sair</span>
      <input type="checkbox" role="switch" className="sr-only" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
      <span className="date-switch-track" aria-hidden="true" />
    </label>
    {enabled && <>
      {([
        ["Hospital", "hospital", hospital, setHospital],
        ["Senac", "senac", senac, setSenac],
      ] as const).map(([label, id, time, setTime]) => <div className="departure-time" key={id}>
        <label htmlFor={`departure-${id}`}><span className="sr-only">Horário de saída para </span>{label}</label>
        <div className="departure-control">
          <div className="departure-clock">
            <input id={`departure-${id}`} type="time" value={time} aria-describedby="departure-help"
              onChange={(event) => setTime(event.target.value)} />
          </div>
          {time && <button className="icon-button departure-clear" type="button" aria-label={`Limpar horário de saída para ${label}`}
            onClick={() => setTime("")}><Icon name="close" size={17} /></button>}
        </div>
      </div>)}
      <p id="departure-help" className="muted">Deixe um horário vazio para pular esse destino. Se o horário coincidir com outro aviso do mesmo compromisso, você recebe o aviso habitual.</p>
    </>}
    {error && <p role="alert" className="form-error">{error}</p>}
    <button type="submit" className="secondary-button" disabled={pending || !changed}>Salvar Hora de sair</button>
  </form>;
}

function ReminderSettings({ settings, pending, onSave }: {
  settings: NotificationSettings; pending: boolean; onSave: (settings: NotificationSettings) => void;
}) {
  const [relative, setRelative] = useState(settings.before.relative);
  const [error, setError] = useState("");
  const rules = [
    ["tomorrow", "Compromisso de amanhã"],
    ["today", "Compromisso de hoje"],
    ["before", "Aviso antes da entrada"],
    ["weekly", "Resumo semanal (domingo)"],
  ] as const;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const [tomorrow, today, before, weekly] = rules.map(([key]) => ({
      enabled: data.has(key), time: String(data.get(key + "-time") ?? settings[key].time),
    }));
    if (![tomorrow, today, before, weekly].every(({ time }) => validTime(time))) {
      setError("Informe horários válidos para os lembretes.");
      return;
    }
    setError("");
    onSave({ tomorrow, today, before: { ...before, relative }, weekly });
  }

  return <form className="settings-card settings-block form-stack reminder-form" aria-labelledby="reminder-settings" onSubmit={submit}>
    <h3 id="reminder-settings"><Icon name="today" size={20} /> Horários dos lembretes</h3>
    <p className="muted">Horários de São Paulo. Os lembretes de aniversários e datas importantes são configurados na aba Datas.</p>
    {rules.map(([key, label]) => <div className="reminder-rule" key={key}>
      <label className="check-row"><input type="checkbox" name={key} defaultChecked={settings[key].enabled} /> {label}</label>
      {(key !== "before" || !relative) && <input aria-label={`Horário: ${label}`} name={key + "-time"} type="time" required defaultValue={settings[key].time} />}
      {key === "before" && <label className="check-row reminder-relative">
        <input type="checkbox" checked={relative} onChange={(event) => setRelative(event.target.checked)} /> Uma hora antes do início (normalmente 12h)
      </label>}
    </div>)}
    {error && <p role="alert" className="form-error">{error}</p>}
    <button className="secondary-button" disabled={pending}>Salvar horários</button>
  </form>;
}

export function PersonalReminder({ checked, time, name }: { checked: boolean; time: string; name: string }) {
  const [enabled, setEnabled] = useState(checked);
  const [reminderTime, setReminderTime] = useState(time);
  return <div className="form-stack">
    <label className="check-row"><input name="reminder" type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Lembrar no dia</label>
    {enabled && <label>Horário do lembrete<input name="reminder-time" type="time" required value={reminderTime}
      onChange={(event) => setReminderTime(event.target.value)} /></label>}
    <p className="muted">O aviso de {name} usa o horário de São Paulo e depende da ativação das notificações em Ajustes.</p>
  </div>;
}
