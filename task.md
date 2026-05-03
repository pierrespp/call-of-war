# Tarefas: Implementar Botão "Sair da Partida"

Implementação de um botão sutil de saída no HUD de batalha com confirmação de segurança.

- [x] 1. Atualizar `src/components/BattleSidebar.tsx`
    - [x] Adicionar `onLeave` às props.
    - [x] Importar ícone `LogOut` de `lucide-react`.
    - [x] Adicionar botão sutil no cabeçalho da sidebar.
- [x] 2. Atualizar `src/App.tsx`
    - [x] Implementar `handleLeaveMatch` com `window.confirm`.
    - [x] Passar `handleLeaveMatch` para o componente `BattleSidebar`.
- [x] 3. Validar funcionalidade
    - [x] Verificar se o botão aparece em batalha.
    - [x] Verificar se a confirmação aparece.
    - [x] Verificar se retorna ao lobby e limpa a sessão corretamente.

---
**Status:** Concluído.
