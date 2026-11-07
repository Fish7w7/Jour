# Histórico de versões

## 1.8.0

- Novo ícone do Jour com o enquadramento Retrato da foto Cat_Working, incluindo versões para a tela inicial, o navegador e as notificações.
- Ajustes → Aparência reúne os temas Claro, Escuro e Automático e as cores de destaque Original, Lavanda, Sálvia, Coral e Grafite.
- O cartão de Hoje ganhou os estilos Original, Aurora, Minimalista e Horizonte, com as cores de cada categoria preservadas.
- A aparência pode ser visualizada antes de salvar e restaurada separadamente dos outros dados. As preferências visuais funcionam offline e acompanham o backup JSON.
- A prévia destaca a cor escolhida e indica quando há mudanças pendentes. Aurora usa um degradê contínuo e Horizonte usa camadas curvas.

## 1.7.0

- Hora de sair em Ajustes → Notificações, com horários opcionais para Hospital e Senac de acordo com a programação oficial.
- O Jour usa o horário de São Paulo, evita um segundo aviso no mesmo horário para o mesmo compromisso e inclui as preferências no backup JSON.

## 1.6.0

- Rotina Aprendiz passa a se chamar Jour na agenda, na instalação e nas notificações, com o mesmo ícone azul de calendário.
- O novo endereço é `jour.portalnexo.workers.dev`. Os backups JSON das versões anteriores continuam compatíveis. Na nova origem, reinstale a PWA e ative as notificações novamente.

## 1.5.3

- O cartão Próximo compromisso destaca o dia da semana e a data, com instituição, horário e atividade abaixo.
- O cartão principal de um dia livre só oferece detalhes quando há informações adicionais, como aniversários, datas importantes ou ajustes pessoais.

## 1.5.2

- O cabeçalho da aba Hoje acompanha a data selecionada em Sua semana e oferece a ação Voltar para hoje.
- A seção A seguir mostra o próximo compromisso da data selecionada e informa quando não há compromissos posteriores.
- O seletor nativo de horário do lembrete respeita os limites do painel, com o rótulo acima do campo em telas estreitas.

## 1.5.1

- O painel de datas importantes destaca o nome e a data e reúne as preferências em Personalização e Notificações, com interruptores acessíveis.
- O horário e as orientações do lembrete aparecem quando a opção de aviso está ligada.

## 1.5.0

- A aba Datas agora mostra o progresso do contrato, acesso direto ao cadastro de aniversários e uma lista com as três próximas datas importantes.
- A lista completa de datas importantes ganhou uma visualização própria, com as próximas ocorrências agrupadas por mês e ano.

## 1.4.3

- Corrigido o contorno que aparecia ao voltar dos detalhes de um compromisso aberto por toque. A seleção mantém o fundo suave e o traço lateral, e a navegação por teclado mantém o contorno de foco.

## 1.4.2

- A Agenda da semana ganhou um cartão único, com data, destino, atividade e horário alinhados. O destaque da seleção ficou mais discreto, e o resumo do fim de semana livre passou a integrar o cartão.

## 1.4.1

- A Agenda da semana ocupa o lugar do resumo individual na visão semanal. A seleção acompanha a faixa dos sete dias e destaca a linha correspondente, inclusive em dias livres.
- Sábado e domingo sem atividades ou datas pessoais aparecem juntos como “Fim de semana livre”.
- Na grade mensal, os dias de outros meses continuam navegáveis e aparecem sem indicadores coloridos.

## 1.4.0

- Grade mensal mais limpa, com colunas de fim de semana em fundo neutro e indicadores apenas para atividades, feriados e datas pessoais.
- A data de hoje tem um contorno discreto, e a data selecionada recebe um fundo suave.
- Agenda semanal com horários, feriados, ajustes e datas pessoais, junto à faixa dos sete dias.
- Seleção direta de mês e ano pelo título do calendário.
- Resumo e detalhes do dia reorganizados, com as informações da agenda oficial em uma seção expansível.

## 1.3.0

- Verificação de novas versões ao abrir ou voltar ao app, com intervalo de 15 minutos entre verificações automáticas na mesma sessão.
- Cartão na aba Hoje e indicador em Ajustes quando uma atualização estiver pronta. A opção Depois oculta o cartão por 24 horas.
- A atualização aguarda a confirmação do usuário para recarregar a página e preserva os dados locais e as inscrições de notificações.
- Novidades e histórico de versões disponíveis em Ajustes → Sobre o aplicativo, inclusive offline.

## 1.2.0

- Convite discreto na aba Hoje para instalar o Rotina Aprendiz. O convite fica oculto no modo instalado e a dispensa é lembrada neste navegador.
- Guia visual de instalação no iPhone e no Android, disponível também em Ajustes. Quando o navegador oferece instalação nativa, o guia abre o diálogo do navegador.

## 1.1.0 — 2026-11-05

- Ajustes agrupados em Preferências e Aplicativo, com navegação interna, cabeçalho fixo e rolagem independente.
- Seleção de tema Claro, Escuro ou Automático e transições que respeitam a preferência por movimento reduzido.
- Tela de Notificações com os mesmos controles de inscrição, permissão, horários, sincronização e envio de teste.
- Tela de Instalação e offline com orientações conforme o dispositivo e estados de acesso offline e atualização.
- Tela de Dados e backup com exportação JSON, validação do arquivo e confirmação antes de restaurar.
- Tela Sobre com a versão do app, a agenda oficial em uso e as notas da versão.

## 1.0.0

- Versão inicial da agenda, com as abas Hoje, Calendário e Datas, dados pessoais locais, acesso offline e notificações Web Push.
