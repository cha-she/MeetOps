"""Database engine, session factory and the FastAPI dependency."""

from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


def make_engine(url: str = settings.database_url):
    is_sqlite = url.startswith("sqlite")
    # PostgreSQL: give up after 5 s with a clear error instead of waiting forever when the server is unreachable.
    engine = create_engine(url, pool_pre_ping=True,
                           connect_args={"check_same_thread": False} if is_sqlite else {"connect_timeout": 5})
    if is_sqlite:
        # SQLite ignores foreign keys unless asked; PostgreSQL enforces them always.
        @event.listens_for(engine, "connect")
        def _fk_on(dbapi_conn, _record):
            dbapi_conn.execute("PRAGMA foreign_keys=ON")
    return engine


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    from . import models  # noqa: F401  (registers the tables)
    Base.metadata.create_all(engine)
    add_missing_columns()


def add_missing_columns() -> None:
    """Minimal schema migration: add nullable columns that were introduced after a table was created.

    ``create_all`` creates missing tables but never alters existing ones, so a database made by an
    earlier version would lack new columns. Only nullable columns are added, so existing rows stay valid.
    """
    insp = inspect(engine)
    with engine.begin() as conn:
        for table in Base.metadata.sorted_tables:
            if not insp.has_table(table.name):
                continue
            present = {c["name"] for c in insp.get_columns(table.name)}
            for col in table.columns:
                if col.name not in present and col.nullable:
                    col_type = col.type.compile(dialect=engine.dialect)
                    conn.execute(text(f'ALTER TABLE {table.name} ADD COLUMN "{col.name}" {col_type}'))


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
