# Example files

## `inventory-import-example.csv`

The file Inventory → **Import** → **Download example file** hands the user. It is a
verbatim copy of `IMPORT_TEMPLATE_CSV` in
[productImport.ts](../src/electron/domain/productImport.ts), kept here so it can be
read without launching the app. **That constant is the source of truth** — regenerate
this copy after changing it rather than editing it by hand:

```bash
npm run transpile:electron
node --input-type=module -e "
  import fs from 'fs';
  import 'reflect-metadata';
  const { IMPORT_TEMPLATE_CSV } = await import('./dist-electron/domain/productImport.js');
  fs.writeFileSync('examples/inventory-import-example.csv', IMPORT_TEMPLATE_CSV);
"
```

Only **Item Name** is required. Every other column is optional, header spellings are
aliased generously (`Particulars`, `Qty`, `GST%`, `Reorder Level`, …), and a blank cell
means "leave whatever is already there alone" — so a sheet of just names and quantities
is a stock count and won't overwrite prices.
