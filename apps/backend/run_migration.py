import asyncio
import sys
from app.db.session import engine

async def run_sql_file(filename: str):
    print(f"Reading {filename}...")
    with open(filename, "r") as f:
        sql = f.read()

    async with engine.begin() as conn:
        from sqlalchemy import text
        print(f"Executing content of {filename}...")
        await conn.execute(text(sql))
                
    print("Done")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_migration.py <sql_file>")
        sys.exit(1)
    asyncio.run(run_sql_file(sys.argv[1]))
