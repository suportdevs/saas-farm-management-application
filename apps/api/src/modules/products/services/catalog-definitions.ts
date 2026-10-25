import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../../core';
import { Catalog } from './catalog.service';
import { brands, categories, colors, products, productSizes, sizes, units } from '../models';

// Defined in dependency order: a catalog can only reference ones above it.

export const unitCatalog = new Catalog({
  resource: 'units',
  table: units,
  fields: {
    key: units.key,
    name: units.name,
    shortName: units.shortName,
    description: units.description,
  },
  search: [units.name, units.shortName],
  unique: [
    { index: 'units_name_uq', column: units.name, field: 'name' },
    { index: 'units_short_name_uq', column: units.shortName, field: 'shortName' },
  ],
  usedBy: [
    { table: products, column: products.unitId, label: 'product' },
    { table: productSizes, column: productSizes.unitId, label: 'product size' },
  ],
});

export const sizeCatalog = new Catalog({
  resource: 'sizes',
  table: sizes,
  fields: {
    key: sizes.key,
    name: sizes.name,
    shortName: sizes.shortName,
    weight: sizes.weight,
    description: sizes.description,
  },
  search: [sizes.name, sizes.shortName],
  unique: [
    { index: 'sizes_name_uq', column: sizes.name, field: 'name' },
    { index: 'sizes_short_name_uq', column: sizes.shortName, field: 'shortName' },
  ],
  usedBy: [{ table: productSizes, column: productSizes.sizeId, label: 'product size' }],
});

export const colorCatalog = new Catalog({
  resource: 'colors',
  table: colors,
  fields: {
    key: colors.key,
    name: colors.name,
    code: colors.code,
    description: colors.description,
  },
  search: [colors.name, colors.code],
  unique: [{ index: 'colors_name_uq', column: colors.name, field: 'name' }],
});

export const brandCatalog = new Catalog({
  resource: 'brands',
  table: brands,
  fields: {
    key: brands.key,
    name: brands.name,
    code: brands.code,
    description: brands.description,
  },
  search: [brands.name, brands.code],
  unique: [
    { index: 'brands_name_uq', column: brands.name, field: 'name' },
    { index: 'brands_code_uq', column: brands.code, field: 'code' },
  ],
  usedBy: [{ table: products, column: products.brandId, label: 'product' }],
});

export const categoryCatalog = new Catalog({
  resource: 'categories',
  table: categories,
  fields: {
    key: categories.key,
    name: categories.name,
    code: categories.code,
    description: categories.description,
  },
  search: [categories.name, categories.code],
  unique: [
    { index: 'categories_name_uq', column: categories.name, field: 'name' },
    { index: 'categories_code_uq', column: categories.code, field: 'code' },
  ],
  usedBy: [{ table: products, column: products.categoryId, label: 'product' }],
});
export const productCatalog = new Catalog({
  resource: 'products',
  table: products,
  // Only the name and key of each reference — never the whole rows.
  fields: {
    key: products.key,
    name: products.name,
    code: products.code,
    status: products.status,
    description: products.description,
    image: products.image,
    categoryKey: categories.key,
    categoryName: categories.name,
    brandKey: brands.key,
    brandName: brands.name,
    unitKey: units.key,
    unitName: units.shortName,
  },
  joins: [
    { table: categories, on: eq(categories.id, products.categoryId) },
    { table: brands, on: eq(brands.id, products.brandId), left: true },
    { table: units, on: eq(units.id, products.unitId) },
  ],
  search: [products.name, products.code],
  unique: [{ index: 'products_code_uq', column: products.code, field: 'code' }],
  references: {
    categoryKey: {
      column: products.categoryId,
      catalog: categoryCatalog,
      matchBy: categories.code,
    },
    brandKey: { column: products.brandId, catalog: brandCatalog, matchBy: brands.code },
    unitKey: { column: products.unitId, catalog: unitCatalog, matchBy: units.shortName },
  },
  // A product's sizes go with it.
  cascade: [{ table: productSizes, column: productSizes.productId }],

  /** Every new product gets a default product size (no size) with its name, unit and status. */
  async onCreated(tx, tenantId, userId, rows) {
    await tx.insert(productSizes).values(
      rows.map((p) => ({
        tenantId,
        productId: p.id as number,
        unitId: p.unitId as number,
        name: p.name as string,
        status: p.status as number,
        createdBy: userId,
        updatedBy: userId,
      })),
    );
  },
});

export const productSizeCatalog = new Catalog({
  resource: 'product-sizes',
  table: productSizes,
  fields: {
    key: productSizes.key,
    name: productSizes.name,
    code: productSizes.code,
    status: productSizes.status,
    categoryKey: categories.key,
    categoryName: categories.name,
    productKey: products.key,
    productName: products.name,
    sizeKey: sizes.key,
    sizeName: sizes.name,
    unitKey: units.key,
    unitName: units.shortName,
  },
  joins: [
    { table: products, on: eq(products.id, productSizes.productId) },
    { table: categories, on: eq(categories.id, products.categoryId) },
    { table: sizes, on: eq(sizes.id, productSizes.sizeId), left: true },
    { table: units, on: eq(units.id, productSizes.unitId), left: true },
  ],
  search: [productSizes.name, productSizes.code],
  unique: [{ index: 'product_sizes_code_uq', column: productSizes.code, field: 'code' }],
  references: {
    productKey: { column: productSizes.productId, catalog: productCatalog, matchBy: products.code },
    sizeKey: { column: productSizes.sizeId, catalog: sizeCatalog, matchBy: sizes.shortName },
    unitKey: { column: productSizes.unitId, catalog: unitCatalog, matchBy: units.shortName },
  },
  virtualFilters: {
    // Product sizes whose product is in the category.
    category: (tenantId, key) =>
      inArray(
        productSizes.productId,
        db
          .select({ id: products.id })
          .from(products)
          .innerJoin(categories, eq(categories.id, products.categoryId))
          .where(and(eq(categories.tenantId, tenantId), eq(categories.key, key))),
      ),
  },
});

/** Mounted under /api/farms/:farm/products — sub-catalogs before products so their paths win. */
export const catalogs = [
  unitCatalog,
  sizeCatalog,
  colorCatalog,
  brandCatalog,
  categoryCatalog,
  productSizeCatalog,
  productCatalog,
];
