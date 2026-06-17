#!/usr/bin/env python3
"""
schema_test.py  —  re-validation of the session-8 core/domain reshape
                   + the session-9 general `runs` model.

Mirrors the session-6 discipline: run constraint behaviour under REAL SQLite,
don't eyeball it.

Reshape (session 8):
  * Categories first-class + configurable (label/keybind/icon/required/
    timestamp_load_bearing). `kind` enum + mandatory-ness move OFF the table.
  * Core/domain split. Core event_claims points ONLY at a catalog_item (no
    move_id/gym_id/event_type). moves/gyms demote to DOMAIN lookups bridged by
    a UNIQUE catalog_item_id. One-way dep: every cross FK points domain->core.

Runs model (session 9 — "prepared for complexity"):
  * runs        — one Pokemon's solo attempt (the domain spine unit).
  * run_videos  — MANY-TO-MANY: a video hosts >=1 run (2-mon video); a run
                  spans >=1 video (multi-part). Junction with part_no.
  * claim_run   — DOMAIN annotation attributing a core claim to a run; needed
                  only when a video hosts >1 run (single-run videos imply it).
  * run_stats   — re-keyed per (log_id, run_id): a 2-run log carries 2 stat rows.
  * pokemon reverts to PURE reference; status/video link live on runs/run_videos.
  Core (videos/video_logs/event_claims) is UNCHANGED by all of this.

Run:  python3 schema_test.py     (exit 0 = all assertions held)
"""

import sqlite3, sys

# ---------------------------------------------------------------------------
# DDL — CORE  (unchanged by the runs model; generic video-logging engine)
# ---------------------------------------------------------------------------
CORE_DDL = r"""
CREATE TABLE users (
  id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','editor','admin')),
  points INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL
);
CREATE TABLE videos (                          -- generic identity; NO pokemon, NO run-status
  id INTEGER PRIMARY KEY,
  title TEXT, url TEXT, youtube_id TEXT, playlist_pos INTEGER, published_at TEXT,
  duration_sec REAL
);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
  keybind TEXT, icon TEXT,
  required INTEGER NOT NULL DEFAULT 0,
  timestamp_load_bearing INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE catalog_items (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  slug TEXT NOT NULL, label TEXT NOT NULL, description TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','active','retired')),
  UNIQUE (category_id, slug)
);
CREATE TABLE video_logs (
  id INTEGER PRIMARY KEY,
  user_id  INTEGER NOT NULL REFERENCES users(id),
  video_id INTEGER NOT NULL REFERENCES videos(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  UNIQUE (user_id, video_id)
);
CREATE TABLE coverage_spans (
  id INTEGER PRIMARY KEY,
  log_id INTEGER NOT NULL REFERENCES video_logs(id) ON DELETE CASCADE,
  start_sec REAL NOT NULL, end_sec REAL NOT NULL, CHECK (end_sec > start_sec)
);
CREATE TABLE event_claims (
  id INTEGER PRIMARY KEY,
  log_id INTEGER NOT NULL REFERENCES video_logs(id) ON DELETE CASCADE,
  catalog_item_id INTEGER NOT NULL REFERENCES catalog_items(id),
  timestamp_sec REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ix_claims_log     ON event_claims(log_id);
CREATE INDEX ix_claims_catalog ON event_claims(catalog_item_id);
"""

