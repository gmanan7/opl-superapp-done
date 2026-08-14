// Shared database types — kept in lockstep with the LIVE schema only.
// Prototype-era interfaces that described tables/columns that never shipped
// (departments, jh_groups, asset_code, …) were purged in Phase 1 Step 3a.
// Hooks define their own row interfaces against verified SELECT strings;
// this file holds the cross-module enums and the MDM tables.
export {};
