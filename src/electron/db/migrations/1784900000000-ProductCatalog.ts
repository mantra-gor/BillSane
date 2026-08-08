import { MigrationInterface, QueryRunner, Table, TableColumn, TableForeignKey, TableIndex } from "typeorm";

/**
 * The product/service catalog, plus the link from a sold line back to it.
 *
 * Built with the Table/TableColumn builders rather than raw SQL for the reason
 * InitialSchema spells out: hybrid mode runs this same schema on sqlite *and*
 * postgres, and raw DDL is exactly where the two diverge.
 *
 * The backfill seeds the catalog from invoices already on file, so the counter's
 * dropdown isn't empty on the first launch after upgrading.
 */
export class ProductCatalog1784900000000 implements MigrationInterface {
  name = "ProductCatalog1784900000000";

  private readonly nameKeyIndex = new TableIndex({
    name: "IDX_product_nameKey",
    columnNames: ["nameKey"],
    isUnique: true,
  });

  private readonly skuIndex = new TableIndex({
    name: "IDX_product_sku",
    columnNames: ["sku"],
    isUnique: true,
  });

  /**
   * A local copy of domain/products.ts's name folding, on purpose.
   *
   * A migration is a historical record: it has to keep folding names the way it
   * did on the day it ran, even if the live rule is later relaxed or tightened.
   * Importing the domain helper would let a future edit silently rewrite what
   * this backfill did.
   */
  private displayName(name: string): string {
    return name.trim().replace(/\s+/g, " ");
  }

  private normalizeName(name: string): string {
    return this.displayName(name).toLowerCase();
  }

  /** DECIMAL round-trips as a string on pg and a number on better-sqlite3. */
  private num(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "product",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          { name: "name", type: "varchar" },
          { name: "nameKey", type: "varchar" },
          { name: "sku", type: "varchar", isNullable: true },
          { name: "kind", type: "varchar", default: "'product'" },
          { name: "hsnCode", type: "varchar", isNullable: true },
          { name: "unit", type: "varchar", default: "'pcs'" },
          { name: "rate", type: "decimal", precision: 12, scale: 2, isNullable: true },
          { name: "taxType", type: "varchar", isNullable: true },
          { name: "taxPer", type: "decimal", precision: 5, scale: 2, isNullable: true },
          { name: "stockQty", type: "decimal", precision: 12, scale: 2, isNullable: true },
          { name: "lowStockAt", type: "decimal", precision: 12, scale: 2, isNullable: true },
        ],
      }),
      true
    );

    // Created before the backfill so a normalization slip fails loudly here
    // rather than leaving two rows for one item.
    await queryRunner.createIndex("product", this.nameKeyIndex);
    await queryRunner.createIndex("product", this.skuIndex);

    await queryRunner.addColumn(
      "invoice_line_item",
      new TableColumn({ name: "productId", type: "integer", isNullable: true })
    );

    await queryRunner.createForeignKey(
      "invoice_line_item",
      new TableForeignKey({
        columnNames: ["productId"],
        referencedTableName: "product",
        referencedColumnNames: ["id"],
        onDelete: "SET NULL",
      })
    );

    await this.backfill(queryRunner);
  }

  /**
   * Turn every distinct item name already sold into a catalog row, then point
   * the lines that used it at that row.
   *
   * Done in TypeScript, not as one INSERT…SELECT, because collapsing inner
   * whitespace has no portable SQL spelling — postgres has regexp_replace and
   * sqlite doesn't — and a second, SQL-flavoured copy of the rule would drift.
   */
  private async backfill(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.manager
      .createQueryBuilder()
      .select("li.itemName", "itemName")
      .addSelect("li.rate", "rate")
      .addSelect("li.taxType", "taxType")
      .addSelect("li.taxPer", "taxPer")
      .from("invoice_line_item", "li")
      .innerJoin("invoice", "i", "i.id = li.invoiceId")
      .where("li.itemName IS NOT NULL")
      // Oldest first, so the last write per key wins and the catalog opens with
      // each item's most recent price.
      .orderBy("i.createdAt", "ASC")
      .getRawMany<{
        itemName: string;
        rate: unknown;
        taxType: string | null;
        taxPer: unknown;
      }>();

    interface Seed {
      name: string;
      nameKey: string;
      sku: null;
      kind: string;
      hsnCode: null;
      unit: string;
      rate: number | null;
      taxType: string | null;
      taxPer: number | null;
      stockQty: null;
      lowStockAt: null;
    }

    const seeds = new Map<string, Seed>();
    // Several spellings can fold to one key, and each of them still has to be
    // linkable by exact match later.
    const nameToKey = new Map<string, string>();

    for (const row of rows) {
      const nameKey = this.normalizeName(row.itemName);
      if (!nameKey) continue;
      nameToKey.set(row.itemName, nameKey);
      seeds.set(nameKey, {
        // Last spelling seen wins, tidied — same rule as the price below.
        name: this.displayName(row.itemName),
        nameKey,
        sku: null,
        kind: "product",
        hsnCode: null,
        unit: "pcs",
        rate: this.num(row.rate),
        taxType: row.taxType,
        taxPer: this.num(row.taxPer),
        // Nothing has been counted yet — the owner fills this in on the
        // Inventory page, and stock rules skip the item until they do.
        stockQty: null,
        lowStockAt: null,
      });
    }

    if (seeds.size === 0) return;

    await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into("product", [
        "name",
        "nameKey",
        "sku",
        "kind",
        "hsnCode",
        "unit",
        "rate",
        "taxType",
        "taxPer",
        "stockQty",
        "lowStockAt",
      ])
      .values([...seeds.values()])
      .execute();

    const created = await queryRunner.manager
      .createQueryBuilder()
      .select("p.id", "id")
      .addSelect("p.nameKey", "nameKey")
      .from("product", "p")
      .getRawMany<{ id: number; nameKey: string }>();

    const idByKey = new Map(created.map((row) => [row.nameKey, Number(row.id)]));

    for (const [itemName, nameKey] of nameToKey) {
      const productId = idByKey.get(nameKey);
      if (productId === undefined) continue;
      await queryRunner.manager
        .createQueryBuilder()
        .update("invoice_line_item")
        .set({ productId })
        .where("itemName = :itemName", { itemName })
        .execute();
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const lineItems = await queryRunner.getTable("invoice_line_item");
    const foreignKey = lineItems?.foreignKeys.find((fk) =>
      fk.columnNames.includes("productId")
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey("invoice_line_item", foreignKey);
    }
    await queryRunner.dropColumn("invoice_line_item", "productId");

    await queryRunner.dropIndex("product", this.skuIndex);
    await queryRunner.dropIndex("product", this.nameKeyIndex);
    await queryRunner.dropTable("product", true, true, true);
  }
}