# ---------------------------------------------------------------------------
# DDL — DOMAIN (Pokemon). Every cross-boundary FK points INTO core.
# ---------------------------------------------------------------------------
DOMAIN_DDL = r"""
CREATE TABLE pokemon (                          -- PURE reference now
  dex INTEGER PRIMARY KEY,
  name TEXT NOT NULL, is_glitch INTEGER NOT NULL DEFAULT 0,
  type1 TEXT, type2 TEXT
);
CREATE TABLE runs (                             -- one Pokemon's solo attempt = the domain spine unit
  id INTEGER PRIMARY KEY,
  pokemon_dex INTEGER NOT NULL REFERENCES pokemon(dex),
  attempt_no INTEGER NOT NULL DEFAULT 1,        -- supports re-attempts
  status TEXT NOT NULL DEFAULT 'untouched'
    CHECK (status IN ('untouched','in_progress','done','impossible_abandoned')),
  UNIQUE (pokemon_dex, attempt_no)
);
CREATE TABLE run_videos (                        -- MANY-TO-MANY: video hosts >=1 run; run spans >=1 video
  run_id   INTEGER NOT NULL REFERENCES runs(id),
  video_id INTEGER NOT NULL REFERENCES videos(id),     -- domain -> core
  part_no  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (run_id, video_id)
);
CREATE TABLE claim_run (                         -- attributes a CORE claim to a run (domain annotation)
  claim_id INTEGER PRIMARY KEY REFERENCES event_claims(id) ON DELETE CASCADE,  -- domain -> core
  run_id   INTEGER NOT NULL REFERENCES runs(id)
);
CREATE TABLE moves (
  id INTEGER PRIMARY KEY,
  catalog_item_id INTEGER NOT NULL UNIQUE REFERENCES catalog_items(id),        -- bridge -> core
  name TEXT NOT NULL UNIQUE, category TEXT
);
CREATE TABLE gyms (
  id INTEGER PRIMARY KEY,
  catalog_item_id INTEGER NOT NULL UNIQUE REFERENCES catalog_items(id),        -- bridge -> core
  leader TEXT NOT NULL, city TEXT NOT NULL, canonical_order INTEGER NOT NULL UNIQUE
);
CREATE TABLE pokemon_moves (
  pokemon_dex INTEGER NOT NULL REFERENCES pokemon(dex),
  move_id     INTEGER NOT NULL REFERENCES moves(id),
  PRIMARY KEY (pokemon_dex, move_id)
);
CREATE TABLE run_stats (                         -- per (log, run): a 2-run log carries 2 rows
  log_id INTEGER NOT NULL REFERENCES video_logs(id) ON DELETE CASCADE,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  jrose_tier TEXT, tier_position INTEGER,
  final_level INTEGER, completion_sec REAL,
  brock_sec REAL, brock_estimated INTEGER NOT NULL DEFAULT 0,
  badge_boost_glitch INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (log_id, run_id)
);
"""

CORE_TABLES   = {"users","sessions","videos","categories","catalog_items",
                 "video_logs","coverage_spans","event_claims"}
DOMAIN_TABLES = {"pokemon","runs","run_videos","claim_run","moves","gyms",
                 "pokemon_moves","run_stats"}

# ---------------------------------------------------------------------------
PASS, FAIL, NOTES = 0, 0, []
def conn(fk=True):
    c = sqlite3.connect(":memory:")
    if fk: c.execute("PRAGMA foreign_keys = ON")
    return c
def ok(l):  global PASS; PASS += 1; print(f"  PASS  {l}")
def bad(l,d=""): global FAIL; FAIL += 1; print(f"  FAIL  {l}   {d}")
def expect_ok(c,sql,p=(),l=""):
    try: c.execute(sql,p); ok(l)
    except Exception as e: bad(l,f"unexpected reject: {e!r}")
def expect_reject(c,sql,p=(),l=""):
    try: c.execute(sql,p); bad(l,"expected reject, got none")
    except sqlite3.Error: ok(l)
def build(core=True, domain=True, fk=True):
    c = conn(fk)
    if core: c.executescript(CORE_DDL)
    if domain: c.executescript(DOMAIN_DDL)
    return c

