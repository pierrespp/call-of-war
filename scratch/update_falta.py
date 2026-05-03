import sys

path = r'expertise\FALTA_FAZER.md'
content = open(path, 'r', encoding='utf-8').read()

new_log = """
## Reestruturação do Combate e Armas (Concluídos)
- [x] **Movimento Fatiado**: Removido o travamento da ação de movimento. Soldados agora podem se mover, atirar/agir, e usar o resto do seu movimento dentro do mesmo turno (ação `move` só trava se o movimento extra também esgotar, ou mantido ativo pelo front).
- [x] **Sistema de Duas Armas**:
  - Refatoração dos tipos `Unit` e `DraftUnit` para `primaryWeapon`, `secondaryWeapon`, `primaryAmmoInMag`, `secondaryAmmoInMag`, `activeWeaponSlot`.
  - Inclusão das armas de 0 pontos ("Pistola Padrão", "Revólver Padrão") garantindo que todos os soldados tenham duas opções de armamento no Draft.
  - Backend reescrito para utilizar os novos atributos durante o cálculo de Draft, Spawn, Tiros, Reload, PVESpawns e Overwatches.
  - Implementada a rota `/switch-weapon` que consome uma *Ação Tática*.
- [x] **Reclassificação de Ações**:
  - Abrir/Fechar Portas (`toggle-door`) agora custa uma *Ação Tática* (T) em vez de Intervenção.
  - Granada de Fumaça (`smoke-grenade`) agora custa uma *Ação Tática* (T) em vez de Intervenção.
  - Tooltips e interações na UI (`App.tsx`) ajustadas para informar as ações corretamente e destravar os botões baseados na Ação Tática disponível.
"""

if 'Reestruturação do Combate e Armas' not in content:
    content += new_log
    open(path, 'w', encoding='utf-8').write(content)
    print('FALTA_FAZER.md updated')
