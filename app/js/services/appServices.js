import { AuthService } from '../auth/authService.js';
import { CloudAwareAuthService } from '../auth/cloudAuthService.js';
import { LegacyDataMigrationService } from './legacyDataMigrationService.js';
import { LibraryService } from './libraryService.js';
import { ContestDataMigrationService } from './contestDataMigrationService.js';
import { ContestSummaryService } from './contestSummaryService.js';
import { ProgressRepository } from '../repositories/progressRepository.js';
import { isCloudEnabled } from '../config/cloudConfig.js';
import { hybridProgressAdapter } from '../supabase/hybridProgressAdapter.js';
import * as localDb from '../core/db.js';

const localAuth = new AuthService({
  migrationService: new LegacyDataMigrationService(),
});

/** Auth: Supabase em CLOUD_MODE=hybrid; caso contrário IndexedDB local. */
export const authService = new CloudAwareAuthService({ localAuth });

export const libraryService = new LibraryService({ summaries: new ContestSummaryService() });
export const contestDataMigrationService = new ContestDataMigrationService();

/**
 * ProgressRepository com adapter híbrido quando a nuvem está ativa.
 * Leituras sempre do IndexedDB; escritas espelham no Supabase.
 */
export function createAppProgressRepository() {
  const adapter = isCloudEnabled() ? hybridProgressAdapter : localDb;
  return new ProgressRepository({ adapter });
}

export const appProgressRepository = createAppProgressRepository();
