import asyncio
from app.db.session import engine
import os

async def run_sql_file():
    print("Connecting...")
    with open("migrations/024_sales_order_latency_indexes.sql", "r") as f:
        sql = f.read()

    async with engine.begin() as conn:
        from sqlalchemy import text
        for statement in sql.split(';'):
            if statement.strip():
                print(f"Executing: {statement.strip()}")
                await conn.execute(text(statement.strip()))
                
    print("Done")

if __name__ == "__main__":
    asyncio.run(run_sql_file())
