import { AuthService } from '../auth/authService.js';
import { LegacyDataMigrationService } from './legacyDataMigrationService.js';
import { LibraryService } from './libraryService.js';
import { ContestDataMigrationService } from './contestDataMigrationService.js';
import { ContestSummaryService } from './contestSummaryService.js';

export const authService = new AuthService({
  migrationService: new LegacyDataMigrationService(),
});

export const libraryService = new LibraryService({ summaries: new ContestSummaryService() });
export const contestDataMigrationService = new ContestDataMigrationService();
