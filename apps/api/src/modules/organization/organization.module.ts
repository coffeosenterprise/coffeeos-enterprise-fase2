import { Module } from '@nestjs/common';
import { OrganizationController } from './presentation/organization.controller';
import { OrganizationService } from './application/organization.service';
import { CompanyRepository } from './infrastructure/company.repository';
import { BranchRepository } from './infrastructure/branch.repository';
import { TerminalRepository } from './infrastructure/terminal.repository';

/**
 * Bounded Context: Organization Management
 * Fase 1 (Libro 05, 10.2).
 */
@Module({
  controllers: [OrganizationController],
  providers: [
    OrganizationService,
    CompanyRepository,
    BranchRepository,
    TerminalRepository,
  ],
})
export class OrganizationModule {}
