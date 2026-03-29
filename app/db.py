import os
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

load_dotenv(".env.local")

DATABASE_URL = os.getenv("DATABASE_URL", "")

# asyncpg requires postgresql+asyncpg:// scheme
_async_url = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# statement_cache_size=0 is required for Supabase, which uses PgBouncer in
# transaction pooling mode — prepared statements are not supported in that mode.
engine = create_async_engine(
    _async_url,
    pool_pre_ping=True,
    connect_args={"statement_cache_size": 0},
)

AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
