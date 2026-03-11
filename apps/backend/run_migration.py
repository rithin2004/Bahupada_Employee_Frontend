import asyncio
import sys
import os
import asyncpg

async def run_sql_file(filename: str):
    print(f"Reading {filename}...")
    with open(filename, "r") as f:
        sql = f.read()

    # Get database URL from environment or fallback
    # The container has DATABASE_URL in its env
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not found in environment")
        sys.exit(1)
        
    # asyncpg expects the URL in a certain format, but it usually handles the postgresql+asyncpg prefix by replacement
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    print(f"Connecting to database...")
    conn = await asyncpg.connect(db_url)
    try:
        print(f"Executing content of {filename} as a single transaction...")
        # asyncpg.execute() handles multiple statements perfectly
        await conn.execute(sql)
        print("Done")
    finally:
        await conn.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_migration.py <sql_file>")
        sys.exit(1)
    asyncio.run(run_sql_file(sys.argv[1]))
