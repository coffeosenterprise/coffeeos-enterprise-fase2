import { Module } from '@nestjs/common';

/**
 * Bounded Context: Catalog
 * Responsabilidad: Productos, categorias, variantes, combos, modificadores, recetas
 *
 * Estado: Esqueleto (Fase 0). Sin entidades, controladores, servicios
 * ni DTOs -- se implementa en la fase que le corresponda segun el
 * Libro 05 (Plan Maestro de Desarrollo).
 *
 * Este modulo existe unicamente para materializar el limite de
 * dominio en la estructura de carpetas (Clean Architecture + DDD,
 * Libro 03/04) desde el inicio del repositorio.
 */
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
