import React, { useState } from 'react';
import { ImageUploadManager } from './ImageUploadManager';
import { useImages } from '@/src/core/contexts/ImageContext';
import { useMaps } from '@/src/core/contexts/MapContext';
import { CLASSES } from '@/src/core/data/constants';

export const AdminPanel = ({ onClose }: { onClose: () => void }) => {
  const { mapImages } = useImages();
  const { maps, refreshMaps } = useMaps();

  // Map Registration State
  const [mapId, setMapId] = useState('');
  const [mapName, setMapName] = useState('');
  const [gridWidth, setGridWidth] = useState(40);
  const [gridHeight, setGridHeight] = useState(40);
  const [mapImagePath, setMapImagePath] = useState('');
  const [registeringMap, setRegisteringMap] = useState(false);
  const [deletingMap, setDeletingMap] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Role Form State
  const [roleName, setRoleName] = useState('');
  const [roleImageUrl, setRoleImageUrl] = useState('');
  const [registeringRole, setRegisteringRole] = useState(false);

  const handleRegisterRoleImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName || !roleImageUrl) {
      alert('Preencha o Nome da Classe e a URL da Imagem');
      return;
    }
    setRegisteringRole(true);
    try {
      // Create a manual token mapping for Role
      const slug = roleName.toLowerCase().replace(/\s+/g, '-').replace("médico", "medico");
      const { storageService } = await import('@/src/core/services/storageService');
      await storageService.saveTokenData({
        id: `role-${slug}`,
        name: roleName,
        imageUrl: roleImageUrl,
        type: 'role',
        uploadedAt: Date.now()
      });
      alert(`✓ Imagem da Classe '${roleName}' vinculada com sucesso!`);
      setRoleName('');
      setRoleImageUrl('');
    } catch (err) {
      alert('Erro: ' + (err instanceof Error ? err.message : 'Erro desconhecido'));
    } finally {
      setRegisteringRole(false);
    }
  };

  const handleUploadSuccess = (url: string, type: string) => {
    if (type === 'map') {
      setMapImagePath(url);
    } else if (type === 'role') {
      setRoleImageUrl(url);
    }
  };

  const handleSelectMapImage = (key: string, url: string) => {
    setMapId(key);
    setMapName(key.replace(/_/g, ' '));
    setMapImagePath(url);
    setIsEditing(false);
  };

  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSelectExistingMap = (selectedMapId: string) => {
    setConfirmDelete(false);
    if (!selectedMapId) {
      setMapId('');
      setMapName('');
      setMapImagePath('');
      setGridWidth(40);
      setGridHeight(40);
      setIsEditing(false);
      return;
    }
    const map = maps[selectedMapId];
    if (map) {
      setMapId(map.id);
      setMapName(map.name);
      setMapImagePath(map.imagePath);
      setGridWidth(map.gridWidth || 40);
      setGridHeight(map.gridHeight || 40);
      setIsEditing(true);
    }
  };

  const handleDeleteMap = async () => {
    if (!mapId) return;
    
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setDeletingMap(true);
    try {
      const resp = await fetch(`/api/ai-maps/${mapId}`, {
        method: 'DELETE',
      });
      if (!resp.ok) throw new Error('Erro ao excluir mapa');
      
      await refreshMaps();
      // Clear fields
      setMapId('');
      setMapName('');
      setMapImagePath('');
      setIsEditing(false);
      setConfirmDelete(false);
      alert('🗑️ Mapa excluído com sucesso!');
    } catch (err) {
      alert('Erro ao excluir: ' + (err instanceof Error ? err.message : 'Erro desconhecido'));
    } finally {
      setDeletingMap(false);
    }
  };

  const handleRegisterMap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mapId || !mapName || !mapImagePath) {
      alert('Preencha os campos obrigatórios (ID, Nome e Caminho da Imagem)');
      return;
    }
    setRegisteringMap(true);
    try {
      const resp = await fetch('/api/ai-maps/register-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: mapId.toLowerCase().replace(/\s+/g, '_'),
          name: mapName,
          imagePath: mapImagePath,
          gridWidth,
          gridHeight,
          coverData: {}
        }),
      });
      if (!resp.ok) throw new Error('Erro ao salvar mapa');

      // Sincronizar também com a coleção 'tokens' para o useFirebaseImages detectar
      const { storageService } = await import('@/src/core/services/storageService');
      await storageService.saveTokenData({
        id: mapId.toLowerCase().replace(/\s+/g, '_'),
        name: mapName,
        imageUrl: mapImagePath,
        type: 'map',
        uploadedAt: Date.now()
      });

      alert('✓ Mapa registrado e sincronizado com sucesso!');
      await refreshMaps();
      // Clear fields
      setMapId('');
      setMapName('');
      setMapImagePath('');
    } catch (err) {
      alert('Erro: ' + (err instanceof Error ? err.message : 'Erro desconhecido'));
    } finally {
      setRegisteringMap(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 border border-neutral-700 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-neutral-900 border-b border-neutral-700 p-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-neutral-200">Painel de Administração</h2>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
            <h3 className="text-xl font-bold text-neutral-200 mb-4">Upload Manual</h3>
            <p className="text-neutral-400 text-sm mb-4">
              Faça upload de novas imagens (Roles, Mapas ou Tokens).<br/>
              <i>Dica: Após o upload de um mapa, a URL será copiada automaticamente pro campo de registro. E para roles, a URL da classe será preenchida.</i>
            </p>
            <ImageUploadManager onUploadSuccess={handleUploadSuccess} />
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
            <h3 className="text-xl font-bold text-neutral-200 mb-4">Vincular Token de Classe (Role)</h3>
            <p className="text-neutral-400 text-sm mb-4">
              Vincule manualmente o nome de uma Classe (ex: Assalto, Sniper) a uma URL de imagem (ex: Cloudinary).
            </p>
            <form onSubmit={handleRegisterRoleImage} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Nome da Classe</label>
                  <select
                    value={roleName}
                    onChange={e => setRoleName(e.target.value)}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-indigo-500"
                  >
                    <option value="">-- Selecione uma Classe --</option>
                    <optgroup label="USA">
                      {Object.values(CLASSES).filter(c => (c as any).faction === 'USA').map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="TR">
                      {Object.values(CLASSES).filter(c => (c as any).faction === 'TR').map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="PVE">
                      {Object.values(CLASSES).filter(c => (c as any).faction !== 'USA' && (c as any).faction !== 'TR').map(c => (
                        <option key={c.id} value={c.id}>{c.name} (PVE)</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">URL da Imagem</label>
                  <input
                    type="text"
                    value={roleImageUrl}
                    onChange={e => setRoleImageUrl(e.target.value)}
                    placeholder="https://res.cloudinary.com/..."
                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={registeringRole}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-700 text-white font-bold py-2 px-4 rounded transition-colors"
              >
                {registeringRole ? 'Salvando...' : 'Vincular Imagem à Classe'}
              </button>
            </form>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
            <h3 className="text-xl font-bold text-neutral-200 mb-4">Registrar ou Editar Mapa</h3>
            <p className="text-neutral-400 text-sm mb-4">
              Crie uma entrada de mapa jogável ligada a uma imagem ou altere as propriedades de um mapa existente.
            </p>
            
            <div className="mb-6 bg-neutral-900 border border-neutral-700 p-4 rounded-lg">
              <label className="block text-xs font-bold text-neutral-400 uppercase mb-2">Editar Mapa Existente</label>
              <select
                onChange={(e) => handleSelectExistingMap(e.target.value)}
                className="w-full bg-neutral-800 border border-neutral-600 rounded px-3 py-2 text-white outline-none focus:border-indigo-500"
              >
                <option value="">-- Selecione para editar ou deixe vazio para criar novo --</option>
                {(Object.values(maps) as any[]).map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.name} ({map.id})
                  </option>
                ))}
              </select>
            </div>

            {Object.keys(mapImages).length > 0 && (
              <div className="mb-6 bg-neutral-900 border border-neutral-700 p-4 rounded-lg">
                <label className="block text-xs font-bold text-neutral-400 uppercase mb-2">Seleção Rápida de Mapas Uploaded</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {Object.entries(mapImages).map(([key, url]) => (
                    <button
                      key={key}
                      onClick={() => handleSelectMapImage(key, url as string)}
                      className="border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 hover:border-indigo-500 rounded p-2 text-xs text-left transition-colors truncate"
                      type="button"
                    >
                      <div className="font-bold text-white truncate" title={key}>{key}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleRegisterMap} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">ID do Mapa (slug)</label>
                  <input
                    type="text"
                    value={mapId}
                    onChange={e => setMapId(e.target.value)}
                    placeholder="ex: desert_storm"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Nome de Exibição</label>
                  <input
                    type="text"
                    value={mapName}
                    onChange={e => setMapName(e.target.value)}
                    placeholder="ex: Tempestade no Deserto"
                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">URL da Imagem / Caminho</label>
                <input
                  type="text"
                  value={mapImagePath}
                  onChange={e => setMapImagePath(e.target.value)}
                  placeholder="https://firebasestorage... ou /maps/meu_mapa.jpg"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-indigo-500"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Largura (Grades)</label>
                  <input
                    type="number"
                    value={gridWidth}
                    onChange={e => setGridWidth(parseInt(e.target.value))}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-neutral-500 uppercase mb-1">Altura (Grades)</label>
                  <input
                    type="number"
                    value={gridHeight}
                    onChange={e => setGridHeight(parseInt(e.target.value))}
                    className="w-full bg-neutral-900 border border-neutral-700 rounded px-3 py-2 text-white outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={registeringMap || deletingMap}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-neutral-700 text-white font-bold py-2 px-4 rounded transition-colors"
                >
                  {registeringMap ? (isEditing ? 'Salvando...' : 'Registrando...') : (isEditing ? 'Salvar Alterações' : 'Registrar Mapa')}
                </button>
                
                {isEditing && (
                  <button
                    type="button"
                    onClick={handleDeleteMap}
                    disabled={registeringMap || deletingMap}
                    className={`bg-red-600 hover:bg-red-700 disabled:bg-neutral-700 text-white font-bold py-2 px-6 rounded transition-colors ${confirmDelete ? 'ring-4 ring-red-400 animate-pulse' : ''}`}
                  >
                    {deletingMap ? 'Excluindo...' : (confirmDelete ? 'CONFIRMAR EXCLUSÃO?' : 'Excluir Mapa')}
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-6">
            <h3 className="text-xl font-bold text-neutral-200 mb-4">Informações</h3>
            <div className="space-y-2 text-sm text-neutral-400">
              <p>• As imagens são salvas no Firebase Storage</p>
              <p>• Os metadados são salvos no Firestore</p>
              <p>• O sistema usa fallback para imagens locais se não encontrar no Firebase</p>
              <p>• Tokens e configurações também são salvos automaticamente</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