def seed(c):
    """Single-run world: video 1 = Bulbasaur's run (done)."""
    c.execute("INSERT INTO videos(id,title,duration_sec) VALUES (1,'Bulbasaur solo',1800)")
    c.execute("INSERT INTO users(id,username,email,password_hash) VALUES (1,'jz','jz@x','h')")
    cats = [(1,'moves','Moves','m',0,0,1),(2,'gyms','Gyms','g',1,1,2),
            (3,'jokes','Jokes','j',0,1,3),(4,'battles','Battles','b',0,1,4)]
    c.executemany("INSERT INTO categories(id,slug,label,keybind,required,timestamp_load_bearing,sort_order) VALUES (?,?,?,?,?,?,?)",cats)
    gyms = ['brock','misty','surge','erika','koga','sabrina','blaine','giovanni']
    gym_items=[]
    cid=1
    for g in gyms:
        c.execute("INSERT INTO catalog_items(id,category_id,slug,label,status) VALUES (?,2,?,?, 'active')",(cid,g,g.title()))
        gym_items.append(cid); cid+=1
    tackle=cid; c.execute("INSERT INTO catalog_items(id,category_id,slug,label,status) VALUES (?,1,'tackle','Tackle','active')",(cid,)); cid+=1
    vine=cid;   c.execute("INSERT INTO catalog_items(id,category_id,slug,label,status) VALUES (?,1,'vine-whip','Vine Whip','active')",(cid,)); cid+=1
    joke=cid;   c.execute("INSERT INTO catalog_items(id,category_id,slug,label,status) VALUES (?,3,'nicknames-it','Nicknames it','active')",(cid,)); cid+=1
    c.execute("INSERT INTO pokemon(dex,name) VALUES (1,'Bulbasaur')")
    c.execute("INSERT INTO runs(id,pokemon_dex,attempt_no,status) VALUES (1,1,1,'done')")
    c.execute("INSERT INTO run_videos(run_id,video_id,part_no) VALUES (1,1,1)")
    for i,(g,iid) in enumerate(zip(gyms,gym_items),1):
        c.execute("INSERT INTO gyms(id,catalog_item_id,leader,city,canonical_order) VALUES (?,?,?,?,?)",(i,iid,g.title(),g.title()+' City',i))
    c.execute("INSERT INTO moves(id,catalog_item_id,name,category) VALUES (1,?,'tackle','physical')",(tackle,))
    c.execute("INSERT INTO moves(id,catalog_item_id,name,category) VALUES (2,?,'vine-whip','special')",(vine,))
    c.execute("INSERT INTO pokemon_moves(pokemon_dex,move_id) VALUES (1,1),(1,2)")
    c.execute("INSERT INTO video_logs(id,user_id,video_id,status) VALUES (1,1,1,'draft')")
    c.commit()
    return dict(gym_items=gym_items,tackle=tackle,vine=vine,joke=joke)

# resolution helpers (the domain validator's view) --------------------------
def runs_of_log(c, log_id):
    vid = c.execute("SELECT video_id FROM video_logs WHERE id=?",(log_id,)).fetchone()[0]
    return [r[0] for r in c.execute("SELECT run_id FROM run_videos WHERE video_id=?",(vid,))]
def run_of_claim(c, claim_id, log_id):
    row = c.execute("SELECT run_id FROM claim_run WHERE claim_id=?",(claim_id,)).fetchone()
    if row: return row[0]
    rs = runs_of_log(c, log_id)
    return rs[0] if len(rs)==1 else None   # None = ambiguous (multi-run video, unattributed)

# === core standalone (seam) ================================================
def test_core_standalone():
    print("\n[core standalone — runs model is domain-only; core unchanged]")
    c = build(domain=False)
    c.execute("INSERT INTO videos(id,title,duration_sec) VALUES (1,'v',100)")
    c.execute("INSERT INTO users(id,username,email,password_hash) VALUES (1,'u','e','h')")
    c.execute("INSERT INTO categories(id,slug,label) VALUES (5,'jokes','Jokes')")
    c.execute("INSERT INTO catalog_items(id,category_id,slug,label) VALUES (1,5,'x','X')")
    c.execute("INSERT INTO video_logs(id,user_id,video_id) VALUES (1,1,1)")
    expect_ok(c,"INSERT INTO event_claims(log_id,catalog_item_id,timestamp_sec) VALUES (1,1,5)",
              l="core accepts a claim with no domain/runs tables present")
    leak=[]
    for t in CORE_TABLES:
        for r in c.execute(f"PRAGMA foreign_key_list('{t}')").fetchall():
            if r[2] in DOMAIN_TABLES: leak.append((t,r[2]))
    ok("no core table references a domain table (incl. runs/run_videos/claim_run)") if not leak else bad("one-way dep",str(leak))

