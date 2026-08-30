import { Module } from '@nestjs/common';

/**
 * Bounded Context: Production Management
 * Responsabilidad: Recetas, ordenes de produccion, lotes, mermas
 *
 * Estado: Esqueleto (Fase 0). Sin entidades, controladores, servicios
 * ni DTOs -- se implementa en la fase que le corresponda segun el
 * Libro 05 (Plan Maestro de Desarrollo).
 *
 * Este modulo existe unicamente para materializar el limite de
 * dominio en la estructura de carpetas (Clean Architecture + DDD,
 * Libro 03/04) desde el inicio del repositorio.
 */
@Module({})
export class ProductionModule {}
