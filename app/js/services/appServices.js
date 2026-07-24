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
import { isLocalDevelopment, requiresRemoteBackend } from '../config/appEnvironment.js';
import { SupabaseEntitlementRepository } from '../supabase/entitlementRepository.js';
import { CheckoutService, CheckoutUnavailableGateway, LocalDemoCheckoutGateway } from './checkoutService.js';

const localAuth = new AuthService({
  migrationService: isLocalDevelopment() ? new LegacyDataMigrationService() : null,
});

/** Auth: Supabase em CLOUD_MODE=hybrid; caso contrário IndexedDB local. */
export const authService = new CloudAwareAuthService({ localAuth });

const commercialMode = requiresRemoteBackend();
const entitlementRepository = commercialMode ? new SupabaseEntitlementRepository() : undefined;
const checkout = new CheckoutService({
  gateway: commercialMode ? new CheckoutUnavailableGateway() : new LocalDemoCheckoutGateway(),
});

export const libraryService = new LibraryService({
  ...(entitlementRepository ? { entitlements: entitlementRepository } : {}),
  checkout,
  summaries: new ContestSummaryService(),
});
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