# === DB-enforced (verified reject) =========================================
def test_db_enforced():
    print("\n[DB-enforced — verified reject]")
    c=build(); ids=seed(c)
    expect_reject(c,"INSERT INTO event_claims(log_id,catalog_item_id,timestamp_sec) VALUES (1,NULL,5)",
                  l="event_claims.catalog_item_id NOT NULL (single target)")
    expect_reject(c,"INSERT INTO event_claims(log_id,catalog_item_id,timestamp_sec) VALUES (1,9999,5)",
                  l="event_claims.catalog_item_id FK enforced")
    expect_ok(c,"INSERT INTO event_claims(log_id,catalog_item_id,timestamp_sec) VALUES (1,?,5)",(ids['joke'],),
              l="valid claim accepted")
    expect_reject(c,"INSERT INTO coverage_spans(log_id,start_sec,end_sec) VALUES (1,50,10)",
                  l="coverage_spans end_sec>start_sec CHECK")
    expect_reject(c,"INSERT INTO catalog_items(category_id,slug,label) VALUES (2,'brock','dup')",
                  l="UNIQUE(category_id,slug)")
    expect_ok(c,"INSERT INTO catalog_items(category_id,slug,label) VALUES (1,'brock','move brock')",
              l="same slug different category allowed")

# === runs / run_videos / claim_run constraints =============================
def test_runs_model():
    print("\n[runs model — junction, attempts, attribution]")
    c=build(); ids=seed(c)
    # many-to-many both directions
    c.execute("INSERT INTO videos(id,title,duration_sec) VALUES (9,'Bulba part 2',1200)")
    expect_ok(c,"INSERT INTO run_videos(run_id,video_id,part_no) VALUES (1,9,2)",
              l="a run may span multiple videos (multi-part)")
    c.execute("INSERT INTO pokemon(dex,name) VALUES (4,'Charmander')")
    c.execute("INSERT INTO runs(id,pokemon_dex,status) VALUES (2,4,'done')")
    expect_ok(c,"INSERT INTO run_videos(run_id,video_id,part_no) VALUES (2,1,1)",
              l="a video may host multiple runs (2-mon video)")
    expect_reject(c,"INSERT INTO run_videos(run_id,video_id) VALUES (1,9)",
                  l="run_videos PK(run_id,video_id) rejects dup link")
    # re-attempts
    expect_reject(c,"INSERT INTO runs(pokemon_dex,attempt_no,status) VALUES (1,1,'done')",
                  l="UNIQUE(pokemon_dex,attempt_no) rejects dup attempt")
    expect_ok(c,"INSERT INTO runs(pokemon_dex,attempt_no,status) VALUES (1,2,'in_progress')",
              l="a Pokemon may have a second attempt (attempt_no=2)")
    # claim_run: one run per claim
    c.execute("INSERT INTO event_claims(id,log_id,catalog_item_id,timestamp_sec) VALUES (500,1,?,5)",(ids['joke'],))
    c.execute("INSERT INTO claim_run(claim_id,run_id) VALUES (500,1)")
    expect_reject(c,"INSERT INTO claim_run(claim_id,run_id) VALUES (500,2)",
                  l="claim_run PK(claim_id): a claim attributes to at most one run")
    expect_reject(c,"INSERT INTO claim_run(claim_id,run_id) VALUES (501,1)",
                  l="claim_run.claim_id FK enforced (no orphan attribution)")

