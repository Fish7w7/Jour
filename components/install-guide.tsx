import type { ComponentProps, ReactNode } from "react";
import type { usePwa } from "../lib/use-pwa";
import { Icon } from "./icon";

type Pwa = ReturnType<typeof usePwa>;
type Step = { icon: ComponentProps<typeof Icon>["name"]; title: string; detail: ReactNode };

export function InstallInvite({ onOpen, onDismiss }: {
  onOpen: () => void; onDismiss: () => void;
}) {
  return <section className="install-invite" aria-labelledby="install-invite-title">
    <span className="install-tile"><Icon name="phone" size={21} /></span>
    <div className="install-invite-copy">
      <h2 id="install-invite-title">Sua rotina na tela inicial</h2>
      <p>Instale o Jour para abrir a agenda com um toque.</p>
      <button type="button" className="text-button install-link" aria-haspopup="dialog" onClick={(event) => {
        event.currentTarget.focus({ preventScroll: true });
        onOpen();
      }}>Como instalar <Icon name="right" size={14} /></button>
    </div>
    <button type="button" className="icon-button install-dismiss" aria-label="Dispensar convite de instalação" onClick={onDismiss}>
      <Icon name="close" size={17} />
    </button>
  </section>;
}

const iosSteps: Step[] = [
  { icon: "share", title: "Compartilhar", detail: "Com a agenda aberta no Safari, toque em Compartilhar. Se o ícone estiver no menu da página, abra esse menu primeiro." },
  { icon: "plus", title: "Adicionar à Tela de Início", detail: <>Role as opções e escolha <strong>Adicionar à Tela de Início</strong>.</> },
  { icon: "home", title: "Abra pelo ícone", detail: <>Se aparecer <strong>Abrir como App da Web</strong>, deixe a opção ativada. Toque em <strong>Adicionar</strong> e abra o app pela Tela de Início.</> },
];

const androidSteps: Step[] = [
  { icon: "more", title: "Abra o menu do Chrome", detail: "Com a agenda aberta, toque nos três pontos ao lado da barra de endereço." },
  { icon: "download", title: "Instale o aplicativo", detail: <>Toque em <strong>Instalar e criar atalho</strong> e depois em <strong>Instalar</strong>. A opção também pode aparecer como <strong>Adicionar à tela inicial</strong>.</> },
  { icon: "home", title: "Abra pelo ícone", detail: "Confirme a instalação e procure o Jour na tela inicial ou na lista de apps." },
];

export function InstallGuide({ pwa }: { pwa: Pwa }) {
  if (pwa.installed) return <p>O Jour está aberto como aplicativo instalado.</p>;
  if (pwa.installAccepted) return <p role="status">Instalação aceita. Abra o Jour pelo ícone do aplicativo.</p>;

  const ios = pwa.installPlatform === "ios";
  const android = pwa.installPlatform === "android";
  if (!ios && pwa.onInstall) {
    return <div className="install-guide">
      <p>Confirme a instalação na janela do navegador. Depois, abra a agenda pelo ícone do Jour.</p>
      <button type="button" className="secondary-button" onClick={pwa.onInstall}><Icon name="download" size={19} /> Instalar aplicativo</button>
    </div>;
  }

  if (!ios && !android) {
    return <p>Se o seu navegador oferecer instalação, procure <strong>Instalar aplicativo</strong> no menu ou na barra de endereço.</p>;
  }

  return <ol className="install-steps" role="list">
    {(ios ? iosSteps : androidSteps).map(({ icon, title, detail }, index) => <li key={title}>
      <span className="install-tile"><Icon name={icon} size={20} /></span>
      <div><strong className="install-step-title">{index + 1}. {title}</strong><p>{detail}</p></div>
    </li>)}
  </ol>;
}
