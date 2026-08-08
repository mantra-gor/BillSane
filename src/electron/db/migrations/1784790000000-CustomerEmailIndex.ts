import { MigrationInterface, QueryRunner, TableIndex } from "typeorm";

// Email became a lookup key when the till started resolving returning customers
// before saving (a new number + a known address still finds the same person).
// Without this index every keystroke in the email box drives a table scan.
export class CustomerEmailIndex1784790000000 implements MigrationInterface {
  name = "CustomerEmailIndex1784790000000";

  private readonly index = new TableIndex({
    name: "IDX_customer_email",
    columnNames: ["email"],
  });

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Matching is exact so the index is actually used, which means stored
    // addresses have to be folded first. Raw SQL is safe here where the schema
    // builders aren't: UPDATE/LOWER and double-quoted identifiers are spelled
    // the same in sqlite and postgres.
    await queryRunner.query(
      `UPDATE "customer" SET "email" = LOWER("email") WHERE "email" IS NOT NULL`
    );
    await queryRunner.createIndex("customer", this.index);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("customer", this.index);
  }
}