# === run_stats per (log, run) ==============================================
def test_run_stats_perrun():
    print("\n[run_stats re-keyed per (log, run)]")
    c=build(); ids=seed(c)
    c.execute("INSERT INTO pokemon(dex,name) VALUES (4,'Charmander')")
    c.execute("INSERT INTO runs(id,pokemon_dex,status) VALUES (2,4,'done')")
    c.execute("INSERT INTO run_videos(run_id,video_id) VALUES (2,1)")   # 2-run video
    c.execute("INSERT INTO run_stats(log_id,run_id,completion_sec) VALUES (1,1,1500)")
    expect_ok(c,"INSERT INTO run_stats(log_id,run_id,completion_sec) VALUES (1,2,1700)",
              l="one log carries a stat row per run (2-mon video)")
    expect_reject(c,"INSERT INTO run_stats(log_id,run_id,completion_sec) VALUES (1,1,9)",
                  l="run_stats PK(log_id,run_id) rejects dup")

# === multiplicity unchanged ================================================
def test_multiplicity():
    print("\n[multiplicity — moves repeat, jokes repeat]")
    c=build(); ids=seed(c)
    c.execute("INSERT INTO event_claims(log_id,catalog_item_id,timestamp_sec) VALUES (1,?,30)",(ids['tackle'],))
    expect_ok(c,"INSERT INTO event_claims(log_id,catalog_item_id,timestamp_sec) VALUES (1,?,90)",(ids['tackle'],),
              l="same move twice in one log allowed")
    c.execute("INSERT INTO event_claims(log_id,catalog_item_id,timestamp_sec) VALUES (1,?,200)",(ids['joke'],))
    expect_ok(c,"INSERT INTO event_claims(log_id,catalog_item_id,timestamp_sec) VALUES (1,?,400)",(ids['joke'],),
              l="same joke twice in one log allowed")

# === reshape casualties (must be validators) ===============================
def test_cannot_be_db_constraints():
    print("\n[reshape casualties — what real SQLite refuses]")
    c=build()
    try:
        c.execute("""CREATE UNIQUE INDEX uq_gym ON event_claims(log_id,catalog_item_id)
                     WHERE catalog_item_id IN (SELECT id FROM catalog_items WHERE category_id=2)""")
        bad("partial-index subquery","SQLite accepted a subquery in partial index")
    except sqlite3.Error:
        ok("gym de-dup can't be a partial unique index (subquery in WHERE rejected)")
        NOTES.append("gym de-dup + completeness -> GymCompletenessValidator (now PER-RUN).")
    try:
        c.execute("CREATE TABLE probe (id INTEGER PRIMARY KEY, ts REAL, CHECK (ts <= (SELECT duration_sec FROM videos WHERE id=1)))")
        bad("cross-table CHECK","SQLite accepted a subquery in CHECK")
    except sqlite3.Error:
        ok("timestamp-bounds/learnset can't be CHECKs (subquery in CHECK rejected) -> backend")

# === cascade ===============================================================
def test_cascade():
    print("\n[ON DELETE CASCADE from video_logs reaches claim_run + run_stats]")
    c=build(); ids=seed(c)
    c.execute("INSERT INTO event_claims(id,log_id,catalog_item_id,timestamp_sec) VALUES (700,1,?,10)",(ids['joke'],))
    c.execute("INSERT INTO claim_run(claim_id,run_id) VALUES (700,1)")
    c.execute("INSERT INTO coverage_spans(log_id,start_sec,end_sec) VALUES (1,0,10)")
    c.execute("INSERT INTO run_stats(log_id,run_id,jrose_tier) VALUES (1,1,'A')")
    c.execute("DELETE FROM video_logs WHERE id=1")
    got=(c.execute("SELECT COUNT(*) FROM event_claims").fetchone()[0],
         c.execute("SELECT COUNT(*) FROM claim_run").fetchone()[0],
         c.execute("SELECT COUNT(*) FROM coverage_spans").fetchone()[0],
         c.execute("SELECT COUNT(*) FROM run_stats").fetchone()[0])
    ok("delete log cascades claims/claim_run/coverage/run_stats") if got==(0,0,0,0) else bad("cascade",str(got))

