/**
 * Spine routes (Phase 1D): the public 151-grid + a per-pokemon detail page that
 * routes a visitor toward the video / workbench. Anyone may VIEW; logging (1E)
 * is what requires an account, so these routes are intentionally ungated.
 *
 * Shell-only for now — Hono JSX + htmx, no Angular (that's the workbench island,
 * 1E). Sprites come from the PokéAPI dex CDN by dex number.
 */
import { Hono } from "hono";

import type { AppEnv } from "../auth/middleware";
import { db } from "../db/client";
import { getPokemonDetail, getSpine, type RunStatus, type SpineCell } from "../db/queries/spine";
import { Layout } from "../web/layout.tsx";

export const spineRoutes = new Hono<AppEnv>();

const SPRITE_CDN = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon";

function spriteUrl(dex: number): string {
  return `${SPRITE_CDN}/${dex}.png`;
}

function titleCase(name: string): string {
  return name
    .split(/[\s-]/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

const STATUS_LABEL: Record<RunStatus, string> = {
  untouched: "Untouched",
  in_progress: "In progress",
  done: "Done",
  impossible_abandoned: "Abandoned",
};

// Styles live in /static/app.css (linked by Layout). Status drives the cell
// color through the `data-status` attribute; the video dot via `.vid-dot`.
function Cell({ cell }: { cell: SpineCell }) {
  return (
    <li>
      <a
        class="spine-cell"
        data-status={cell.status}
        href={`/pokemon/${cell.dex}`}
        title={`${titleCase(cell.name)} — ${STATUS_LABEL[cell.status]}`}
      >
        {cell.videoCount > 0 ? <span class="vid-dot" /> : null}
        <span class="dex">#{cell.dex}</span>
        <img src={spriteUrl(cell.dex)} alt="" loading="lazy" />
        <span class="name">{titleCase(cell.name)}</span>
      </a>
    </li>
  );
}

spineRoutes.get("/", (c) => {
  const sort = c.req.query("sort") === "playlist" ? "playlist" : "dex";
  const cells = getSpine(db, sort);
  return c.html(
    <Layout title="Spine" user={c.get("user")}>
      <h1>The 151</h1>
      <div class="spine-toolbar">
        Sort:{" "}
        <a href="/?sort=dex" aria-current={sort === "dex" ? "true" : "false"}>
          Dex
        </a>
        <a href="/?sort=playlist" aria-current={sort === "playlist" ? "true" : "false"}>
          Playlist
        </a>
        <span style="opacity:.6"> · blue dot = has video</span>
      </div>
      <ul class="spine-grid">
        {cells.map((cell) => (
          <Cell cell={cell} />
        ))}
      </ul>
    </Layout>,
  );
});

spineRoutes.get("/pokemon/:dex", (c) => {
  const dex = Number(c.req.param("dex"));
  const detail = Number.isInteger(dex) ? getPokemonDetail(db, dex) : null;
  if (!detail) return c.notFound();

  const user = c.get("user");
  return c.html(
    <Layout title={titleCase(detail.name)} user={user}>
      <p>
        <a href="/">← The 151</a>
      </p>
      <h1>
        #{detail.dex} {titleCase(detail.name)}
      </h1>
      <p>
        Status: <strong>{STATUS_LABEL[detail.status]}</strong>
      </p>

      <h2>Videos</h2>
      {detail.videos.length === 0 ? (
        <p>No videos linked yet.</p>
      ) : (
        <ul>
          {detail.videos.map((v) => (
            <li>
              <a href={v.url ?? `https://youtu.be/${v.youtubeId}`} target="_blank" rel="noreferrer">
                {v.title ?? `Video ${v.videoId}`}
              </a>
              {detail.videos.filter((x) => x.runId === v.runId).length > 1
                ? ` (part ${v.partNo})`
                : ""}
            </li>
          ))}
        </ul>
      )}

      <p>
        {user ? (
          // Workbench is Phase 1E — link is a placeholder until the island ships.
          <em>Logging opens here once the workbench lands (Phase 1E).</em>
        ) : (
          <a href="/login">Log in to log this run</a>
        )}
      </p>
    </Layout>,
  );
});
