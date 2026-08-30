import { Injectable, NotFoundException } from '@nestjs/common';
import { CompanyRepository } from '../infrastructure/company.repository';
import { BranchRepository } from '../infrastructure/branch.repository';
import { TerminalRepository } from '../infrastructure/terminal.repository';
import { AuditService } from '../../../common/audit/audit.service';

/**
 * Organization Management (Libro 05, 10.2: Crear empresa, sucursal,
 * terminal, asignar usuario, configurar moneda/zona horaria/impuestos
 * base).
 */
@Injectable()
export class OrganizationService {
  constructor(
    private readonly companyRepository: CompanyRepository,
    private readonly branchRepository: BranchRepository,
    private readonly terminalRepository: TerminalRepository,
    private readonly auditService: AuditService,
  ) {}

  listCompanies() {
    return this.companyRepository.list();
  }

  listBranches(companyId: string) {
    return this.branchRepository.listByCompany(companyId);
  }

  listTerminals(branchId: string) {
    return this.terminalRepository.listByBranch(branchId);
  }

  async createCompany(
    actorId: string,
    data: { name: string; taxId?: string; currency?: string; timezone?: string },
  ) {
    const company = await this.companyRepository.create(data);
    await this.auditService.record({
      actorId,
      action: 'COMPANY_CREATED',
      entity: 'company',
      entityId: company.id,
      payload: data,
    });
    return company;
  }

  async createBranch(
    actorId: string,
    companyId: string,
    data: { name: string; address?: string },
  ) {
    const company = await this.companyRepository.findById(companyId);
    if (!company) throw new NotFoundException('Empresa no encontrada');

    const branch = await this.branchRepository.create(companyId, data);
    await this.auditService.record({
      actorId,
      action: 'BRANCH_CREATED',
      entity: 'branch',
      entityId: branch.id,
      payload: data,
    });
    return branch;
  }

  async createTerminal(
    actorId: string,
    branchId: string,
    data: { name: string; code: string },
  ) {
    const branch = await this.branchRepository.findById(branchId);
    if (!branch) throw new NotFoundException('Sucursal no encontrada');

    const terminal = await this.terminalRepository.create(branchId, data);
    await this.auditService.record({
      actorId,
      action: 'TERMINAL_CREATED',
      entity: 'terminal',
      entityId: terminal.id,
      payload: data,
    });
    return terminal;
  }

  async assignUserToBranch(actorId: string, branchId: string, userId: string) {
    const branch = await this.branchRepository.findById(branchId);
    if (!branch) throw new NotFoundException('Sucursal no encontrada');

    const assignment = await this.branchRepository.assignUser(branchId, userId);
    await this.auditService.record({
      actorId,
      action: 'USER_ASSIGNED_TO_BRANCH',
      entity: 'branch',
      entityId: branchId,
      payload: { userId },
    });
    return assignment;
  }
}
