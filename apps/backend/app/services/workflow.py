from app.models.entities import VoucherStatus


ALLOWED_VOUCHER_TRANSITIONS = {
    VoucherStatus.DRAFT.value: {VoucherStatus.CREATED.value, VoucherStatus.CANCELLED.value},
    VoucherStatus.CREATED.value: {VoucherStatus.POSTED.value, VoucherStatus.CANCELLED.value},
    VoucherStatus.POSTED.value: set(),
    VoucherStatus.CANCELLED.value: set(),
}


def normalize_status(value: str | None) -> str:
    return (value or "").strip().upper()


def assert_voucher_transition(current_status: str, target_status: str, entity: str) -> str:
    current = normalize_status(current_status)
    target = normalize_status(target_status)

    if current == target:
        return target

    allowed = ALLOWED_VOUCHER_TRANSITIONS.get(current)
    if allowed is None:
        raise ValueError(f"Unknown current status '{current_status}' for {entity}")

    if target not in allowed:
        raise ValueError(
            f"Invalid status transition for {entity}: {current} -> {target}. "
            f"Allowed: {', '.join(sorted(allowed)) or 'none'}"
        )

    return target
