import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../common/auth/permissions.guard';
import { RequirePermissions } from '../../common/auth/permissions.decorator';
import { CatalogService } from './catalog.service';
import {
  CreateCategoryDto,
  CreateProductDto,
  ReorderCategoriesDto,
  UpdateCategoryDto,
  UpdateProductDto,
} from './catalog.dto';

@Controller('catalog')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  @RequirePermissions('sales.create')
  list() {
    return this.catalogService.list();
  }

  @Post('categories')
  @RequirePermissions('catalog.manage')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalogService.createCategory(dto);
  }

  @Patch('categories/reorder')
  @RequirePermissions('catalog.manage')
  reorderCategories(@Body() dto: ReorderCategoriesDto) {
    return this.catalogService.reorderCategories(dto);
  }

  @Patch('categories/:categoryId')
  @RequirePermissions('catalog.manage')
  updateCategory(
    @Param('categoryId') categoryId: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.catalogService.updateCategory(categoryId, dto);
  }

  @Delete('categories/:categoryId')
  @RequirePermissions('catalog.manage')
  removeCategory(@Param('categoryId') categoryId: string) {
    return this.catalogService.removeCategory(categoryId);
  }

  @Post('products')
  @RequirePermissions('catalog.manage')
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalogService.createProduct(dto);
  }

  @Patch('products/:productId')
  @RequirePermissions('catalog.manage')
  updateProduct(
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalogService.updateProduct(productId, dto);
  }

  @Delete('products/:productId')
  @RequirePermissions('catalog.manage')
  removeProduct(@Param('productId') productId: string) {
    return this.catalogService.removeProduct(productId);
  }
}
