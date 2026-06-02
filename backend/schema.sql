-- FamilyRoot Database Schema
-- Gramps-compatible data model
-- All objects share: gramps_id, created_at, updated_at, privacy, change

PRAGMA journal_mode=WAL;
PRAGMA foreign_keys=ON;

-- ──────────────────────────────────────────
-- PLACES (hierarchical)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS places (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    gramps_id   TEXT UNIQUE,
    name        TEXT NOT NULL,
    place_type  TEXT,   -- city, county, country, parish, address, etc.
    latitude    REAL,
    longitude   REAL,
    parent_id   INTEGER REFERENCES places(id),
    code        TEXT,   -- postal/ISO code
    notes       TEXT,
    privacy     INTEGER DEFAULT 0,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

-- ──────────────────────────────────────────
-- SOURCES & REPOSITORIES
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS repositories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    gramps_id   TEXT UNIQUE,
    name        TEXT NOT NULL,
    repo_type   TEXT,   -- archive, library, website, personal collection, etc.
    address     TEXT,
    url         TEXT,
    notes       TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sources (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    gramps_id     TEXT UNIQUE,
    title         TEXT NOT NULL,
    author        TEXT,
    pubinfo       TEXT,
    abbrev        TEXT,
    repository_id INTEGER REFERENCES repositories(id),
    call_number   TEXT,
    notes         TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);

-- ──────────────────────────────────────────
-- CITATIONS (source + specific page/ref)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS citations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    gramps_id   TEXT UNIQUE,
    source_id   INTEGER REFERENCES sources(id),
    page        TEXT,   -- page number, folio, entry number, URL anchor
    confidence  INTEGER DEFAULT 2,  -- 0=very low … 4=very high
    date_text   TEXT,
    notes       TEXT,
    created_at  TEXT DEFAULT (datetime('now')),
    updated_at  TEXT DEFAULT (datetime('now'))
);

-- ──────────────────────────────────────────
-- MEDIA
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    gramps_id    TEXT UNIQUE,
    filename     TEXT NOT NULL,
    mime         TEXT,   -- image/jpeg, application/pdf, audio/mpeg, etc.
    description  TEXT,
    date_text    TEXT,
    date_year    INTEGER,
    path         TEXT,   -- relative path under /media/
    checksum     TEXT,
    width        INTEGER,
    height       INTEGER,
    exif_json    TEXT,   -- raw EXIF as JSON
    place_id     INTEGER REFERENCES places(id),
    notes        TEXT,
    privacy      INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
);

-- ──────────────────────────────────────────
-- EVENTS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    gramps_id    TEXT UNIQUE,
    event_type   TEXT NOT NULL,
    -- Types: Birth, Death, Marriage, Divorce, Burial, Baptism, Christening,
    --        Residence, Emigration, Immigration, Occupation, Education,
    --        Military Service, Property, Medical, Award, Custom
    date_text    TEXT,   -- raw string e.g. "Abt 1888", "Bet 1920 and 1925"
    date_year    INTEGER,
    date_month   INTEGER,
    date_day     INTEGER,
    date_sort    TEXT,   -- ISO-ish for sorting, nullable
    place_id     INTEGER REFERENCES places(id),
    description  TEXT,
    notes        TEXT,
    privacy      INTEGER DEFAULT 0,
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS event_citations (
    event_id    INTEGER REFERENCES events(id) ON DELETE CASCADE,
    citation_id INTEGER REFERENCES citations(id),
    PRIMARY KEY (event_id, citation_id)
);

CREATE TABLE IF NOT EXISTS event_media (
    event_id  INTEGER REFERENCES events(id) ON DELETE CASCADE,
    media_id  INTEGER REFERENCES media(id),
    region    TEXT,   -- JSON crop rect for referenced region in photo
    PRIMARY KEY (event_id, media_id)
);

-- ──────────────────────────────────────────
-- PERSONS
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS persons (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    gramps_id       TEXT UNIQUE,
    gender          TEXT DEFAULT 'U',   -- M, F, U, N (non-binary)
    -- Primary name stored inline for fast display
    name_given      TEXT,
    name_surname    TEXT,
    name_suffix     TEXT,
    name_prefix     TEXT,
    name_call       TEXT,   -- "call name" / nickname
    notes           TEXT,
    privacy         INTEGER DEFAULT 0,
    is_living       INTEGER DEFAULT 0,
    birth_year      INTEGER,  -- denorm for fast filtering
    death_year      INTEGER,  -- denorm for fast filtering
    birth_place     TEXT,     -- denorm for display
    primary_media_id INTEGER REFERENCES media(id),
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- Alternate names (maiden name, alias, religious name, etc.)
CREATE TABLE IF NOT EXISTS person_names (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id   INTEGER REFERENCES persons(id) ON DELETE CASCADE,
    name_type   TEXT DEFAULT 'Also Known As',  -- Birth Name, Married Name, Nickname, etc.
    given       TEXT,
    surname     TEXT,
    suffix      TEXT,
    prefix      TEXT,
    sort_name   TEXT,
    date_text   TEXT,
    notes       TEXT
);

-- Person ↔ Event (with role — e.g. primary, witness, officiant)
CREATE TABLE IF NOT EXISTS person_events (
    person_id   INTEGER REFERENCES persons(id) ON DELETE CASCADE,
    event_id    INTEGER REFERENCES events(id) ON DELETE CASCADE,
    role        TEXT DEFAULT 'Primary',
    PRIMARY KEY (person_id, event_id)
);

-- Person attributes (occupation, religion, nationality, physical desc, etc.)
CREATE TABLE IF NOT EXISTS person_attributes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id   INTEGER REFERENCES persons(id) ON DELETE CASCADE,
    attr_type   TEXT NOT NULL,  -- Occupation, Education, Religion, Height, etc.
    value       TEXT,
    date_text   TEXT,
    notes       TEXT,
    citation_id INTEGER REFERENCES citations(id)
);

