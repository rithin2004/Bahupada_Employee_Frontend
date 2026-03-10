import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.auth import (
    AuthUserInfo,
    get_current_auth_info,
    require_any_portal,
    require_employee_or_admin_portal,
    require_permission,
)
from app.db.session import get_db
from app.models.entities import Employee, EmployeeRole
from app.schemas.delivery_workflow import (
    DeliveryRunAllocateRequest,
    DeliveryRunStopActionRequest,
    InvoiceBatchAssignRequest,
    InvoiceDocumentUpdateRequest,
    InvoiceExecutionUpdateRequest,
    InvoicePackingOutputRequest,
    InvoiceSupervisorDecisionRequest,
    NotificationReadRequest,
)
from app.services.delivery_workflow import (
    allocate_delivery_run,
    assign_invoices_to_packers,
    current_runs_for_bill_manager,
    current_runs_for_delivery_helper,
    current_runs_for_driver,
    current_runs_for_supervisor,
    deliver_run_stop,
    get_batch_invoice_detail,
    get_batch_detail,
    get_delivery_run_detail,
    list_batches,
    list_delivery_runs,
    list_notifications,
    mark_run_stop_loaded,
    mark_notifications_read,
    mark_ready_for_dispatch,
    my_packing_batches,
    not_deliver_run_stop,
    request_verification,
    start_delivery_run,
    supervisor_batches,
    update_invoice_documents,
    update_execution_items,
    update_packing_output,
    verify_batch_invoice,
    reject_batch_invoice,
)

router = APIRouter()


async def _require_employee(db: AsyncSession, info: AuthUserInfo) -> Employee:
    if not info.employee_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Employee access required")
    employee = await db.get(Employee, uuid.UUID(info.employee_id))
    if employee is None or not employee.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inactive employee")
    return employee


