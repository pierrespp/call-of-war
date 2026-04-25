import { storageService } from '../services/storageService';

// Script para fazer upload das imagens locais para o Firebase
// Execute este script uma vez para migrar todas as imagens

const ROLE_IMAGES = [
  'assalto',
  'granadeiro',
  'médico',
  'sniper',
  'suporte'
];

export const migrateImagesToFirebase = async () => {
  console.log('Iniciando migração de imagens para Firebase...');

  for (const roleName of ROLE_IMAGES) {
    try {
      const imagePath = `/roles/${roleName}.png`;
      const response = await fetch(imagePath);
      const blob = await response.blob();
      const file = new File([blob], `${roleName}.png`, { type: 'image/png' });

      console.log(`Fazendo upload de ${roleName}...`);
      const url = await storageService.uploadRoleImage(file, roleName);

      await storageService.saveTokenData({
        id: `role-${roleName}`,
        name: roleName.charAt(0).toUpperCase() + roleName.slice(1),
        imageUrl: url,
        type: 'role',
        uploadedAt: Date.now()
      });

      console.log(`✓ ${roleName} enviado com sucesso`);
    } catch (error) {
      console.error(`✗ Erro ao enviar ${roleName}:`, error);
    }
  }

  console.log('Migração concluída!');
};

// Função para verificar quais imagens já estão no Firebase
export const checkFirebaseImages = async () => {
  try {
    const tokens = await storageService.getAllTokens();
    const roleTokens = tokens.filter(t => t.type === 'role');

    console.log('Imagens no Firebase:');
    roleTokens.forEach(token => {
      console.log(`- ${token.name}: ${token.imageUrl}`);
    });

    const missingRoles = ROLE_IMAGES.filter(
      role => !roleTokens.some(t => t.name.toLowerCase() === role)
    );

    if (missingRoles.length > 0) {
      console.log('\nImagens faltando:');
      missingRoles.forEach(role => console.log(`- ${role}`));
    } else {
      console.log('\n✓ Todas as imagens estão no Firebase!');
    }

    return { existing: roleTokens, missing: missingRoles };
  } catch (error) {
    console.error('Erro ao verificar imagens:', error);
    return { existing: [], missing: ROLE_IMAGES };
  }
};
