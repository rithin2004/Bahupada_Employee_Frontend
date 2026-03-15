import asyncio

from sqlalchemy import select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.entities import AccountType, Employee, EmployeeRole, PortalScope, Role, Unit, User, Warehouse


async def seed() -> None:
    async with SessionLocal() as session:
        wh = (await session.execute(select(Warehouse).where(Warehouse.code == "WH-001"))).scalar_one_or_none()
        if wh is None:
            wh = Warehouse(code="WH-001", name="Primary Warehouse")
            session.add(wh)
            await session.flush()

        for unit_name in ("PCS", "BOX", "CASE", "KG", "LTR"):
            existing_unit = (await session.execute(select(Unit).where(Unit.unit_name == unit_name))).scalar_one_or_none()
            if existing_unit is None:
                session.add(Unit(unit_name=unit_name))

        admin_role = (await session.execute(select(Role).where(Role.role_name == EmployeeRole.ADMIN.value))).scalar_one_or_none()
        if admin_role is None:
            admin_role = Role(
                role_name=EmployeeRole.ADMIN.value,
                portal_scope=PortalScope.ADMIN,
                description="System administrator",
                is_active=True,
            )
            session.add(admin_role)
            await session.flush()

        admin_emp = (
            await session.execute(select(Employee).where(Employee.phone == "9999999999"))
        ).scalar_one_or_none()
        if admin_emp is None:
            admin_emp = Employee(
                warehouse_id=wh.id,
                role_id=admin_role.id,
                full_name="System Admin",
                name="System Admin",
                role=EmployeeRole.ADMIN,
                phone="9999999999",
            )
            session.add(admin_emp)
            await session.flush()
        elif admin_emp.role_id is None:
            admin_emp.role_id = admin_role.id
        if not admin_emp.name:
            admin_emp.name = admin_emp.full_name

        admin_user = (await session.execute(select(User).where(User.email == "admin@bahu.local"))).scalar_one_or_none()
        if admin_user is None:
            session.add(
                User(
                    employee_id=admin_emp.id,
                    account_type=AccountType.EMPLOYEE,
                    email="admin@bahu.local",
                    phone="9999999999",
                    username="admin",
                    password_hash=hash_password("ChangeMe@123"),
                    is_super_admin=True,
                    is_active=True,
                )
            )
        elif admin_user.username is None:
            admin_user.username = "admin"
        else:
            admin_user.is_super_admin = True

        await session.commit()


if __name__ == "__main__":
    asyncio.run(seed())