@router.post("/invoice-batches/assign", dependencies=[Depends(require_permission("delivery", "create"))])
async def assign_invoice_batch(
    payload: InvoiceBatchAssignRequest,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    try:
        return await assign_invoices_to_packers(
            db,
            invoice_ids=payload.sales_final_invoice_ids,
            created_by_user_id=uuid.UUID(info.user_id),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/delivery-runs/allocate", dependencies=[Depends(require_permission("delivery", "create"))])
async def allocate_vehicle_run(
    payload: DeliveryRunAllocateRequest,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    try:
        return await allocate_delivery_run(
            db,
            invoice_ids=payload.sales_final_invoice_ids,
            delivery_date=payload.delivery_date,
            vehicle_id=payload.vehicle_id,
            created_by_user_id=uuid.UUID(info.user_id),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/delivery-runs", dependencies=[Depends(require_permission("delivery", "read"))])
async def get_delivery_runs(
    warehouse_id: uuid.UUID | None = Query(None),
    status_filter: str | None = Query(None),
    delivery_date: date | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    return {"items": await list_delivery_runs(db, warehouse_id=warehouse_id, status_filter=status_filter, delivery_date=delivery_date)}


@router.get("/invoice-batches", dependencies=[Depends(require_permission("delivery", "read"))])
async def list_invoice_batches(
    warehouse_id: uuid.UUID | None = Query(None),
    workflow_status: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    _info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    return {"items": await list_batches(db, warehouse_id=warehouse_id, status_filter=workflow_status)}


@router.get("/invoice-batches/{batch_id}", dependencies=[Depends(require_permission("delivery", "read"))])
async def get_invoice_batch(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    try:
        return await get_batch_detail(db, batch_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/invoice-batches/{batch_id}/invoices", dependencies=[Depends(require_permission("delivery", "read"))])
async def list_invoice_batch_invoices(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    try:
        detail = await get_batch_detail(db, batch_id)
        return {"items": detail.get("invoices", [])}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/my-packing-batches")
async def list_my_packer_batches(
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    if employee.role not in {EmployeeRole.PACKER, EmployeeRole.SUPERVISOR, EmployeeRole.ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Packing access denied")
    if employee.role == EmployeeRole.SUPERVISOR:
        return {"items": await supervisor_batches(db, employee_id=employee.id)}
    return {"items": await my_packing_batches(db, employee_id=employee.id)}


@router.get("/my-packing-batches/{batch_id}")
async def get_my_packing_batch(
    batch_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    try:
        detail = await get_batch_detail(db, batch_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if employee.role != EmployeeRole.ADMIN:
        visible = [
            invoice
            for invoice in detail.get("invoices", [])
            if str(invoice.get("assigned_packer_id")) == str(employee.id)
            or str(invoice.get("assigned_supervisor_id")) == str(employee.id)
        ]
        detail["invoices"] = visible
        detail["invoice_count"] = len(visible)
    return detail


@router.patch("/batch-invoices/{batch_invoice_id}/execution")
async def patch_execution_items(
    batch_invoice_id: uuid.UUID,
    payload: InvoiceExecutionUpdateRequest,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    try:
        return await update_execution_items(
            db,
            batch_invoice_id=batch_invoice_id,
            items=[item.model_dump() for item in payload.items],
            employee_id=employee.id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/batch-invoices/{batch_invoice_id}/request-verification")
async def submit_request_verification(
    batch_invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    try:
        return await request_verification(db, batch_invoice_id=batch_invoice_id, employee_id=employee.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/batch-invoices/{batch_invoice_id}/packing-output")
async def patch_packing_output(
    batch_invoice_id: uuid.UUID,
    payload: InvoicePackingOutputRequest,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    try:
        return await update_packing_output(
            db,
            batch_invoice_id=batch_invoice_id,
            employee_id=employee.id,
            total_boxes_or_bags=payload.total_boxes_or_bags,
            loose_cases=payload.loose_cases,
            full_cases=payload.full_cases,
            packing_note=payload.packing_note,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/batch-invoices/{batch_invoice_id}/ready-for-dispatch")
async def move_ready_to_dispatch(
    batch_invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    try:
        return await mark_ready_for_dispatch(db, batch_invoice_id=batch_invoice_id, employee_id=employee.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/supervisor/pending-batches")
async def list_supervisor_pending_batches(
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    if employee.role not in {EmployeeRole.SUPERVISOR, EmployeeRole.ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Supervisor access required")
    return {"items": await supervisor_batches(db, employee_id=employee.id)}


@router.get("/delivery-runs/supervisor/current")
async def get_supervisor_current_runs(
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    if employee.role not in {EmployeeRole.SUPERVISOR, EmployeeRole.ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Supervisor access required")
    return {"items": await current_runs_for_supervisor(db, employee_id=employee.id)}


@router.post("/delivery-runs/stops/{stop_id}/mark-loaded")
async def mark_delivery_stop_loaded(
    stop_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    try:
        return await mark_run_stop_loaded(db, stop_id=stop_id, employee_id=employee.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/supervisor/batch-invoices/{batch_invoice_id}")
async def get_supervisor_batch_invoice(
    batch_invoice_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    if employee.role not in {EmployeeRole.SUPERVISOR, EmployeeRole.ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Supervisor access required")
    try:
        return await get_batch_invoice_detail(db, batch_invoice_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/delivery-runs/driver/current")
async def get_driver_current_runs(
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    if employee.role not in {EmployeeRole.DRIVER, EmployeeRole.DELIVERY_EMPLOYEE, EmployeeRole.ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Driver access required")
    return {"items": await current_runs_for_driver(db, employee_id=employee.id)}


@router.post("/delivery-runs/{run_id}/start")
async def start_driver_run(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    try:
        return await start_delivery_run(db, run_id=run_id, employee_id=employee.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/delivery-runs/bill-manager/current")
async def get_bill_manager_current_runs(
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    if employee.role not in {EmployeeRole.BILL_MANAGER, EmployeeRole.DELIVERY_EMPLOYEE, EmployeeRole.ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bill manager access required")
    return {"items": await current_runs_for_bill_manager(db, employee_id=employee.id)}


@router.get("/delivery-runs/delivery-helper/current")
async def get_delivery_helper_current_runs(
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    if employee.role not in {EmployeeRole.DELIVERY_EMPLOYEE, EmployeeRole.IN_VEHICLE_HELPER, EmployeeRole.LOADER, EmployeeRole.ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Delivery helper access required")
    return {"items": await current_runs_for_delivery_helper(db, employee_id=employee.id)}


@router.get("/delivery-runs/{run_id}", dependencies=[Depends(require_permission("delivery", "read"))])
async def get_delivery_run(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    try:
        return await get_delivery_run_detail(db, run_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/delivery-runs/{run_id}/stops", dependencies=[Depends(require_permission("delivery", "read"))])
async def get_delivery_run_stops(
    run_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    try:
        detail = await get_delivery_run_detail(db, run_id)
        return {"items": detail.get("stops", [])}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/delivery-runs/stops/{stop_id}/deliver")
async def deliver_stop(
    stop_id: uuid.UUID,
    payload: DeliveryRunStopActionRequest,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    try:
        return await deliver_run_stop(db, stop_id=stop_id, employee_id=employee.id, note=payload.note)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/delivery-runs/stops/{stop_id}/not-delivered")
async def mark_stop_not_delivered(
    stop_id: uuid.UUID,
    payload: DeliveryRunStopActionRequest,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    try:
        return await not_deliver_run_stop(
            db,
            stop_id=stop_id,
            employee_id=employee.id,
            failure_reason=payload.failure_reason or payload.note,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/supervisor/batch-invoices/{batch_invoice_id}/verify")
async def verify_invoice_for_packing(
    batch_invoice_id: uuid.UUID,
    payload: InvoiceSupervisorDecisionRequest,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    if employee.role not in {EmployeeRole.SUPERVISOR, EmployeeRole.ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Supervisor access required")
    try:
        return await verify_batch_invoice(db, batch_invoice_id=batch_invoice_id, user_id=uuid.UUID(info.user_id), note=payload.note)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/supervisor/batch-invoices/{batch_invoice_id}/reject")
async def reject_invoice_for_rework(
    batch_invoice_id: uuid.UUID,
    payload: InvoiceSupervisorDecisionRequest,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    employee = await _require_employee(db, info)
    if employee.role not in {EmployeeRole.SUPERVISOR, EmployeeRole.ADMIN}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Supervisor access required")
    try:
        return await reject_batch_invoice(db, batch_invoice_id=batch_invoice_id, user_id=uuid.UUID(info.user_id), note=payload.note)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.patch("/sales-final-invoices/{invoice_id}/documents", dependencies=[Depends(require_permission("delivery", "update"))])
async def patch_sales_final_invoice_documents(
    invoice_id: uuid.UUID,
    payload: InvoiceDocumentUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _info: AuthUserInfo = Depends(require_employee_or_admin_portal),
):
    try:
        return await update_invoice_documents(
            db,
            invoice_id=invoice_id,
            e_invoice_number=payload.e_invoice_number,
            gst_invoice_number=payload.gst_invoice_number,
            eway_bill_number=payload.eway_bill_number,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/notifications")
async def get_notifications(
    unread_only: bool = Query(False),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_any_portal),
):
    return {"items": await list_notifications(db, user_id=uuid.UUID(info.user_id), unread_only=unread_only, limit=limit)}


@router.post("/notifications/{notification_id}/read")
async def read_notification(
    notification_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_any_portal),
):
    count = await mark_notifications_read(db, user_id=uuid.UUID(info.user_id), notification_ids=[notification_id])
    return {"updated": count}


@router.post("/notifications/read-all")
async def read_all_notifications(
    payload: NotificationReadRequest,
    db: AsyncSession = Depends(get_db),
    info: AuthUserInfo = Depends(require_any_portal),
):
    count = await mark_notifications_read(db, user_id=uuid.UUID(info.user_id), notification_ids=payload.notification_ids)
    return {"updated": count}
