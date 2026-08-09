import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from "typeorm";

/**
 * Accounts and role-based access control: roles, the permissions granted to
 * each, and the people who sign in.
 *
 * Table/TableColumn builders rather than raw SQL, for the reason InitialSchema
 * spells out — hybrid mode runs this same schema on sqlite *and* postgres.
 *
 * No user is seeded. A shipped default credential is a backdoor that outlives
 * every installation that forgets to remove it, so the first account is created
 * on the machine, once, by the person sitting at it (see `auth:setup`).
 */
export class AuthRbac1785000000000 implements MigrationInterface {
  name = "AuthRbac1785000000000";

  private readonly roleNameKeyIndex = new TableIndex({
    name: "IDX_role_nameKey",
    columnNames: ["nameKey"],
    isUnique: true,
  });

  private readonly userEmailIndex = new TableIndex({
    name: "IDX_app_user_email",
    columnNames: ["email"],
    isUnique: true,
  });

  /**
   * A local copy of domain/products.ts's name folding, for the reason
   * ProductCatalog gives: a migration has to keep folding names the way it did
   * on the day it ran, even if the live rule later changes.
   */
  private normalizeName(name: string): string {
    return name.trim().replace(/\s+/g, " ").toLowerCase();
  }

  /**
   * The starter roles, with their permissions written out as literals.
   *
   * Literals, not an import from domain/permissions.ts, for the same reason:
   * this is a record of what was granted in this version, and it must not be
   * rewritten by a later edit to the catalog.
   *
   * Administrator is absent on purpose — it is seeded as a system role with no
   * grant rows at all, because `isSystem` resolves to the whole catalog at read
   * time. That is what lets a permission added in a future release reach the
   * owner without another migration. Every other role here is ordinary data:
   * rename it, re-scope it, or delete it.
   */
  private readonly seedRoles = [
    {
      name: "Manager",
      description: "Runs day-to-day operations, but can't manage people or storage",
      isSystem: false,
      permissions: [
        "dashboard:view",
        "invoice:create",
        "invoice:view",
        "invoice:delete",
        "customer:view",
        "customer:manage",
        "inventory:view",
        "inventory:manage",
        "settings:business",
      ],
    },
    {
      name: "Cashier",
      description: "Rings up sales at the counter",
      isSystem: false,
      permissions: ["invoice:create", "customer:view", "inventory:view"],
    },
    {
      name: "Accountant",
      description: "Reads the books; changes nothing",
      isSystem: false,
      permissions: ["dashboard:view", "invoice:view", "customer:view", "inventory:view"],
    },
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "role",
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
          { name: "description", type: "varchar", isNullable: true },
          { name: "isSystem", type: "boolean", default: false },
        ],
      }),
      true
    );

    await queryRunner.createIndex("role", this.roleNameKeyIndex);

    await queryRunner.createTable(
      new Table({
        name: "role_permission",
        columns: [
          { name: "roleId", type: "integer", isPrimary: true },
          { name: "permission", type: "varchar", isPrimary: true },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      "role_permission",
      new TableForeignKey({
        columnNames: ["roleId"],
        referencedTableName: "role",
        referencedColumnNames: ["id"],
        // Deleting a role takes its grants with it. The role itself is refused
        // while anyone still holds it — see domain/roles.ts.
        onDelete: "CASCADE",
      })
    );

    // "user" is a reserved word in postgres; "app_user" needs no quoting on
    // either engine, and hybrid mode has to run this schema on both.
    await queryRunner.createTable(
      new Table({
        name: "app_user",
        columns: [
          {
            name: "id",
            type: "integer",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          { name: "name", type: "varchar" },
          { name: "email", type: "varchar" },
          { name: "phone", type: "varchar", isNullable: true },
          { name: "avatar", type: "text", isNullable: true },
          { name: "passwordHash", type: "varchar" },
          { name: "roleId", type: "integer" },
          { name: "isActive", type: "boolean", default: true },
          { name: "mustChangePassword", type: "boolean", default: false },
          { name: "lastLoginAt", type: "datetime", isNullable: true },
          { name: "createdAt", type: "datetime", default: "CURRENT_TIMESTAMP" },
        ],
      }),
      true
    );

    await queryRunner.createIndex("app_user", this.userEmailIndex);

    await queryRunner.createForeignKey(
      "app_user",
      new TableForeignKey({
        columnNames: ["roleId"],
        referencedTableName: "role",
        referencedColumnNames: ["id"],
        // A role in use can't vanish underneath the people holding it.
        onDelete: "RESTRICT",
      })
    );

    await this.seed(queryRunner);
  }

  private async seed(queryRunner: QueryRunner): Promise<void> {
    const roles = [
      {
        name: "Administrator",
        description: "Full access, including users, roles and data storage",
        isSystem: true,
        permissions: [] as string[],
      },
      ...this.seedRoles,
    ];

    await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into("role", ["name", "nameKey", "description", "isSystem"])
      .values(
        roles.map((role) => ({
          name: role.name,
          nameKey: this.normalizeName(role.name),
          description: role.description,
          isSystem: role.isSystem,
        }))
      )
      .execute();

    const created = await queryRunner.manager
      .createQueryBuilder()
      .select("r.id", "id")
      .addSelect("r.nameKey", "nameKey")
      .from("role", "r")
      .getRawMany<{ id: number; nameKey: string }>();

    const idByKey = new Map(created.map((row) => [row.nameKey, Number(row.id)]));

    const grants = roles.flatMap((role) => {
      const roleId = idByKey.get(this.normalizeName(role.name));
      if (roleId === undefined) return [];
      return role.permissions.map((permission) => ({ roleId, permission }));
    });

    if (grants.length === 0) return;

    await queryRunner.manager
      .createQueryBuilder()
      .insert()
      .into("role_permission", ["roleId", "permission"])
      .values(grants)
      .execute();
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("app_user", this.userEmailIndex);
    await queryRunner.dropTable("app_user", true, true, true);
    await queryRunner.dropTable("role_permission", true, true, true);
    await queryRunner.dropIndex("role", this.roleNameKeyIndex);
    await queryRunner.dropTable("role", true, true, true);
  }
}
