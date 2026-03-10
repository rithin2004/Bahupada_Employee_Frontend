from fastapi import APIRouter, Depends

from app.api.routers import (
    auth,
    customer_portal,
    delivery,
    delivery_workflow,
    finance,
    masters,
    packing,
    payroll,
    planning,
    procurement,
    salesman,
    sales,
    schemes,
    system,
)
from app.api.routers.auth import require_admin_portal, require_module_access

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(masters.router, prefix="/masters", tags=["masters"], dependencies=[Depends(require_admin_portal)])
api_router.include_router(procurement.router, prefix="/procurement", tags=["procurement"], dependencies=[Depends(require_admin_portal)])
api_router.include_router(sales.router, prefix="/sales", tags=["sales"])
api_router.include_router(delivery_workflow.router, prefix="/delivery-workflow", tags=["delivery-workflow"])
api_router.include_router(packing.router, prefix="/packing", tags=["packing"], dependencies=[Depends(require_module_access("packing"))])
api_router.include_router(delivery.router, prefix="/delivery", tags=["delivery"], dependencies=[Depends(require_module_access("delivery"))])
api_router.include_router(finance.router, prefix="/finance", tags=["finance"], dependencies=[Depends(require_admin_portal)])
api_router.include_router(payroll.router, prefix="/payroll", tags=["payroll"], dependencies=[Depends(require_admin_portal)])
api_router.include_router(planning.router, prefix="/planning", tags=["planning"], dependencies=[Depends(require_module_access("planning"))])
api_router.include_router(schemes.router, prefix="/schemes", tags=["schemes"], dependencies=[Depends(require_module_access("schemes"))])
api_router.include_router(salesman.router, prefix="/salesman", tags=["salesman"], dependencies=[Depends(require_module_access("salesman"))])
api_router.include_router(customer_portal.router, prefix="/customer", tags=["customer"])
api_router.include_router(customer_portal.router, prefix="/customer-portal", tags=["customer"])
api_router.include_router(system.router, prefix="/system", tags=["system"], dependencies=[Depends(require_admin_portal)])
