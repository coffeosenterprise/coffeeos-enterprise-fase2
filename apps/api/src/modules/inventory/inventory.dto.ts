import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateIngredientDto {
  @IsUUID()
  branchId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  minQuantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  initialUnitCost?: number;
}

export class RestockDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  @Max(1_000_000_000)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  unitCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  note?: string;
}

export class InventoryMovementDto {
  @IsString()
  @IsIn(['entrada', 'salida', 'ajuste', 'merma'])
  type!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  @Max(1_000_000_000)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  unitCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  note?: string;
}

export class UpdateInventoryStockDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  unit!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  quantity!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000_000)
  minQuantity!: number;
}
