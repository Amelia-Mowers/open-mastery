# @openmastery/schema

The published curriculum spec for Cairn (MIT): Zod schemas for skill/item/
explanation files (with JSON Schema export), the cross-file bundle validator
and release gates, and `cairn-expr` — the total, side-effect-free template
mini-language (exact rationals, generator constraints, display rules).

```sh
nix develop        # or Node ≥ 24
npm install
npm test           # property-based spec (fast-check) + fixtures
npm run typecheck
node bin/validate.ts <dir...> [--profile authoring|release]
```
