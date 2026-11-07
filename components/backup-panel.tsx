import { useRef, useState } from "react";
import { backupLimit, exportBackup, readBackup } from "../lib/backup";
import type { Preferences } from "../lib/schedule";
import { Icon } from "./icon";

export function BackupPanel({ today, preferences, pending, onImport }: {
  today: string; preferences: Preferences; pending: boolean; onImport: (preferences: Preferences) => Promise<boolean>;
}) {
  const [candidate, setCandidate] = useState<Preferences>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const readVersion = useRef(0);
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportBackup(preferences)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `jour-${today}.json`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  async function load(file: File | undefined) {
    const version = ++readVersion.current;
    setCandidate(undefined);
    setMessage("");
    setError("");
    if (!file) return;
    try {
      if (file.size > backupLimit) throw new Error("O backup deve ter até 1 MB.");
      const preferences = readBackup(await file.text(), today);
      if (version === readVersion.current) setCandidate(preferences);
    } catch (error) {
      if (version === readVersion.current) setError(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
    }
  }

  return <>
    <section className="settings-card settings-block">
      <h3><Icon name="download" size={20} /> Exportar</h3>
      <p>Salve uma cópia das preferências, dos aniversários e dos ajustes pessoais. Guarde o arquivo em local privado.</p>
      <button type="button" className="secondary-button" disabled={pending} onClick={download}>Exportar backup JSON</button>
    </section>
    <section className="settings-card settings-block">
      <h3><Icon name="upload" size={20} /> Restaurar</h3>
      <p>Escolha um backup JSON. As notificações continuam vinculadas a este dispositivo.</p>
      <label className="secondary-button backup-picker">
        <input className="sr-only" type="file" accept=".json,application/json" disabled={pending}
          onChange={(event) => { void load(event.target.files?.[0]); event.target.value = ""; }} />
        Importar backup JSON
      </label>
    {candidate && <div className="backup-confirm">
      <h4 role="status">Backup válido. Restaurar dados?</h4>
      <p>A restauração substituirá as preferências e os dados pessoais deste dispositivo.</p>
      <div className="form-columns">
        <button type="button" className="secondary-button danger" disabled={pending} onClick={() => {
          void onImport(candidate).then((saved) => {
            if (saved) { setCandidate(undefined); setMessage("Backup importado."); }
          });
        }}>Substituir dados</button>
        <button type="button" className="text-button" disabled={pending} onClick={() => setCandidate(undefined)}>Cancelar</button>
      </div>
    </div>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    </section>
  </>;
}
