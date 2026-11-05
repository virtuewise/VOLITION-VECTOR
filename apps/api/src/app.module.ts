import { Module } from '@nestjs/common';
import { IdentityModule } from '../../identity/identity.module';
import { OpportunityModule } from '../../opportunity/opportunity.module';
import { MarketplaceModule } from '../../marketplace/marketplace.module';
import { PaymentsModule } from '../../payments/payments.module';
import { IntelligenceModule } from '../../intelligence/intelligence.module';
import { CredentialsModule } from '../../credentials/credentials.module';
import { GovernanceModule } from '../../governance/governance.module';
import { CommunicationModule } from '../../communication/communication.module';

@Module({
  imports: [IdentityModule, OpportunityModule, MarketplaceModule, PaymentsModule, IntelligenceModule, CredentialsModule, GovernanceModule, CommunicationModule],
})
export class AppModule {}
