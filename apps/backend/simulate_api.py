import asyncio
import time
from sqlalchemy import text, select
from app.db.session import engine, SessionLocal
from app.models.entities import Employee, RolePermission, Permission, Role
import uuid

async def simulate_api():
    print("Connecting...")
    async with SessionLocal() as db:
        start_time = time.time()
        
        # 1. Require permission dummy employee logic
        print("1. Require permission logic...")
        t0 = time.time()
        employee_id = "00000000-0000-0000-0000-000000000000" # dummy
        # Just selecting randomly from employees
        employee = (await db.execute(select(Employee).limit(1))).scalar_one_or_none()
        print(f"   Employee query took {time.time()-t0:.3f}s")
        
        if employee:
            t0 = time.time()
            stmt = (
                select(RolePermission)
                .join(Permission, Permission.id == RolePermission.permission_id)
                .join(Role, Role.id == RolePermission.role_id)
                .join(Employee, Employee.role_id == Role.id)
                .where(
                    Employee.id == employee.id,
                    Permission.module_name == "sales",
                    Permission.action_name == "read",
                )
                .limit(1)
            )
            record = (await db.execute(stmt)).scalar_one_or_none()
            print(f"   Role query took {time.time()-t0:.3f}s")
        
        # 2. Main query
        print("2. Main queries...")
        t0 = time.time()
        res1 = await db.execute(text("""
            SELECT count(*) AS count_1 
            FROM sales_orders 
            JOIN customers ON customers.id = sales_orders.customer_id 
            JOIN warehouses ON warehouses.id = sales_orders.warehouse_id 
            WHERE sales_orders.deleted_at IS NULL
        """))
        for row in res1: pass
        print(f"   Count query took {time.time()-t0:.3f}s")
        
        t0 = time.time()
        res2 = await db.execute(text("""
            SELECT sales_orders.id AS id, sales_orders.invoice_number AS invoice_number, sales_orders.source AS source, sales_orders.status AS status, sales_orders.created_at AS created_at, sales_orders.customer_id AS customer_id, sales_orders.warehouse_id AS warehouse_id, customers.name AS customer_name, warehouses.name AS warehouse_name 
            FROM sales_orders 
            JOIN customers ON customers.id = sales_orders.customer_id 
            JOIN warehouses ON warehouses.id = sales_orders.warehouse_id 
            WHERE sales_orders.deleted_at IS NULL ORDER BY sales_orders.created_at DESC 
            LIMIT 50 OFFSET 0
        """))
        order_ids = []
        for row in res2: 
            order_ids.append(row[0])
        print(f"   Fetch page took {time.time()-t0:.3f}s (Fetched {len(order_ids)} orders)")
        
        if order_ids:
            t0 = time.time()
            id_list = ','.join(f"'{x}'" for x in order_ids)
            res3 = await db.execute(text(f"""
                SELECT sales_order_items.sales_order_id, count(sales_order_items.id) AS count_1 
            FROM sales_order_items 
            WHERE sales_order_items.sales_order_id IN ({id_list}) 
            GROUP BY sales_order_items.sales_order_id
            """))
            for r in res3: pass
            print(f"   Items count took {time.time()-t0:.3f}s")
            
        print(f"Total time elapsed: {time.time()-start_time:.3f}s")

if __name__ == "__main__":
    asyncio.run(simulate_api())
