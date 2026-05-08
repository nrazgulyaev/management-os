# Developer leakage

9 page(s) surface developer instructions to operators:

- `/dashboard/system/health` — npm run db:migrate | db:migrate
- `/development-os/commitments` — npm run db:seed:dev-os | db:seed
- `/development-os/finance` — npm run db:seed:dev-os | db:seed
- `/development-os/finance/bank-accounts` — npm run db:seed:dev-os | db:seed
- `/development-os/finance/categories` — npm run db:seed:dev-os | db:seed
- `/development-os/finance/tax-types` — npm run db:seed:dev-os | db:seed
- `/development-os/investors` — npm run db:seed:dev-os | db:seed
- `/development-os/materials` — npm run db:seed:dev-os | db:seed
- `/development-os/safety` — npm run db:seed:dev-os | db:seed

Pattern: messages like "Run `npm run db:seed dev` to populate this table" need replacement with an operator-meaningful CTA ("Add your first {entity}" or "Import from spreadsheet").