# === backend validators with run resolution ================================
def learnset_validator(c, log_id):
    viol=[]
    moves_cat=c.execute("SELECT id FROM categories WHERE slug='moves'").fetchone()[0]
    for (cid,ciid) in c.execute("""SELECT ec.id, ec.catalog_item_id FROM event_claims ec
            JOIN catalog_items ci ON ci.id=ec.catalog_item_id
            WHERE ec.log_id=? AND ci.category_id=?""",(log_id,moves_cat)):
        run=run_of_claim(c,cid,log_id)
        if run is None: viol.append(('ambiguous-run',cid)); continue
        dex=c.execute("SELECT pokemon_dex FROM runs WHERE id=?",(run,)).fetchone()[0]
        mv=c.execute("SELECT id FROM moves WHERE catalog_item_id=?",(ciid,)).fetchone()
        if not mv: viol.append(('move-not-in-catalog',ciid)); continue
        if not c.execute("SELECT 1 FROM pokemon_moves WHERE pokemon_dex=? AND move_id=?",(dex,mv[0])).fetchone():
            viol.append(('illegal-learnset-move',(run,mv[0])))
    return viol

def gym_completeness_validator(c, log_id):
    """PER-RUN now: every 'done' run on this log's video needs all 8 distinct gyms; no dups; abandoned waived."""
    gyms_cat=c.execute("SELECT id FROM categories WHERE slug='gyms'").fetchone()[0]
    by_run={}
    for (cid,ciid) in c.execute("""SELECT ec.id, ec.catalog_item_id FROM event_claims ec
            JOIN catalog_items ci ON ci.id=ec.catalog_item_id
            WHERE ec.log_id=? AND ci.category_id=?""",(log_id,gyms_cat)):
        run=run_of_claim(c,cid,log_id)
        by_run.setdefault(run,[]).append(ciid)
    viol=[]
    for run in runs_of_log(c,log_id):
        status=c.execute("SELECT status FROM runs WHERE id=?",(run,)).fetchone()[0]
        items=by_run.get(run,[])
        if len(items)!=len(set(items)): viol.append(('duplicate-gym',run))
        if status=='done' and len(set(items))!=8: viol.append(('gym-incomplete',(run,len(set(items)))))
    return viol

def test_validators_single_run():
    print("\n[validators — single-run video (run implied, no claim_run rows)]")
    c=build(); ids=seed(c)
    c.execute("INSERT INTO event_claims(log_id,catalog_item_id,timestamp_sec) VALUES (1,?,30)",(ids['tackle'],))
    ok("LearnsetValidator: legal move passes (run implied)") if learnset_validator(c,1)==[] else bad("learnset legal")
    c.execute("INSERT INTO catalog_items(id,category_id,slug,label,status) VALUES (60,1,'ember','Ember','active')")
    c.execute("INSERT INTO moves(id,catalog_item_id,name,category) VALUES (9,60,'ember','special')")
    c.execute("INSERT INTO event_claims(log_id,catalog_item_id,timestamp_sec) VALUES (1,60,40)")
    ok("LearnsetValidator: illegal move flagged") if any(v[0]=='illegal-learnset-move' for v in learnset_validator(c,1)) else bad("learnset illegal")
    for iid in ids['gym_items']:
        c.execute("INSERT INTO event_claims(log_id,catalog_item_id,timestamp_sec) VALUES (1,?,?)",(iid,100+iid))
    ok("GymCompletenessValidator: 8 distinct + run done passes") if gym_completeness_validator(c,1)==[] else bad("gym 8/done")
    c.execute("INSERT INTO event_claims(log_id,catalog_item_id,timestamp_sec) VALUES (1,?,999)",(ids['gym_items'][0],))
    ok("GymCompletenessValidator: duplicate gym flagged") if any(v[0]=='duplicate-gym' for v in gym_completeness_validator(c,1)) else bad("gym dup")

