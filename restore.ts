import { execSync } from 'child_process';
try {
  execSync('git checkout src/lib/firebase.ts src/lib/firebase-server.ts src/services/gameService.ts src/services/storageService.ts package.json firebase-applet-config.json firebase-blueprint.json firestore.rules src/contexts/MapContext.tsx server.ts src/contexts/ImageContext.tsx src/hooks/useFirebaseImages.ts src/hooks/useStorage.ts src/components/ImageUploadManager.tsx src/utils/migrateImages.ts seed_maps.ts src/components/AdminPanel.tsx', { stdio: 'inherit' });
  console.log('Restored');
} catch (e) {
  console.error(e);
}
