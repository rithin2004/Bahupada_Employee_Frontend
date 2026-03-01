import asyncio
from sqlalchemy import text
from app.db.session import engine

async def explain_queries():
    async with engine.begin() as conn:
        print("Query 1: count *")
        res1 = await conn.execute(text("""
            EXPLAIN ANALYZE SELECT count(distinct sales_orders.id) AS count_1 
            FROM sales_orders 
            JOIN customers ON customers.id = sales_orders.customer_id 
            JOIN warehouses ON warehouses.id = sales_orders.warehouse_id 
            WHERE sales_orders.deleted_at IS NULL
        """))
        for row in res1:
            print(row[0])
            
        print("\nQuery 2: fetch page")
        res2 = await conn.execute(text("""
            EXPLAIN ANALYZE SELECT sales_orders.id AS id, sales_orders.invoice_number AS invoice_number, sales_orders.source AS source, sales_orders.status AS status, sales_orders.created_at AS created_at, sales_orders.customer_id AS customer_id, sales_orders.warehouse_id AS warehouse_id, customers.name AS customer_name, warehouses.name AS warehouse_name 
            FROM sales_orders 
            JOIN customers ON customers.id = sales_orders.customer_id 
            JOIN warehouses ON warehouses.id = sales_orders.warehouse_id 
            WHERE sales_orders.deleted_at IS NULL ORDER BY sales_orders.created_at DESC 
            LIMIT 50 OFFSET 0
        """))
        for row in res2:
            print(row[0])

if __name__ == "__main__":
    asyncio.run(explain_queries())