def test_validators_multi_run():
    print("\n[validators — 2-mon video (claim_run disambiguates; gym completeness PER run)]")
    c=build(); ids=seed(c)
    # video 2 hosts Charmander(run2) + Squirtle(run3), both done
    c.execute("INSERT INTO videos(id,title,duration_sec) VALUES (2,'Charmander+Squirtle',1800)")
    c.execute("INSERT INTO pokemon(dex,name) VALUES (4,'Charmander'),(7,'Squirtle')")
    c.execute("INSERT INTO runs(id,pokemon_dex,status) VALUES (2,4,'done'),(3,7,'done')")
    c.execute("INSERT INTO run_videos(run_id,video_id) VALUES (2,2),(3,2)")
    c.execute("INSERT INTO users(id,username,email,password_hash) VALUES (2,'u2','e2','h')")
    c.execute("INSERT INTO video_logs(id,user_id,video_id) VALUES (2,2,2)")
    # ember learnable by Charmander only
    c.execute("INSERT INTO catalog_items(id,category_id,slug,label,status) VALUES (60,1,'ember','Ember','active')")
    c.execute("INSERT INTO moves(id,catalog_item_id,name,category) VALUES (9,60,'ember','special')")
    c.execute("INSERT INTO pokemon_moves(pokemon_dex,move_id) VALUES (4,9),(7,1)")  # Char->ember, Squirtle->tackle
    # ember attributed to Charmander (legal)
    c.execute("INSERT INTO event_claims(id,log_id,catalog_item_id,timestamp_sec) VALUES (810,2,60,40)")
    c.execute("INSERT INTO claim_run(claim_id,run_id) VALUES (810,2)")
    # ember attributed to Squirtle (illegal)
    c.execute("INSERT INTO event_claims(id,log_id,catalog_item_id,timestamp_sec) VALUES (811,2,60,50)")
    c.execute("INSERT INTO claim_run(claim_id,run_id) VALUES (811,3)")
    # tackle with NO attribution in a 2-run video -> ambiguous
    c.execute("INSERT INTO event_claims(id,log_id,catalog_item_id,timestamp_sec) VALUES (812,2,?,60)",(ids['tackle'],))
    v=learnset_validator(c,2)
    ok("multi-run: ember->Charmander legal, ember->Squirtle illegal flagged") \
        if any(x[0]=='illegal-learnset-move' and x[1][0]==3 for x in v) and not any(x[0]=='illegal-learnset-move' and x[1][0]==2 for x in v) else bad("multi-run learnset",str(v))
    ok("multi-run: unattributed move claim flagged ambiguous") if any(x[0]=='ambiguous-run' for x in v) else bad("ambiguous",str(v))
    # gyms per run: give run2 all 8, run3 only 7
    for iid in ids['gym_items']:
        c.execute("INSERT INTO event_claims(id,log_id,catalog_item_id,timestamp_sec) VALUES (?,2,?,?)",(1000+iid,iid,100+iid))
        c.execute("INSERT INTO claim_run(claim_id,run_id) VALUES (?,2)",(1000+iid,))
    for iid in ids['gym_items'][:7]:
        c.execute("INSERT INTO event_claims(id,log_id,catalog_item_id,timestamp_sec) VALUES (?,2,?,?)",(2000+iid,iid,200+iid))
        c.execute("INSERT INTO claim_run(claim_id,run_id) VALUES (?,3)",(2000+iid,))
    g=gym_completeness_validator(c,2)
    ok("multi-run gyms: run2 complete, run3 (7) flagged incomplete independently") \
        if any(x[0]=='gym-incomplete' and x[1][0]==3 for x in g) and not any(x[0]=='gym-incomplete' and x[1][0]==2 for x in g) else bad("per-run gym",str(g))
    # abandon run3 -> waived
    c.execute("UPDATE runs SET status='impossible_abandoned' WHERE id=3")
    g2=gym_completeness_validator(c,2)
    ok("multi-run gyms: abandoning run3 waives its completeness") if not any(x[0]=='gym-incomplete' for x in g2) else bad("abandon waive",str(g2))

