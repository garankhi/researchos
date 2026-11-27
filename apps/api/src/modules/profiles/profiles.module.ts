import { Module } from '@nestjs/common';
import { OpenAlexModule } from '../openalex/openalex.module.js';
import { OnboardingFinalizeService } from './onboarding-finalize.service.js';
import { ProfilesController } from './profiles.controller.js';
import { ProfilesService } from './profiles.service.js';

/**
 * Module managing researcher profile operations.
 *
 * The onboarding finalize service lives here because the onboarding is
 * part of the profile: it writes the profile, the account and the
 * research interests. It imports the OpenAlex module because the
 * finalize pulls the works the researcher decided on.
 */
@Module({
  imports: [OpenAlexModule],
  controllers: [ProfilesController],
  providers: [ProfilesService, OnboardingFinalizeService],
  exports: [ProfilesService],
})
export class ProfilesModule {}
