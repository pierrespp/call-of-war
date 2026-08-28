import sys

app_path = 'src/App.tsx'
content = open(app_path, 'r', encoding='utf-8').read()

content = content.replace(
    'No carregador: ${selectedUnit.ammoInMag}',
    'No carregador: ${selectedUnit.activeWeaponSlot === \'secondary\' ? selectedUnit.secondaryAmmoInMag : selectedUnit.primaryAmmoInMag}'
)
content = content.replace(
    '{selectedUnit.ammoInMag}/{w?.reload ?? 0}',
    '{selectedUnit.activeWeaponSlot === \'secondary\' ? selectedUnit.secondaryAmmoInMag : selectedUnit.primaryAmmoInMag}/{w?.reload ?? 0}'
)
content = content.replace(
    '(selectedUnit.ammoInMag / w.reload)',
    '((selectedUnit.activeWeaponSlot === \'secondary\' ? selectedUnit.secondaryAmmoInMag : selectedUnit.primaryAmmoInMag) / w.reload)'
)
content = content.replace(
    'selectedUnit.ammoInMag <= 0 ||',
    '(selectedUnit.activeWeaponSlot === \'secondary\' ? selectedUnit.secondaryAmmoInMag : selectedUnit.primaryAmmoInMag) <= 0 ||'
)
content = content.replace(
    'selectedUnit.ammoInMag < 2',
    '(selectedUnit.activeWeaponSlot === \'secondary\' ? selectedUnit.secondaryAmmoInMag : selectedUnit.primaryAmmoInMag) < 2'
)

switch_btn = """                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!selectedUnit.actions.tactical) {
                        alert("Sem Ação Tática disponível para trocar de arma.");
                        return;
                      }
                      await apiService.post(`/rooms/${roomId}/switch-weapon`, {
                        unitId: selectedUnit.id,
                        playerToken: token,
                      }).then(() => fetchRoomState(roomId));
                    }}
                    disabled={!selectedUnit.actions.tactical}
                    className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-white font-bold py-2 px-3 text-xs rounded border border-neutral-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    Trocar Arma
                  </button>
"""
if 'Trocar Arma' not in content:
    content = content.replace(
        '<button\n                    onClick={() => setTargetMode("shoot")}',
        switch_btn + '                  <button\n                    onClick={() => setTargetMode("shoot")}'
    )

open(app_path, 'w', encoding='utf-8').write(content)
print('App.tsx updated')