# === canonical queries =====================================================
def test_query_catalog():
    print("\n[canonical queries under runs model]")
    c=build(); ids=seed(c)
    order=[ids['gym_items'][i] for i in (1,0,2)]
    for k,iid in enumerate(order):
        c.execute("INSERT INTO event_claims(log_id,catalog_item_id,timestamp_sec) VALUES (1,?,?)",(iid,10*(k+1)))
    c.execute("INSERT INTO event_claims(log_id,catalog_item_id,timestamp_sec) VALUES (1,?,300)",(ids['joke'],))
    c.execute("INSERT INTO event_claims(log_id,catalog_item_id,timestamp_sec) VALUES (1,?,320)",(ids['tackle'],))
    c.execute("INSERT INTO run_stats(log_id,run_id,jrose_tier,completion_sec) VALUES (1,1,'A',1500)")
    c.commit()
    # per-Pokemon status board: runs ⋈ pokemon ⋈ (run_videos ⋈ videos)
    board=c.execute("""SELECT p.name, r.status, v.url FROM runs r
                       JOIN pokemon p ON p.dex=r.pokemon_dex
                       LEFT JOIN run_videos rv ON rv.run_id=r.id
                       LEFT JOIN videos v ON v.id=rv.video_id""").fetchall()
    ok("per-Pokemon status board (via runs)") if board and board[0][1]=='done' else bad("status board",str(board))
    n=c.execute("""SELECT COUNT(DISTINCT vl.video_id) FROM event_claims ec
                   JOIN video_logs vl ON vl.id=ec.log_id WHERE ec.catalog_item_id=?""",(ids['joke'],)).fetchone()[0]
    ok("count videos with joke X") if n==1 else bad("joke count",str(n))
    taken=[r[0] for r in c.execute("""SELECT ci.slug FROM event_claims ec
              JOIN catalog_items ci ON ci.id=ec.catalog_item_id
              WHERE ci.category_id=(SELECT id FROM categories WHERE slug='gyms') AND ec.log_id=1
              ORDER BY ec.timestamp_sec""")]
    ok("gym order taken via ORDER BY timestamp_sec") if taken==['misty','brock','surge'] else bad("gym order",str(taken))
    runs_used=c.execute("""SELECT COUNT(*) FROM event_claims WHERE catalog_item_id=?""",(ids['tackle'],)).fetchone()[0]
    ok("which runs used move X") if runs_used==1 else bad("move usage",str(runs_used))
    common=c.execute("""SELECT ci.slug,COUNT(DISTINCT vl.video_id) n FROM event_claims ec
                        JOIN catalog_items ci ON ci.id=ec.catalog_item_id
                        JOIN video_logs vl ON vl.id=ec.log_id
                        WHERE ci.category_id=(SELECT id FROM categories WHERE slug='jokes')
                        GROUP BY ci.id ORDER BY n DESC""").fetchall()
    ok("most common jokes") if common and common[0][0]=='nicknames-it' else bad("common jokes",str(common))
    ok("completion-time ranking (per-run rows)") if c.execute("SELECT run_id FROM run_stats ORDER BY completion_sec").fetchall() else bad("ranking")

# ---------------------------------------------------------------------------
if __name__=="__main__":
    print(f"SQLite engine: {sqlite3.sqlite_version}")
    test_core_standalone()
    test_db_enforced()
    test_runs_model()
    test_run_stats_perrun()
    test_multiplicity()
    test_cannot_be_db_constraints()
    test_cascade()
    test_validators_single_run()
    test_validators_multi_run()
    test_query_catalog()
    print(f"\n==== {PASS} passed, {FAIL} failed ====")
    if NOTES:
        print("\nReshape notes:")
        for n in NOTES: print(f"  - {n}")
    sys.exit(1 if FAIL else 0)