CREATE TABLE IF NOT EXISTS person_media (
    person_id   INTEGER REFERENCES persons(id) ON DELETE CASCADE,
    media_id    INTEGER REFERENCES media(id),
    region      TEXT,   -- JSON face-crop region
    is_primary  INTEGER DEFAULT 0,
    PRIMARY KEY (person_id, media_id)
);

CREATE TABLE IF NOT EXISTS person_citations (
    person_id   INTEGER REFERENCES persons(id) ON DELETE CASCADE,
    citation_id INTEGER REFERENCES citations(id),
    PRIMARY KEY (person_id, citation_id)
);

-- ──────────────────────────────────────────
-- FAMILIES (couple + children unit)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS families (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    gramps_id       TEXT UNIQUE,
    rel_type        TEXT DEFAULT 'Married',   -- Married, Unmarried, Civil Union, Unknown
    father_id       INTEGER REFERENCES persons(id),
    mother_id       INTEGER REFERENCES persons(id),
    notes           TEXT,
    privacy         INTEGER DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS family_children (
    family_id       INTEGER REFERENCES families(id) ON DELETE CASCADE,
    child_id        INTEGER REFERENCES persons(id),
    frel            TEXT DEFAULT 'Birth',   -- Birth, Adopted, Stepchild, Foster, etc.
    mrel            TEXT DEFAULT 'Birth',
    PRIMARY KEY (family_id, child_id)
);

CREATE TABLE IF NOT EXISTS family_events (
    family_id   INTEGER REFERENCES families(id) ON DELETE CASCADE,
    event_id    INTEGER REFERENCES events(id) ON DELETE CASCADE,
    PRIMARY KEY (family_id, event_id)
);

CREATE TABLE IF NOT EXISTS family_media (
    family_id   INTEGER REFERENCES families(id) ON DELETE CASCADE,
    media_id    INTEGER REFERENCES media(id),
    PRIMARY KEY (family_id, media_id)
);

-- ──────────────────────────────────────────
-- TAGS (coloured labels, Gramps-compatible)
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT UNIQUE NOT NULL,
    color   TEXT DEFAULT '#888888',
    priority INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS object_tags (
    tag_id      INTEGER REFERENCES tags(id),
    object_type TEXT NOT NULL,  -- person, family, event, media, source
    object_id   INTEGER NOT NULL,
    PRIMARY KEY (tag_id, object_type, object_id)
);

-- ──────────────────────────────────────────
-- PLACES hierarchy aliases
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS place_names (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id  INTEGER REFERENCES places(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    lang      TEXT,
    date_text TEXT
);

-- ──────────────────────────────────────────
-- RESEARCHER / DB META
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS db_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);

INSERT OR IGNORE INTO db_meta VALUES
    ('db_version',  '1'),
    ('created_at',  datetime('now')),
    ('researcher',  ''),
    ('description', 'FamilyRoot database');

-- ──────────────────────────────────────────
-- INDEXES for common queries
-- ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_persons_surname   ON persons(name_surname);
CREATE INDEX IF NOT EXISTS idx_persons_birth     ON persons(birth_year);
CREATE INDEX IF NOT EXISTS idx_events_type       ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_year       ON events(date_year);
CREATE INDEX IF NOT EXISTS idx_person_events_p   ON person_events(person_id);
CREATE INDEX IF NOT EXISTS idx_person_events_e   ON person_events(event_id);
CREATE INDEX IF NOT EXISTS idx_families_father   ON families(father_id);
CREATE INDEX IF NOT EXISTS idx_families_mother   ON families(mother_id);
CREATE INDEX IF NOT EXISTS idx_family_children   ON family_children(child_id);
CREATE INDEX IF NOT EXISTS idx_media_year        ON media(date_year);
CREATE INDEX IF NOT EXISTS idx_object_tags       ON object_tags(object_type, object_id);
