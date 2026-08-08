import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

// Hand-written (not `synchronize: true`) using the cross-dialect Table/TableColumn
// builder API, deliberately - raw SQL strings are exactly where sqlite/postgres/mysql
// syntax diverges (AUTOINCREMENT vs SERIAL vs AUTO_INCREMENT, decimal type names, etc).
export class InitialSchema1784693224000 implements MigrationInterface {
  name = "InitialSchema1784693224000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "business",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          { name: "companyName", type: "varchar", default: "''" },
          { name: "phone", type: "varchar", default: "''" },
          { name: "email", type: "varchar", default: "''" },
          { name: "gstNo", type: "varchar", default: "''" },
          { name: "address", type: "varchar", default: "''" },
        ],
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: "customer",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          { name: "name", type: "varchar" },
          { name: "phone", type: "varchar", isUnique: true },
          { name: "email", type: "varchar", isNullable: true },
        ],
      }),
      true
    );

    await queryRunner.createTable(
      new Table({
        name: "invoice",
        columns: [
          { name: "id", type: "varchar", isPrimary: true, length: "36" },
          { name: "invoiceNo", type: "varchar", isUnique: true },
          { name: "date", type: "varchar" },
          { name: "createdAt", type: "datetime", default: "CURRENT_TIMESTAMP" },
          { name: "customerId", type: "integer" },
          { name: "totalAmount", type: "decimal", precision: 12, scale: 2, isNullable: true },
          { name: "totalTax", type: "decimal", precision: 12, scale: 2, isNullable: true },
          { name: "totalDiscount", type: "decimal", precision: 12, scale: 2, isNullable: true },
          { name: "paymentType", type: "varchar" },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      "invoice",
      new TableForeignKey({
        columnNames: ["customerId"],
        referencedTableName: "customer",
        referencedColumnNames: ["id"],
        onDelete: "RESTRICT",
      })
    );

    await queryRunner.createTable(
      new Table({
        name: "invoice_line_item",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          { name: "invoiceId", type: "varchar", length: "36" },
          { name: "itemName", type: "varchar", isNullable: true },
          { name: "taxType", type: "varchar", isNullable: true },
          { name: "rate", type: "decimal", precision: 12, scale: 2, isNullable: true },
          { name: "taxPer", type: "decimal", precision: 5, scale: 2, isNullable: true },
          { name: "qty", type: "decimal", precision: 12, scale: 2, isNullable: true },
          { name: "tax", type: "decimal", precision: 12, scale: 2, isNullable: true },
          { name: "subTotal", type: "decimal", precision: 12, scale: 2, isNullable: true },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      "invoice_line_item",
      new TableForeignKey({
        columnNames: ["invoiceId"],
        referencedTableName: "invoice",
        referencedColumnNames: ["id"],
        onDelete: "CASCADE",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("invoice_line_item", true, true, true);
    await queryRunner.dropTable("invoice", true, true, true);
    await queryRunner.dropTable("customer", true, true, true);
    await queryRunner.dropTable("business", true, true, true);
  }
}
