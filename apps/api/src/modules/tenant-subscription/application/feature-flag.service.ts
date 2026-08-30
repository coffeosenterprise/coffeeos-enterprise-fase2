import { Injectable } from '@nestjs/common';
import { FeatureFlagRepository } from '../infrastructure/feature-flag.repository';

/**
 * ADR-009: Feature Flags centralizados. Ningun modulo debe embeber
 * condicionales de plan (`if plan === 'enterprise'`) -- todos
 * consultan este servicio.
 */
@Injectable()
export class FeatureFlagService {
  constructor(private readonly repository: FeatureFlagRepository) {}

  async isEnabled(key: string): Promise<boolean> {
    const flags = await this.repository.list();
    return flags.find((f) => f.key === key)?.enabled ?? false;
  }

  list() {
    return this.repository.list();
  }

  set(key: string, enabled: boolean) {
    return this.repository.set(key, enabled);
  }
}
