import { useState } from 'react';
import { useStorage } from '../hooks/useStorage';

export const ImageUploadManager = () => {
  const { uploading, error, uploadRoleImage, uploadMapImage, uploadCustomToken } = useStorage();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<'role' | 'map' | 'custom'>('role');
  const [itemName, setItemName] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setUploadSuccess(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !itemName) {
      alert('Por favor, selecione um arquivo e digite um nome');
      return;
    }

    try {
      if (uploadType === 'role') {
        await uploadRoleImage(selectedFile, itemName);
      } else if (uploadType === 'map') {
        await uploadMapImage(selectedFile, itemName);
      } else {
        await uploadCustomToken(selectedFile, itemName);
      }
      setUploadSuccess(true);
      setSelectedFile(null);
      setItemName('');
    } catch (err) {
      console.error('Erro no upload:', err);
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-700 rounded-lg p-6 max-w-md">
      <h2 className="text-xl font-bold text-neutral-200 mb-4">Upload de Imagens</h2>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            Tipo de Upload
          </label>
          <select
            value={uploadType}
            onChange={(e) => setUploadType(e.target.value as any)}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-neutral-200"
          >
            <option value="role">Imagem de Role/Classe</option>
            <option value="map">Imagem de Mapa</option>
            <option value="custom">Token Customizado</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            Nome do Item
          </label>
          <input
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder={uploadType === 'role' ? 'Ex: Assalto' : uploadType === 'map' ? 'Ex: Dust2' : 'Ex: Meu Token'}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-neutral-200"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            Selecionar Arquivo
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-neutral-200 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-indigo-600 file:text-white file:cursor-pointer hover:file:bg-indigo-700"
          />
        </div>

        {selectedFile && (
          <div className="text-sm text-neutral-400">
            Arquivo selecionado: {selectedFile.name}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading || !selectedFile || !itemName}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-700 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded transition-colors"
        >
          {uploading ? 'Enviando...' : 'Fazer Upload'}
        </button>

        {error && (
          <div className="bg-red-900/20 border border-red-700 rounded p-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {uploadSuccess && (
          <div className="bg-green-900/20 border border-green-700 rounded p-3 text-green-400 text-sm">
            Upload realizado com sucesso!
          </div>
        )}
      </div>

      <div className="mt-6 pt-6 border-t border-neutral-700">
        <p className="text-xs text-neutral-500">
          As imagens serão salvas no Firebase Storage e ficarão disponíveis para uso em todas as sessões.
        </p>
      </div>
    </div>
  );
};
