# 01 — legwork

## Where the picker lives

- `client/src/app/pages/workbench.ts:285` — `filteredItems` computed. Today: `p.category.items`
  narrowed by the search string only. This is the modal picker (`workbench.html:165–193`).
- `client/src/app/pages/workbench.html:143` — the **catalog sidebar** iterates `c.items` directly
  and tags via `tagItem()` (`workbench.ts:451`). Filtering only `filteredItems` leaves every
  unlearnable move one click away in the sidebar. Both paths need it.
- `workbench.html:138` — `{{ loggedCount(c) }}/{{ c.items.length }}` is the visible count.
  That's the natural place for AC 2 to show up.

## Where the data has to come from

Learnset is `pokemon_moves` (`server/src/db/schema/domain.ts` → `pokemonMoves`), keyed by
`(pokemon_dex, move_id)`; `moves.catalog_item_id` bridges to core. 3886 rows over 165 moves.

`GET /api/catalog` (`server/src/routes/workbench.ts:34`) is **deliberately domain-blind** — its
own comment (`:65–67`) and the component docstring (`workbench.ts:61–62`) both say the catalog
and the field UI carry no Pokémon knowledge. Don't filter there.

`POST /api/logs/:videoId/open` (`workbench.ts:105`) is already domain-aware — it joins
`run_videos`/`runs`/`pokemon` at `:147–161` to return the `runs` array. **Recommended:** add the
learnable catalog-item ids per run to that same response. No extra round trip, `/api/catalog`
stays cacheable and generic, and the client already keys everything off `selectedRunId()`.

## Decisions the implementer will hit

- **Struggle must stay offered.** `LearnsetValidator.UNIVERSAL` (`domain-validators.ts:47`) and
  `UNIVERSAL_MOVES` (`db/seed/static-data.ts:148`, move id 165) exempt it — it's in no learnset.
  Filtering naively removes it and makes a legal claim untaggable.
- **Do NOT filter the `copied-move` field picker.** `flowItems` (`workbench.ts:294`) drives the
  catalog_ref field on mimic / mirror-move / metronome. Those copy the *opponent's* move, so the
  correct answer is usually outside the run's learnset. `LearnsetValidator` only inspects
  `event_claims` (`categorySlug === 'moves'`), never `claim_fields` values — so nothing rejects
  it today and nothing should start.
- **Multi-run videos.** `selectedRunId` is set only when `runs.length === 1`
  (`workbench.ts:318`); in a 2-run video it starts null, so there's no run to filter against.
  Either fall back to the unfiltered list while null, or default it to the first run — the latter
  is the fix already recorded in `out-of-scope.md` › "Multi-run workbench UI".
- Only the `moves` category (id 1) is filtered. `battles` (2) and `events` (3) untouched.

## Data for the acceptance criteria

Learnable-move counts in `server/data/app.db`: Ditto **1**, Metapod **1**, Kakuna **1**,
Mewtwo 43, Chansey 44, Mew **57**. Ditto vs Mew is the loudest pair for AC 2.

## Existing coverage

`server/reference/validation.test.ts:70,77` already covers `move-not-in-learnset` firing and not
firing (Bulbasaur learns tackle, not hydro-pump). AC 3 is a "don't break this" — those tests
staying green is the check.
