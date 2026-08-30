import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsHexColor,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateCategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class RecipeIngredientDto {
  @IsUUID()
  ingredientId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;
}

export class CreateModifierOptionDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  name!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  priceDelta!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients?: RecipeIngredientDto[];
}

export class CreateModifierGroupDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minSelections?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxSelections?: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateModifierOptionDto)
  options!: CreateModifierOptionDto[];
}

export class CreateProductDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeIngredientDto)
  ingredients?: RecipeIngredientDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateModifierGroupDto)
  modifierGroups?: CreateModifierGroupDto[];
}

export class UpdateProductDto extends CreateProductDto {}
