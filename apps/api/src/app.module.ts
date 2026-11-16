import { Module } from "@nestjs/common";
import { IdentityModule } from "../identity/identity.module";
import { OpportunityModule } from "../opportunity/opportunity.module";
import { MarketplaceModule } from "../marketplace/marketplace.module";
import { PaymentsModule } from "../payments/payments.module";
import { IntelligenceModule } from "../intelligence/intelligence.module";
import { CredentialsModule } from "../credentials/credentials.module";
import { GovernanceModule } from "../governance/governance.module";
import { CommunicationModule } from "../communication/communication.module";
import { TrustModule } from "../trust/trust.module.js";
import { HealthModule } from "./modules/health/health.module.js";

@Module({
  imports: [
    HealthModule,
    IdentityModule,
    OpportunityModule,
    MarketplaceModule,
    PaymentsModule,
    IntelligenceModule,
    CredentialsModule,
    GovernanceModule,
    CommunicationModule,
    TrustModule,
  ],
})
export class AppModule {}
