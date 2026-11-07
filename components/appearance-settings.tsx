import { useEffect, useState } from "react";
import { accentColors, appearanceDefaults, cardStyles, themes, type Appearance } from "../lib/appearance";
import { kinds, type ScheduleKind } from "../lib/schedule";
import { Icon } from "./icon";

const themeIcons = { light: "sun", dark: "moon", auto: "appearance" } as const;
const examples: Record<ScheduleKind, string> = {
  hospital: "Atividade prática", senac: "Encontro no Senac", free: "Sem atividades", holiday: "Sem expediente",
};

function matches(left: Appearance, right: Appearance) {
  return left.theme === right.theme && left.accent === right.accent && left.cardStyle === right.cardStyle;
}

export function AppearanceSettings({ appearance, kind, onPreview, onSave, pending }: {
  appearance: Appearance; kind: ScheduleKind; onPreview: (value?: Appearance) => void;
  onSave: (value: Appearance) => Promise<boolean>; pending: boolean;
}) {
  const [draft, setDraft] = useState<Appearance>();
  const value = draft ?? appearance;
  const changed = !matches(value, appearance);
  useEffect(() => () => onPreview(undefined), [onPreview]);

  function preview(next: Appearance) {
    setDraft(next);
    onPreview(next);
  }

  return <form className="appearance-form" onSubmit={async (event) => {
    event.preventDefault();
    if (!changed || pending) return;
    if (await onSave(value)) {
      setDraft(undefined);
      onPreview(undefined);
    }
  }}>
    <section className="appearance-preview settings-card" aria-labelledby="appearance-preview-title">
      <div className="appearance-preview-heading">
        <h3 id="appearance-preview-title">Prévia</h3>
        <span className="appearance-preview-accent"><Icon name="today" size={15} /> Destaque</span>
      </div>
      <div className="hero-surface appearance-preview-card" data-kind={kind} data-card-style={value.cardStyle}>
        <span className="hero-icon"><Icon name={kinds[kind].icon} size={20} /></span>
        <div><strong>{kinds[kind].label}</strong><span>{examples[kind]}</span></div>
      </div>
    </section>
    <fieldset className="settings-group" disabled={pending}>
      <legend className="settings-caption">Tema do aplicativo</legend>
      <div className="settings-card appearance-themes">
        {(Object.keys(themes) as Appearance["theme"][]).map((key) => <label className="appearance-choice appearance-theme" key={key}>
          <input className="sr-only" type="radio" name="app-theme" checked={value.theme === key}
            onChange={() => preview({ ...value, theme: key })} />
          <Icon name={themeIcons[key]} size={17} /><span>{themes[key]}</span>
        </label>)}
      </div>
    </fieldset>
    <fieldset className="settings-group" disabled={pending}>
      <legend className="settings-caption">Cor de destaque</legend>
      <div className="settings-card appearance-accents">
        {(Object.keys(accentColors) as Appearance["accent"][]).map((key) => <label className="appearance-choice accent-option" key={key}>
          <input className="sr-only" type="radio" name="app-accent" checked={value.accent === key}
            onChange={() => preview({ ...value, accent: key })} />
          <span className="accent-swatch" data-accent={key} aria-hidden="true"><Icon name="check" size={17} /></span>
          <span>{accentColors[key]}</span>
        </label>)}
      </div>
    </fieldset>
    <fieldset className="settings-group" disabled={pending}>
      <legend className="settings-caption">Estilo do cartão</legend>
      <div className="appearance-styles">
        {(Object.keys(cardStyles) as Appearance["cardStyle"][]).map((key) => <label className="settings-card appearance-choice appearance-style" key={key}>
          <input className="sr-only" type="radio" name="app-card-style" checked={value.cardStyle === key}
            onChange={() => preview({ ...value, cardStyle: key })} />
          <span className="hero-surface appearance-style-swatch" data-kind={kind} data-card-style={key} aria-hidden="true" />
          <span className="appearance-style-label">{cardStyles[key]}<Icon name="check" size={16} /></span>
        </label>)}
      </div>
    </fieldset>
    <div className="appearance-actions">
      <p role="status">
        <Icon name={changed ? "info" : "check"} size={15} />
        {changed ? "Alterações ainda não salvas." : "Aparência salva neste dispositivo."}
      </p>
      <button className="primary-button" disabled={pending || !changed}>Salvar aparência</button>
      <button type="button" className="text-button" disabled={pending || matches(value, appearanceDefaults)}
        onClick={() => preview(appearanceDefaults)}>Restaurar padrão</button>
    </div>
  </form>;
}
